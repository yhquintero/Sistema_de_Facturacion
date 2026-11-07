import {test,after} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {spawnSync} from 'node:child_process';import {createHash} from 'node:crypto';import JSZip from 'jszip';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'nexo-package-')),script=path.resolve('scripts/package-service.ts'),loader=import.meta.resolve('tsx');
after(()=>fs.rmSync(root,{recursive:true,force:true}));
const run=(cwd=root,args:string[]=[])=>spawnSync(process.execPath,['--import',loader,script,...args],{cwd,encoding:'utf8',timeout:15000});
test('service package is repeatable, manifest-verified, excludes private data and never overwrites',async()=>{
  for(const dir of ['src','server','data','secrets','public','dist','docs'])fs.mkdirSync(path.join(root,dir));
  for(const [file,text]of Object.entries({'src/App.tsx':'export default function App(){}','server/index.ts':'// example','.env.example':'APP_PASSWORD_HASH_FILE=./secrets/access.scrypt','.env':'DO_NOT_EXPORT=secret','data/facturacion.sqlite':'PRIVATE DATA','secrets/backup.key':'PRIVATE KEY','public/should-not-export.key':'SECRET','docs/guide.md':'Reviewed guide','dist/index.html':'<!doctype html>','README.md':'Public guide'}))fs.writeFileSync(path.join(root,file),text);
  assert.equal(run().status,0);assert.equal(run().status,0);const files=fs.readdirSync(path.join(root,'releases'));assert.equal(files.length,2);assert.notEqual(files[0],files[1]);
  const zip=await JSZip.loadAsync(fs.readFileSync(path.join(root,'releases',files[0]))),names=Object.keys(zip.files);assert.ok(names.includes('src/App.tsx'));assert.ok(names.includes('.env.example'));assert.equal(names.includes('.env'),false);assert.equal(names.some(n=>/secret|\.sqlite|\.key/i.test(n)),false);
  const manifest=JSON.parse(await zip.file('MANIFEST-SHA256.json')!.async('string'));assert.equal(manifest.includesBusinessData,false);for(const [name,record]of Object.entries(manifest.files)){const bytes=await zip.file(name)!.async('nodebuffer');assert.equal(createHash('sha256').update(bytes).digest('hex'),(record as {sha256:string}).sha256);}
  const existing=path.join(root,'releases',files[0]),hash=createHash('sha256').update(fs.readFileSync(existing)).digest('hex');assert.notEqual(run(root,['--output',existing]).status,0);assert.equal(createHash('sha256').update(fs.readFileSync(existing)).digest('hex'),hash);assert.notEqual(run(root,['--output',path.join(root,'wrong.sqlite')]).status,0);
});
test('embedded private-key markers and symlinked sources are rejected instead of packaged',()=>{
  const fixture=path.join(root,'leak-fixture');fs.mkdirSync(path.join(fixture,'src'),{recursive:true});fs.writeFileSync(path.join(fixture,'src/private.txt'),'-----BEGIN '+'PRIVATE KEY-----\nnot-real-just-test');assert.notEqual(run(fixture).status,0);fs.rmSync(path.join(fixture,'src/private.txt'));
  if(process.platform!=='win32'){fs.symlinkSync(path.join(root,'README.md'),path.join(fixture,'src/link.md'));const result=run(fixture);assert.notEqual(result.status,0);assert.match(result.stderr,/simbólicos/);}
});
