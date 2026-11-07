import { randomBytes } from 'node:crypto';

/**
 * Recuperación de acceso desde la consola del servidor.
 *   npm run user:reset-password -- <usuario>            Genera una contraseña temporal.
 *   npm run user:reset-password -- <usuario> --admin    Además garantiza que sea administrador activo
 *                                                       (lo crea si no existe).
 * La contraseña temporal se muestra una sola vez y debe cambiarse en el primer acceso.
 */
const args = process.argv.slice(2);
const username = args.find(arg => !arg.startsWith('--'));
if (!username) { console.error('Uso: npm run user:reset-password -- <usuario> [--admin]'); process.exit(1); }
const { resetPasswordFromConsole } = await import('../server/users');
const { db } = await import('../server/db');
const temporary = randomBytes(15).toString('base64url');
try {
  const { user, created } = await resetPasswordFromConsole(username, temporary, { createAdmin: args.includes('--admin') });
  console.log(`${created ? 'Cuenta creada' : 'Contraseña restablecida'}: ${user.username} (${user.role}).`);
  console.log(`Contraseña temporal (cámbiala en el primer acceso): ${temporary}`);
  console.log('Se cerraron las sesiones abiertas de esta cuenta.');
} catch (error) {
  console.error((error as Error).message); process.exitCode = 1;
} finally { db.close(); }
