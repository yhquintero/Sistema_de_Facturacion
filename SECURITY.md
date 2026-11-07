# Seguridad de Nexo

Nexo guarda facturas, datos de clientes, firmas y las cuentas del equipo. Este documento resume cómo se protegen, cómo configurarlo de forma segura y cómo informar de un problema. El detalle operativo está en [`docs/OPERACION-SEGURA.md`](docs/OPERACION-SEGURA.md) y la auditoría en [`docs/AUDITORIA-SEGURIDAD.md`](docs/AUDITORIA-SEGURIDAD.md).

## Informar de una vulnerabilidad

**No abras un issue público.** Usa el aviso privado de GitHub ([«Report a vulnerability»](https://github.com/yhquintero/Sistema_de_Facturacion/security/advisories/new)) e incluye:

- la versión o el commit;
- los pasos para reproducirlo;
- el impacto que observaste.

Responderemos lo antes posible y te avisaremos cuando haya una corrección. Solo se mantiene la rama `main`.

## Lista de comprobación para producción

1. **HTTPS:** usa `TLS_MODE=proxy` (Caddy, ver `deploy/Caddyfile`) con `TRUST_PROXY` limitado a la IP o CIDR exactos del proxy, o `TLS_MODE=direct` con certificado propio. El servidor rechaza arrancar en producción por HTTP salvo la excepción de laboratorio en loopback.
2. **Primer administrador:** créalo con `APP_PASSWORD_HASH_FILE` (`npm run password:hash`). Después, cada persona usa su propia cuenta.
3. **Verificación en dos pasos:** actívala en todas las cuentas de administrador y, si puedes, define `REQUIRE_ADMIN_2FA=true`.
4. **Copias:** genera la clave con `npm run backup:key -- <archivo>` y apunta `BACKUP_KEY_FILE` a ese archivo. Guárdala fuera del directorio de copias, con otra copia fuera del servidor. Ensaya `npm run backup:decrypt` con regularidad.
5. **Datos de demostración:** mantén `SEED_DEMO=false` y `ALLOW_PUBLIC_DEMO=false` con datos reales.
6. **Actividad de acceso:** revísala a menudo en **Usuarios y acceso**: intentos fallidos, bloqueos y uso de códigos de recuperación.

## Cuentas y contraseñas

- **Almacenamiento:** scrypt con sal aleatoria por cuenta. Las cuentas nuevas usan N=32768; las anteriores se siguen verificando. Nunca se guardan ni se registran en texto plano.
- **Longitud:** mínimo 14 caracteres.
- **Usuarios inexistentes:** se compara contra un hash señuelo, así el tiempo de respuesta no revela qué usuarios existen.
- **Contraseñas temporales:** las que asigna un administrador obligan a elegir una propia en el primer acceso.
- **Recuperación desde la consola del servidor:**
  - `npm run user:reset-password -- <usuario>` asigna una contraseña temporal.
  - Con `--reset-2fa` desactiva la verificación en dos pasos de esa persona.

## Verificación en dos pasos (TOTP)

- **Estándar:** RFC 6238 (HMAC-SHA1, 6 dígitos, 30 s), con ±1 periodo de tolerancia al desfase del reloj.
- **Secreto:** aleatorio de 160 bits. Se muestra como código QR, generado en el servidor sin servicios externos, y como clave manual.
- **Reutilización:** se guarda el último periodo aceptado, así que un código ya usado no vuelve a valer.
- **Códigos de recuperación:**
  - Se generan 10, de un solo uso, y se muestran una sola vez.
  - Solo se guardan sus huellas SHA-256.
  - Al usar uno queda registrado y se avisa de cuántos quedan.
- **Inicio de sesión:** la contraseña correcta no abre sesión. Devuelve un reto efímero (en memoria, 5 minutos, 5 intentos); la cookie y el token CSRF solo se emiten después del segundo paso.
- **Desactivarla:** exige la contraseña y un código.
- **Restablecerla:** un administrador puede hacerlo para otra persona, y al hacerlo se cierran sus sesiones.
- **Política:** con `REQUIRE_ADMIN_2FA=true`, un administrador sin verificación solo puede gestionar su propia cuenta. El resto de la API responde `TWO_FACTOR_SETUP_REQUIRED`.

## Bloqueo por intentos fallidos

- **Por usuario y conexión:** `LOGIN_MAX_ATTEMPTS` fallos (5 por defecto) bloquean esa combinación durante `LOGIN_LOCK_MINUTES` (5), aunque después se escriba la contraseña correcta.
  - Los códigos de verificación incorrectos también cuentan.
  - El contador se guarda en SQLite, así que sobrevive a un reinicio.
  - La conexión se identifica con un seudónimo HMAC de la IP, no con la IP en claro.
- **Límites adicionales en memoria:** 10 intentos cada 15 minutos por conexión y por cuenta, y 60 por minuto en total, con `Retry-After`.
- **Mensajes:** indican los intentos restantes y el tiempo de espera. Cada bloqueo queda en la actividad de acceso.

## Sesiones

- **Token:**
  - Aleatorio de 256 bits en una cookie `HttpOnly` y `SameSite=Strict`.
  - Bajo HTTPS la cookie es `__Host-` y `Secure`.
  - La base guarda solo su SHA-256, junto con un token CSRF propio de cada sesión.
- **Duración:**
  - Máxima: `SESSION_MAX_HOURS` (8 horas).
  - Inactividad: `SESSION_IDLE_MINUTES` (30 minutos), aplicada en el servidor.
  - El canal en tiempo real (SSE) no cuenta como actividad.
- **Aviso en la interfaz:**
  - Un minuto antes aparece «¿Sigues ahí?» con cuenta atrás.
  - Antes de cerrar, se consulta al servidor sin contar como actividad (`/api/session?probe=1`), por si otra pestaña sigue en uso.
  - Tras el cierre, la pantalla de acceso explica que fue por inactividad.
- **Mis sesiones:** cada persona ve sus dispositivos (navegador, conexión, última actividad) y puede cerrarlos. El identificador mostrado es un prefijo de la huella, nunca el token.
- **Cierre de todas las sesiones:**
  - Se cierran todas las de una persona al desactivar su cuenta, asignarle una contraseña o restablecer su verificación.
  - Cambiar la propia contraseña cierra las demás sesiones.
  - Reiniciar el servidor invalida todas.
- **Rol:** se lee de la base en cada solicitud, así que un cambio de rol se aplica de inmediato.

## Protección del navegador

- **Anti-CSRF:** toda modificación exige la cabecera `X-CSRF-Token` con el token de la sesión. Además se comprueban `Origin` y `Sec-Fetch-Site`, y el `Host` contra `PUBLIC_ORIGIN` y `ALLOWED_ORIGINS`.
- **Cabeceras:**
  - `Content-Security-Policy` sin scripts en línea en producción.
  - `frame-ancestors` según `FRAME_ANCESTORS` (`'none'` por defecto), con `X-Frame-Options` acorde.
  - HSTS bajo HTTPS.
  - `nosniff`, `Referrer-Policy: no-referrer`, COOP y CORP `same-origin`, y `Permissions-Policy` restrictiva.
  - `Cache-Control: no-store` en la API.
- **`FRAME_ANCESTORS` desde `.env`:** se aceptan `self` y `none` con o sin comillas, porque `.env` y Docker suelen quitarlas.
- **Service worker:** nunca guarda en caché la API, los documentos, las sesiones ni las firmas.

## Copias de seguridad

- **Formato:** `NXBK0001`, AES-256-GCM con una clave aleatoria de 32 bytes (`BACKUP_KEY_FILE`).
  - Instantánea consistente de SQLite (`VACUUM INTO`) **sin sesiones ni bloqueos de acceso**.
  - Junto a cada copia se escribe un `.json` con su suma SHA-256.
  - Nunca se crean copias sin cifrar, salvo la opción explícita de laboratorio `--allow-plaintext`, fuera de producción.
- **Frecuencia y rotación:**
  - Copia diaria automática en producción, a partir de `BACKUP_HOUR` (2). Se desactiva con `BACKUP_AUTO=false`.
  - Se conservan en el servidor las `BACKUP_KEEP` copias más recientes (30). Con `BACKUP_KEEP=0` no se borra ninguna y la retención la gestiona el operador; en cualquier caso, guarda copias desconectadas fuera del servidor.
  - Los administradores también pueden crear y descargar copias desde **Usuarios y acceso**. Cada acción queda registrada.
- **Recuperación:** `npm run backup:decrypt -- <copia.nxb> <archivo-NUEVO.sqlite>` autentica la copia, comprueba SQLite y la escribe en un archivo nuevo. Nunca sobrescribe la base activa.

## Registro de actividad

- **Actividad de acceso** (en la base, últimos 5000 eventos):
  - inicios y cierres de sesión, intentos fallidos y bloqueos;
  - verificación en dos pasos: activación, desactivación, restablecimiento, fallos y códigos de recuperación;
  - sesiones caducadas y sesiones cerradas por su titular;
  - cambios de cuentas y roles;
  - copias creadas y descargadas.
- **Registro técnico:** `data/logs/security.ndjson`, rotado y con identificadores seudónimos.

Nunca se registran contraseñas, códigos ni tokens.

## Límites conocidos

- **Alcance:** un solo negocio por instalación. No hay SSO, llaves de seguridad (WebAuthn) ni envío de copias a servicios externos.
- **Secretos TOTP:** se guardan en la base para poder verificar los códigos. Protege `DATA_DIR` (permisos `700`/`600`) y el disco, con BitLocker, LUKS o similar.
- **Detrás de un proxy:** la conexión que se usa para el bloqueo depende de `TRUST_PROXY`.
