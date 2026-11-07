import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
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
