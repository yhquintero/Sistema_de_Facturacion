import {test,before,after} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import https from 'node:https';import {spawn,spawnSync,execFileSync} from 'node:child_process';
import {readConfig,loadTlsOptions,validateRuntime} from '../server/config';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'nexo-tls-')),cert=path.join(root,'leaf.crt'),key=path.join(root,'leaf.key');const available=spawnSync('openssl',['version']).status===0;
const env={NODE_ENV:'production',TLS_MODE:'direct',PUBLIC_ORIGIN:'https://localhost:8443',TLS_CERT_FILE:cert,TLS_KEY_FILE:key,DATA_CONTROLLER_NAME:'Prueba sintética',PRIVACY_CONTACT:'test@example.invalid',DATA_LOCATION_COUNTRY:'CU'};
before(()=>{if(available)execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-noenc','-keyout',key,'-out',cert,'-days','1','-subj','/CN=localhost','-addext','subjectAltName=DNS:localhost,IP:127.0.0.1'],{stdio:'ignore'});});after(()=>fs.rmSync(root,{recursive:true,force:true}));
const run=(args:string[])=>new Promise<{code:number|null;out:string}>(resolve=>{const child=spawn(process.execPath,args,{cwd:process.cwd()});let out='';child.stdout.on('data',v=>out+=v);child.stderr.on('data',v=>out+=v);child.on('close',code=>resolve({code,out}));});
test('direct TLS validates certificate/private key/SAN and limits protocols to 1.2/1.3',{skip:!available},()=>{
  const options=loadTlsOptions(readConfig(env));assert.equal(options.minVersion,'TLSv1.2');assert.equal(options.maxVersion,'TLSv1.3');assert.throws(()=>loadTlsOptions(readConfig({...env,PUBLIC_ORIGIN:'https://wrong.example.invalid'})),/no cubre/);assert.throws(()=>loadTlsOptions(readConfig({...env,TLS_KEY_FILE:cert})));assert.throws(()=>validateRuntime(readConfig({...env,TLS_CERT_FILE:''}),true),/exige TLS_CERT_FILE/);
});
test('HTTPS probe verifies trust chain and hostname rather than bypassing TLS; TLS 1.1 is rejected',{skip:!available},async()=>{
  const server=https.createServer(loadTlsOptions(readConfig(env)),(_req,res)=>{res.setHeader('Content-Type','application/json');res.end('{"ok":true}');});await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const url=`https://127.0.0.1:${(server.address() as {port:number}).port}`;
  try{const ok=await run(['--import','tsx','scripts/probe-https.ts','--url',url,'--ca',cert]);assert.equal(ok.code,0,ok.out);assert.match(ok.out,/verificados/);const untrusted=await run(['--import','tsx','scripts/probe-https.ts','--url',url]);assert.notEqual(untrusted.code,0);assert.match(untrusted.out,/self.signed|SELF_SIGNED|unable to verify/i);
    await assert.rejects(new Promise<void>((resolve,reject)=>{const request=https.get(url,{ca:fs.readFileSync(cert),minVersion:'TLSv1',maxVersion:'TLSv1.1'},res=>{res.resume();resolve();});request.on('error',reject);}));
  }finally{await new Promise<void>(r=>server.close(()=>r()));}
});
test('bad production TLS configuration stops bootstrap before creating any database',{skip:!available},()=>{
  const data=path.join(root,'should-not-exist');const result=spawnSync(process.execPath,['--import','tsx','server/index.ts','--production'],{encoding:'utf8',timeout:15_000,env:{...process.env,...env,APP_PASSWORD:'synthetic-only-long-test-secret',APP_PASSWORD_HASH_FILE:'',APP_PASSWORD_FILE:'',PUBLIC_ORIGIN:'https://wrong.example.invalid',DATA_DIR:data,ALLOW_PUBLIC_DEMO:'false'}});assert.notEqual(result.status,0);assert.match(result.stderr,/no cubre/);assert.equal(fs.existsSync(data),false);
});
