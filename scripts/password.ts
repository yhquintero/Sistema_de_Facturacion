import { hashPassword } from '../server/security/password';
// Password arrives through stdin, never a CLI argument, URL, log or environment variable.
if (process.stdin.isTTY) { console.error('Utiliza el panel PowerShell para introducir la frase sin eco. Este comando recibe la contraseña por stdin.'); process.exit(1); }
process.stdin.setEncoding('utf8');
let password = '';
for await (const chunk of process.stdin) { password += chunk.toString(); if (password.length > 1026) throw new Error('Frase demasiado larga.'); }
try { console.log(await hashPassword(password.replace(/\r?\n$/, ''))); } finally { password = ''; }
