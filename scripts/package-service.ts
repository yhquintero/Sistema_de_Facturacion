import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import JSZip from 'jszip';
const index = process.argv.indexOf('--output');
const output = path.resolve(index >= 0 ? process.argv[index + 1] : `releases/Nexo-Servicio-${new Date().toISOString().replaceAll(':','-').replaceAll('.','-')}-${randomUUID().slice(0,8)}.zip`);
if (!output.toLowerCase().endsWith('.zip')) throw new Error('El destino debe ser un archivo .zip nuevo.');
const allowed = ['src','shared','server','public','scripts','control','deploy','docs','tests','dist','package.json','package-lock.json','tsconfig.json','vite.config.ts','playwright.config.ts','index.html','README.md','Dockerfile','compose.yaml','.env.example','.gitignore','.dockerignore'];
const zip = new JSZip(), manifest: Record<string,{sha256:string;bytes:number}> = {};
const excluded = /(?:^|\/)(?:node_modules|data|data-private|secrets|tls|tmp|var|test-results|\.git|backups)(?:\/|$)|(?:\.sqlite(?:-.+)?|\.db|\.pem|\.scrypt|\.crt|\.key|\.pfx|\.p12|\.nxb|\.log)$/i;
function add(relative: string) {
  if (excluded.test(relative) || (path.basename(relative).startsWith('.env') && path.basename(relative) !== '.env.example')) return;
  const file = path.resolve(relative), stat = fs.lstatSync(file); if (stat.isSymbolicLink()) throw new Error('No se exportan enlaces simbólicos.');
  if (stat.isDirectory()) { for (const name of fs.readdirSync(file)) add(relative + '/' + name); return; }
  if (!stat.isFile() || stat.size > 20 * 1024 * 1024) throw new Error('Archivo no admitido o demasiado grande en el paquete.');
  const bytes = fs.readFileSync(file); if (/-----BEGIN (?:RSA |EC |OPENSSH |ENCRYPTED )?PRIVATE KEY-----|scrypt\$32768\$8\$1\$[A-Za-z0-9_-]{22}\$[A-Za-z0-9_-]{43}/.test(bytes.toString('utf8'))) throw new Error('Posible secreto incrustado: revisa ' + relative); zip.file(relative,bytes); manifest[relative] = { sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length };
}
for (const entry of allowed) if (fs.existsSync(entry)) add(entry);
zip.file('MANIFEST-SHA256.json',JSON.stringify({ format:'nexo-service-v1',createdAt:new Date().toISOString(),includesBusinessData:false,requiresNode:'>=22.13',files:manifest },null,2));
zip.file('INICIAR-EN-WINDOWS.txt','Requiere Node >=22.13, PowerShell >=7.4 y Caddy instalado desde una fuente oficial.\r\nEjecuta pwsh -NoProfile -File .\\control\\Panel-Sistema.ps1 -InstallDependencies\r\nPrimera ejecución: configura acceso local o LAN; el panel inicia web, API y HTTPS.\r\nNo incluye datos, contraseñas, claves, certificados privados ni dependencias. npm ci requiere acceso a registry.npmjs.org.\r\nPara Cuba, no publiques datos personales en hospedaje extranjero sin verificar la excepción legal aplicable.\r\nConsulta docs/OPERACION-SEGURA.md y docs/ONAT-CUBA.md.\r\n');
fs.mkdirSync(path.dirname(output),{recursive:true,mode:0o700}); fs.writeFileSync(output,await zip.generateAsync({type:'nodebuffer',compression:'DEFLATE'}),{flag:'wx',mode:0o600});
console.log(`Servicio exportado sin datos ni secretos: ${output}`);
