import https from 'node:https';
import fs from 'node:fs';
const argument = (name: string) => { const index = process.argv.indexOf(name); return index < 0 ? '' : process.argv[index + 1] || ''; };
const url = new URL(argument('--url')); if (url.protocol !== 'https:' || url.username || url.password) throw new Error('La comprobación exige una URL HTTPS sin credenciales.');
url.pathname = '/api/health'; url.search = ''; url.hash = '';
const ca = argument('--ca');
await new Promise<void>((resolve, reject) => {
  const request = https.get(url, { ...(ca ? { ca: fs.readFileSync(ca) } : {}), rejectUnauthorized: true, timeout: 8000, minVersion: 'TLSv1.2' }, response => {
    let body = ''; response.setEncoding('utf8'); response.on('data', chunk => body += chunk); response.on('end', () => { try { if (response.statusCode !== 200 || !JSON.parse(body).ok) throw new Error('Salud de aplicación no válida.'); console.log(`HTTPS y nombre del certificado verificados: ${url.origin}`); resolve(); } catch (error) { reject(error); } });
  });
  request.on('timeout', () => request.destroy(new Error('Tiempo de espera HTTPS agotado.'))); request.on('error', reject);
});
