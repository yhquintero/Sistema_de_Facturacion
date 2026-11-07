import fs from 'node:fs';
import { X509Certificate, createPrivateKey } from 'node:crypto';
import net from 'node:net';
import path from 'node:path';

export type RuntimeConfig = ReturnType<typeof readConfig>;
const localHost = (value: string) => ['127.0.0.1', '::1', 'localhost'].includes(value);
export function readConfig(env: NodeJS.ProcessEnv = process.env) {
  const production = env.NODE_ENV === 'production' || process.argv.includes('--production');
  const tlsMode = env.TLS_MODE || (production ? 'proxy' : 'off');
  if (!['off', 'proxy', 'direct'].includes(tlsMode)) throw new Error('TLS_MODE debe ser off, proxy o direct.');
  const port = Number(env.PORT || (tlsMode === 'direct' ? 8450 : 3000));
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT no es válido.');
  const redirectPort = env.REDIRECT_HTTP_PORT ? Number(env.REDIRECT_HTTP_PORT) : 0;
  if (env.REDIRECT_HTTP_PORT && (!Number.isInteger(redirectPort) || redirectPort < 1 || redirectPort > 65535 || redirectPort === port || tlsMode !== 'direct')) throw new Error('REDIRECT_HTTP_PORT exige TLS directo y un puerto distinto válido.');
  const host = env.HOST || (production && tlsMode === 'proxy' ? '127.0.0.1' : '0.0.0.0');
  const originOf = (value: string) => { const url = new URL(value); if (url.username || url.password || url.pathname !== '/' || url.search || url.hash || !['http:', 'https:'].includes(url.protocol)) throw new Error('Utiliza un origen sin ruta, credenciales ni parámetros.'); return url.origin; };
  const publicOrigin = env.PUBLIC_ORIGIN ? originOf(env.PUBLIC_ORIGIN) : '';
  const allowedOrigins = new Set([publicOrigin, ...(env.ALLOWED_ORIGINS || '').split(',').filter(Boolean).map(originOf)].filter(Boolean));
  const trustedProxies = (env.TRUST_PROXY || '').split(',').map(v => v.trim()).filter(v => v && v !== '0');
  if (trustedProxies.some(v => ['1', 'true', '*'].includes(v))) throw new Error('TRUST_PROXY requiere direcciones o CIDR de proxies de confianza, no 1/true/*.');
  for (const proxy of trustedProxies) { const [ip,prefix,...extra] = proxy.split('/'); const family = net.isIP(ip); if (!family || extra.length || (prefix !== undefined && (!/^\d{1,3}$/.test(prefix) || (Number(prefix) === 0 || Number(prefix) > (family === 4 ? 32 : 128))))) throw new Error('TRUST_PROXY solo admite IP y CIDR explícitos válidos.'); }
  // .env y Docker suelen quitar las comillas: 'self'/'none' sin comillas se normalizan antes de validar.
  const frameAncestors = (env.FRAME_ANCESTORS || "'none'").trim().split(/\s+/).map(v => /^'?(self|none)'?$/i.test(v) ? `'${v.replace(/'/g, '').toLowerCase()}'` : v).join(' ');
  if (!frameAncestors.split(/\s+/).every(v => ["'none'", "'self'"].includes(v) || /^https:\/\/(?:\*\.)?[a-z0-9.-]+(?::\d+)?$/i.test(v))) throw new Error('FRAME_ANCESTORS no es válido.');
  return { production, tlsMode: tlsMode as 'off' | 'proxy' | 'direct', port, host, publicOrigin, allowedOrigins, trustedProxies, frameAncestors, allowPublicDemo: env.ALLOW_PUBLIC_DEMO === 'true', allowInsecureLocalhost: env.ALLOW_INSECURE_LOCALHOST === 'true', certFile: env.TLS_CERT_FILE || '', keyFile: env.TLS_KEY_FILE || '', passwordHashFile: env.APP_PASSWORD_HASH_FILE || '', passwordFile: env.APP_PASSWORD_FILE || '', backupKeyFile: env.BACKUP_KEY_FILE || '', privacyContact: (env.PRIVACY_CONTACT || '').trim(), controllerName: (env.DATA_CONTROLLER_NAME || '').trim(), dataCountry: (env.DATA_LOCATION_COUNTRY || 'UNCONFIRMED').trim().toUpperCase(), hstsSeconds: 31536000, redirectPort, legalExceptionReference: (env.DATA_LOCATION_LEGAL_EXCEPTION_REFERENCE || '').trim(), shutdownFile: env.CONTROL_SHUTDOWN_FILE || '', controlInstance: env.CONTROL_INSTANCE_ID || '' };
}
export function validateRuntime(config: RuntimeConfig, hasAuthentication: boolean) {
  if (config.shutdownFile && (!path.isAbsolute(config.shutdownFile) || fs.existsSync(config.shutdownFile))) throw new Error('CONTROL_SHUTDOWN_FILE debe ser una ruta absoluta nueva en un directorio privado.');
  if (config.production && !config.allowPublicDemo && (!config.controllerName || !config.privacyContact)) throw new Error('Identifica DATA_CONTROLLER_NAME y PRIVACY_CONTACT antes de operar con datos reales.');
  if (config.production && !config.allowPublicDemo && config.dataCountry !== 'CU' && !config.legalExceptionReference) throw new Error('Cuba: confirma DATA_LOCATION_COUNTRY=CU o documenta DATA_LOCATION_LEGAL_EXCEPTION_REFERENCE con revisión jurídica. Una declaración no verifica residencia física.');
  if (config.production && !hasAuthentication && !config.allowPublicDemo) throw new Error('Producción exige autenticación. Configura APP_PASSWORD_HASH_FILE; ALLOW_PUBLIC_DEMO=true es solo para datos ficticios.');
  if (config.tlsMode !== 'off' && (!config.publicOrigin || !config.publicOrigin.startsWith('https://'))) throw new Error('HTTPS exige PUBLIC_ORIGIN=https://... con el nombre o IP del certificado.');
  if (config.production && config.tlsMode === 'off' && !config.allowPublicDemo && !(config.allowInsecureLocalhost && localHost(config.host))) throw new Error('Se rechaza producción por HTTP. Usa TLS_MODE=proxy/direct. La excepción local exige HOST=127.0.0.1 y ALLOW_INSECURE_LOCALHOST=true.');
  if (config.tlsMode === 'proxy' && !config.trustedProxies.length) throw new Error('Configura TRUST_PROXY con la IP/CIDR exacta del proxy y bloquea el acceso directo al puerto interno.');
  if (config.tlsMode === 'direct') loadTlsOptions(config);
}
export function loadTlsOptions(config: RuntimeConfig) {
  if (!config.certFile || !config.keyFile) throw new Error('TLS directo exige TLS_CERT_FILE (cadena PEM) y TLS_KEY_FILE.');
  const cert = fs.readFileSync(config.certFile), key = fs.readFileSync(config.keyFile);
  const leaf = new X509Certificate(cert); const hostname = new URL(config.publicOrigin).hostname.replace(/^\[|\]$/g, '');
  if (!leaf.checkPrivateKey(createPrivateKey(key))) throw new Error('La clave TLS no corresponde al certificado.');
  if (Date.parse(leaf.validFrom) > Date.now() || Date.parse(leaf.validTo) <= Date.now()) throw new Error('El certificado TLS está caducado o todavía no es válido.');
  if (!(net.isIP(hostname) ? leaf.checkIP(hostname) : leaf.checkHost(hostname))) throw new Error('El certificado TLS no cubre PUBLIC_ORIGIN.');
  return { cert, key, minVersion: 'TLSv1.2' as const, maxVersion: 'TLSv1.3' as const, honorCipherOrder: true, ciphers: 'TLS_AES_256_GCM_SHA384:TLS_CHACHA20_POLY1305_SHA256:TLS_AES_128_GCM_SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256' };
}
