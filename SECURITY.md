# Seguridad de Nexo

Nexo guarda facturas, datos de clientes, firmas y las cuentas del equipo. Este documento resume cómo se protegen, cómo configurarlo de forma segura y cómo informar de un problema.

## Informar de una vulnerabilidad

**No abras un issue público.** Usa el aviso privado de GitHub ([«Report a vulnerability»](https://github.com/yhquintero/Sistema_de_Facturacion/security/advisories/new)) e incluye:

- la versión o el commit;
- los pasos para reproducirlo;
- el impacto que observaste.

Responderemos lo antes posible y te avisaremos cuando haya una corrección. Solo se mantiene la rama `main`.

## Lista de comprobación para producción

1. Pon un **proxy HTTPS** delante. Activa `TRUST_PROXY=1` solo si ese proxy es de confianza y el puerto no está expuesto directamente.
2. Define `APP_PASSWORD` (≥12 caracteres) para el primer administrador. Después, cada persona usa su propia cuenta.
3. Activa la **verificación en dos pasos** en todas las cuentas de administrador y, si puedes, `REQUIRE_ADMIN_2FA=true`.
4. Define `BACKUP_KEY` (≥16 caracteres, aleatoria) y guárdala **fuera del servidor**. Copia periódicamente `DATA_DIR/backups/` a otro disco o ubicación, y ensaya `npm run backup:verify` y una restauración.
5. Mantén `SEED_DEMO=false` y `ALLOW_PUBLIC_DEMO=false` con datos reales.
6. Revisa a menudo **Usuarios y acceso → Actividad de acceso**: intentos fallidos, bloqueos y uso de códigos de recuperación.

## Cuentas y contraseñas

- **Contraseñas:**
  - Se cifran con scrypt (N=16384, r=8, p=1) y una sal aleatoria por cuenta. Nunca se guardan ni se registran en texto plano.
  - Mínimo 12 caracteres.
- **Usuarios inexistentes:** se compara contra un hash señuelo, así el tiempo de respuesta no revela qué usuarios existen.
- **Contraseñas temporales:** las que asigna un administrador obligan a elegir una propia en el primer acceso.
- **Recuperación desde la consola del servidor:**
  - `npm run user:reset-password -- <usuario>` asigna una contraseña temporal.
  - Con `--reset-2fa` desactiva la verificación en dos pasos de esa persona.

## Verificación en dos pasos (TOTP)

- **Estándar:** RFC 6238 (HMAC-SHA1, 6 dígitos, 30 s). Se admite ±1 periodo de desfase de reloj.
- **Secreto:** aleatorio de 160 bits. Se muestra como código QR (generado en el servidor, sin servicios externos) y como clave manual.
- **Reutilización:** se guarda el último periodo aceptado, así que un código ya usado no vuelve a valer.
- **Códigos de recuperación:**
  - Se generan 10, de un solo uso, que se muestran una sola vez.
  - Solo se guardan sus huellas SHA-256.
  - Al usar uno, queda registrado y se avisa de cuántos quedan.
- **Inicio de sesión:**
  - La contraseña correcta no abre sesión; devuelve un reto efímero (en memoria, 5 minutos, 5 intentos).
  - La cookie solo se emite después del segundo paso.
- **Cambios en la verificación:**
  - Desactivarla exige la contraseña y un código.
  - Un administrador puede restablecerla a otra persona; al hacerlo se cierran sus sesiones.
- **Política obligatoria:** con `REQUIRE_ADMIN_2FA=true`, un administrador sin verificación solo puede usar su cuenta (activar la verificación, cambiar la contraseña, ver sus sesiones o salir). El resto de la API responde `TWO_FACTOR_SETUP_REQUIRED`.

## Bloqueo por intentos fallidos

- **Por usuario e IP:** `LOGIN_MAX_ATTEMPTS` (5) fallos dentro de `LOGIN_LOCK_MINUTES` (5) bloquean esa combinación durante `LOGIN_LOCK_MINUTES`, aunque después se escriba la contraseña correcta.
  - Los códigos de verificación incorrectos también cuentan.
  - El contador se guarda en SQLite, así que sobrevive a un reinicio.
- **Por IP:** además, como máximo 30 fallos cada 15 minutos, aunque se cambie de usuario.
- **Mensajes:** indican los intentos restantes y el tiempo de espera. Cada bloqueo queda en la actividad de acceso.

## Sesiones

- **Token:**
  - Aleatorio de 256 bits en una cookie `HttpOnly`, `SameSite=Strict`, y `Secure` bajo HTTPS.
  - La base guarda solo su SHA-256.
- **Duración:**
  - Máxima: `SESSION_MAX_HOURS` (12).
  - Cierre por inactividad: `SESSION_IDLE_MINUTES` (30), aplicado en el servidor.
- **En la interfaz:**
  - Un minuto antes aparece «¿Sigues ahí?» con cuenta atrás.
  - Antes de cerrar se consulta al servidor sin contar como actividad (`/api/session?probe=1`), por si otra pestaña sigue en uso.
- **Mis sesiones:** cada persona ve sus dispositivos (navegador, IP, última actividad) y puede cerrarlos. El identificador mostrado es un prefijo de la huella, nunca el token.
- **Cierre automático de todas las sesiones de una persona:** cuando se desactiva su cuenta, se le asigna una contraseña o se restablece su verificación en dos pasos. Cambiar la propia contraseña cierra las demás sesiones.
- **Rol:** se lee de la base en cada solicitud. Un cambio de rol se aplica de inmediato.

## Protección del navegador

- **Anti-CSRF:**
  - Toda solicitud que modifica datos debe llevar la cabecera propia `X-Nexo-Request: 1`, que un formulario o un enlace de otro sitio no puede enviar.
  - Si llega una cabecera `Origin`, debe coincidir con el servidor.
  - Las respuestas de `/api` llevan `Cache-Control: no-store`.
- **Cabeceras en producción:**

  ```text
  Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline';
    img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; frame-src 'self' blob:;
    worker-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self';
    frame-ancestors <FRAME_ANCESTORS>
  X-Frame-Options: SAMEORIGIN            (DENY con FRAME_ANCESTORS=none)
  Cross-Origin-Opener-Policy: same-origin
  Cross-Origin-Resource-Policy: same-origin
  Strict-Transport-Security: max-age=31536000; includeSubDomains   (solo bajo HTTPS)
  ```

  - No hay scripts en línea; la página sin conexión usa `offline.js`.
  - `style-src` admite estilos en línea porque React los usa en atributos `style`.
- **Cabeceras en todos los entornos:** `X-Content-Type-Options: nosniff`, `Referrer-Policy: same-origin` y `Permissions-Policy` (sin cámara, micrófono, geolocalización, pagos ni USB).
- **En desarrollo** no se envía CSP: Vite inyecta scripts en línea para la recarga en caliente.
- **Service worker:** nunca guarda en caché la API, los documentos, las sesiones ni las firmas.

## Copias de seguridad

- **Contenido:** una instantánea consistente de SQLite (`VACUUM INTO`) **sin sesiones ni bloqueos**, comprimida con gzip.
- **Cifrado:** con `BACKUP_KEY`, AES-256-GCM.
  - Formato: `NEXOENC1 | sal (16) | IV (12) | etiqueta (16) | datos`.
  - Clave derivada con scrypt y una sal por copia.
  - La etiqueta GCM detecta cualquier alteración o una clave incorrecta.
- **Frecuencia y rotación:** copia diaria automática en producción (`BACKUP_HOUR`), con rotación a las `BACKUP_KEEP` más recientes. Los administradores también pueden crear y descargar copias; cada acción queda registrada.
- **Restauración:** `npm run backup:restore` verifica la integridad antes de restaurar y conserva la base anterior.
- **Sin `BACKUP_KEY`:** las copias contienen datos personales, firmas, hashes de contraseña y secretos TOTP **sin cifrar**. El panel y el registro del servidor lo advierten.

## Registro de actividad de acceso

Se registran los últimos 5000 eventos:

- inicios y cierres de sesión, intentos fallidos y bloqueos;
- activación, desactivación, restablecimiento, fallos y códigos de recuperación de la verificación en dos pasos;
- sesiones caducadas por inactividad y sesiones cerradas por su titular;
- altas, cambios de rol, desactivaciones y restablecimientos de cuentas;
- copias creadas y descargadas.

Nunca se registran contraseñas, códigos ni tokens.

## Límites conocidos

- Un solo negocio por instalación. No hay inicio de sesión con proveedores externos (SSO), llaves de seguridad (WebAuthn) ni envío de copias a servicios externos.
- El bloqueo es por usuario e IP. Detrás de un proxy, las IP dependen de `TRUST_PROXY`.
- Los secretos TOTP se guardan en la base para poder verificar los códigos. Protege `DATA_DIR` (se crea con permisos `700`/`600`) y usa `BACKUP_KEY`.
