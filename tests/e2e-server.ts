import fs from 'node:fs';
import path from 'node:path';
const protectedMode = process.argv.includes('--protected');
const testData = path.resolve(protectedMode ? 'tmp/e2e-auth-data' : 'tmp/e2e-data');
// Only this disposable test database is reset, never the application data directory.
fs.rmSync(testData, { recursive: true, force: true });
process.env.DATA_DIR = testData;
process.env.PORT = protectedMode ? '3101' : '3100';
process.env.APP_PASSWORD = protectedMode ? 'clave-publica-solo-para-e2e' : '';
process.env.NODE_ENV = protectedMode ? 'production' : 'development';
process.env.SEED_DEMO = 'true';
await import('../server/index');
