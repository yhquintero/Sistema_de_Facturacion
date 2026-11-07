import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { createEncryptedBackup, decryptBackupToNewFile, generateBackupKey } from '../server/security/backups';
const root = fs.mkdtempSync(path.join(os.tmpdir(),'nexo-backup-')), source = path.join(root,'source.sqlite'), key = path.join(root,'secrets','backup.key'), backups = path.join(root,'backups');
let db: DatabaseSync;
before(()=>{db=new DatabaseSync(source);db.exec('PRAGMA journal_mode=WAL; CREATE TABLE evidence(id INTEGER PRIMARY KEY, text TEXT);');db.prepare('INSERT INTO evidence(text) VALUES (?)').run('COMPROBANTE SINTETICO CONFIDENCIAL');generateBackupKey(key);});
after(()=>{db.close();fs.rmSync(root,{recursive:true,force:true});});
test('encrypted backup snapshots committed WAL data, authenticates, restores only to a new file and verifies SQLite', async()=>{
  fs.mkdirSync(backups,{mode:0o755}); const file=await createEncryptedBackup(source,backups,key); const ciphertext=fs.readFileSync(file);
  assert.equal(ciphertext.subarray(0,8).toString(),'NXBK0001');assert.equal(ciphertext.includes(Buffer.from('COMPROBANTE SINTETICO CONFIDENCIAL')),false);assert.equal(fs.readdirSync(backups).some(f=>f.includes('snapshot')),false);
  const sidecar=JSON.parse(fs.readFileSync(file+'.json','utf8'));assert.equal(sidecar.sha256,createHash('sha256').update(ciphertext).digest('hex'));assert.equal(sidecar.bytes,ciphertext.length);
  if(process.platform!=='win32'){assert.equal(fs.statSync(file).mode&0o777,0o600);assert.equal(fs.statSync(backups).mode&0o777,0o700);assert.equal(fs.statSync(key).mode&0o777,0o600);}
  const restored=path.join(root,'restored.sqlite');await decryptBackupToNewFile(file,restored,key);const copy=new DatabaseSync(restored,{readOnly:true});try{assert.equal(copy.prepare('SELECT text FROM evidence').get()?.text,'COMPROBANTE SINTETICO CONFIDENCIAL');}finally{copy.close();}
  await assert.rejects(decryptBackupToNewFile(file,restored,key),/NUEVO/);assert.equal(fs.existsSync(source),true);
});
test('backup tampering, truncation, wrong key and invalid header fail closed without publishing plaintext',async()=>{
  const file=await createEncryptedBackup(source,backups,key), bytes=fs.readFileSync(file), wrong=path.join(root,'wrong.key');generateBackupKey(wrong);
  await assert.rejects(decryptBackupToNewFile(file,path.join(root,'wrong.sqlite'),wrong));assert.equal(fs.existsSync(path.join(root,'wrong.sqlite')),false);
  for(const [label,modified] of [['tamper',Buffer.from(bytes)],['truncated',bytes.subarray(0,25)],['header',Buffer.alloc(40)]] as const){if(label==='tamper')modified[modified.length-1]^=1;const bad=path.join(root,label+'.nxb'),output=path.join(root,label+'.sqlite');fs.writeFileSync(bad,modified);await assert.rejects(decryptBackupToNewFile(bad,output,key));assert.equal(fs.existsSync(output),false);}
  assert.equal(fs.readdirSync(root).some(f=>f.startsWith('.restore-')),false);
});
test('key generation is exclusive, backup keys must be separate and malformed keys are rejected',async()=>{
  const original=fs.readFileSync(key);assert.throws(()=>generateBackupKey(key));assert.deepEqual(fs.readFileSync(key),original);
  const inside=path.join(backups,'forbidden.key');generateBackupKey(inside);await assert.rejects(createEncryptedBackup(source,backups,inside),/no puede guardarse/);
  const short=path.join(root,'short.key');fs.writeFileSync(short,'not-a-32-byte-key');await assert.rejects(createEncryptedBackup(source,backups,short),/32 bytes/);
});


test('encrypted and explicit lab backups retain accounts but exclude sessions without touching live sessions',async()=>{
  const directory=path.join(root,'accounts');fs.mkdirSync(directory,{mode:0o700});
  const active=path.join(directory,'facturacion.sqlite'),live=new DatabaseSync(active);
  try {
    live.exec("CREATE TABLE users(id TEXT PRIMARY KEY,username TEXT,password_hash TEXT); CREATE TABLE user_sessions(token_hash TEXT,user_id TEXT,csrf_token TEXT); INSERT INTO users VALUES ('fixture','public-fixture','PUBLIC-NON-CREDENTIAL-HASH'); INSERT INTO user_sessions VALUES ('PUBLIC-SESSION-HASH','fixture','PUBLIC-SESSION-CSRF-DO-NOT-RESTORE');");
    const encrypted=await createEncryptedBackup(active,path.join(directory,'backups'),key),restored=path.join(directory,'restored.sqlite');
    await decryptBackupToNewFile(encrypted,restored,key);
    const plain=spawnSync(process.execPath,['--import','tsx','scripts/backup.ts','--allow-plaintext'],{env:{...process.env,NODE_ENV:'test',DATA_DIR:directory,BACKUP_KEY_FILE:''},encoding:'utf8',timeout:20_000});
    assert.equal(plain.status,0,plain.stderr);
    const lab=path.join(directory,'backups',fs.readdirSync(path.join(directory,'backups')).find(f=>f.endsWith('.sqlite'))!);
    for(const filename of [restored,lab]) {
      const copy=new DatabaseSync(filename,{readOnly:true});
      try {assert.equal(copy.prepare('SELECT COUNT(*) AS n FROM users').get()?.n,1);assert.equal(copy.prepare('SELECT COUNT(*) AS n FROM user_sessions').get()?.n,0);}finally{copy.close();}
      assert.equal(fs.readFileSync(filename).includes(Buffer.from('PUBLIC-SESSION-CSRF-DO-NOT-RESTORE')),false);
    }
    assert.equal(live.prepare('SELECT COUNT(*) AS n FROM user_sessions').get()?.n,1);
    assert.equal(live.prepare('SELECT COUNT(*) AS n FROM users').get()?.n,1);
  } finally {live.close();}
});
