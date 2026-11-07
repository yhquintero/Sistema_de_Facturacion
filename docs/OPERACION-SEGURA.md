# Operación segura · Web + Servidor + Móvil

**Alcance:** Nexo, un espacio de administración de un Suministrador TCP en Cuba. El teléfono utiliza la misma web/PWA y base del servidor; **no es un APK ni un portal multicliente aislado**. Revisión inicial: 2026-11-04; integración técnica de cuentas/roles: 2026-11-06.

## 1. Antes de datos reales

- Equipo y sistema operativo soportados, Node **22.13+** (validado aquí con 22.22.3), **PowerShell 7.4+** y Caddy oficial. Windows PowerShell 5.1 no basta. Comprueba `node --version`, `pwsh --version`, `caddy version`.

- Instala los binarios desde sus proyectos oficiales y contrasta checksums/origen. El panel **no descarga ejecutables**, no omite ExecutionPolicy, no deshabilita antivirus y no instala CA ni abre firewall sin una acción explícita.
- Confirma ubicación física de servidor y réplicas, aviso de privacidad, responsable, conservación y registro/gestiones que procedan. Para Cuba, Res. 58/2022 art. 7 impide asumir que un túnel o nube extranjera es una opción predeterminada válida. Ver auditoría y fuentes.
- Activa y verifica BitLocker/LUKS o cifrado equivalente del almacenamiento. **SQLite no se cifra por la aplicación.** Protege también exportaciones y equipos móviles.
- No uses cuentas de administrador para la operación habitual. No compartas la frase de acceso con clientes; la firma actual es asistida/supervisada por el Suministrador.

### Instalar Caddy en Windows (antes del primer inicio)

El panel necesita el ejecutable de Caddy en `PATH`; `-InstallDependencies` instala únicamente los paquetes npm, no Caddy ni PowerShell. Si `caddy version` no se reconoce, instala Caddy explícitamente:

```powershell
winget install --id CaddyServer.Caddy --exact --source winget
```

Se indica `--source winget` para consultar únicamente el repositorio comunitario de winget y evitar que un fallo de la fuente Microsoft Store (`msstore`, por ejemplo `0x8a15003b`) bloquee la instalación. No necesitas restablecer ni eliminar fuentes.

Cierra la terminal y abre una nueva para recoger el `PATH` actualizado. Comprueba:

```powershell
Get-Command caddy -CommandType Application
caddy version
```

Si el comando sin `--source winget` falló, Caddy **no quedó instalado**: repítelo con la fuente explícita y espera una confirmación de instalación correcta antes de continuar. Si winget informa que ya está instalado pero `caddy version` sigue sin funcionar tras abrir una terminal nueva, comprueba `winget list --id CaddyServer.Caddy --exact --source winget` y revisa el `PATH` del usuario o la carpeta del ejecutable; no reinstales las dependencias npm para resolver un problema de PATH.

Si no utilizas winget, descarga la distribución de tu arquitectura desde las [publicaciones oficiales](https://github.com/caddyserver/caddy/releases), contrasta el checksum del archivo con el manifiesto de esa versión, extrae `caddy.exe` en una carpeta estable y añade esa carpeta al `PATH` del usuario. No uses una ruta temporal ni desactives HTTPS para resolver este error.

### Avisos npm durante la instalación

`added ... packages`, `found 0 vulnerabilities` y una salida correcta de `npm ci` indican que la instalación npm terminó; no significan que Caddy esté instalado. Los avisos `deprecated` corresponden a dependencias que requieren seguimiento, pero no son el error de Caddy. No los ocultes forzando la resolución de dependencias.

El panel los resume en una línea (`N avisos «deprecated» de dependencias indirectas`) para que no se confundan con un error. Vienen de dependencias de `exceljs` (`inflight`, `glob`, `rimraf`, `fstream`, `lodash.isequal`) y de `pdfkit` (`jpeg-exif`, `crypto-js`). La salida completa sigue en el registro de npm.

Si tu versión de npm muestra `allow-scripts` para esbuild, revisa los scripts pendientes con las opciones de aprobación indicadas por esa versión de npm antes de autorizarlos. No apruebes todos los scripts indiscriminadamente ni desactives globalmente las protecciones. Después comprueba `npm run build`; cualquier fallo de esbuild debe investigarse por separado del requisito Caddy.

El panel comprueba Caddy antes de ejecutar `npm ci` cuando debe crear la primera configuración (`Start`, `Menu` o `Initialize`), para evitar reinstalaciones innecesarias si falta el proxy.

### Errores de red durante `npm ci` (ECONNRESET, ETIMEDOUT, EAI_AGAIN)

`npm error code ECONNRESET` / `network read ECONNRESET` significa que **la conexión con el registro de npm se cortó** a mitad de la descarga. Es un problema de red, no del proyecto, y no se arregla borrando `package-lock.json` ni con `--force`.

`-InstallDependencies` ya lo tiene en cuenta:

- Ejecuta `npm ci` hasta **4 veces**, con esperas de 10, 30 y 60 segundos, y cada descarga se reintenta 5 veces dentro de npm, con un límite de 10 minutos por paquete.
- Usa `--prefer-offline`: cada paquete descargado queda en la caché de npm, verificado con la huella `integrity` del `package-lock.json`. **El intento siguiente continúa desde ahí** y no vuelve a descargar lo que ya tienes.
- Si `node_modules` ya corresponde al `package-lock.json` actual, no descarga nada. Para forzar una reinstalación, borra la carpeta `node_modules`.
- Solo reintenta los cortes de red y los archivos bloqueados (EPERM/EBUSY). Un `package-lock.json` desincronizado, un certificado no reconocido o un proxy que pide credenciales se explican y no se reintentan.

Si aun así falla:

1. **Vuelve a ejecutar el mismo comando.** Con una conexión intermitente, cada ejecución avanza un poco más:
   ```powershell
   pwsh -NoProfile -File .\control\Panel-Sistema.ps1 -InstallDependencies
   ```
2. **Comprueba el acceso** al registro: `npm ping`.
3. **Proxy:** `npm config set proxy http://HOST:PUERTO` y `npm config set https-proxy http://HOST:PUERTO`. Si aparece `SELF_SIGNED_CERT_IN_CHAIN`, configura la CA de tu red con `npm config set cafile C:\ruta\ca.pem`. **No** uses `strict-ssl=false`.
4. **Registro espejo solo para esta instalación**, sin cambiar la configuración global de npm:
   ```powershell
   pwsh -NoProfile -File .\control\Panel-Sistema.ps1 -InstallDependencies -NpmRegistry https://registry.npmmirror.com/
   ```
   Solo se aceptan direcciones `https://` sin credenciales. npm reescribe las descargas del `package-lock.json` hacia ese registro y **comprueba cada paquete con su huella SHA-512**: un espejo no puede cambiar el código sin que la instalación falle. Usa el espejo de tu organización si tienes uno.
5. **Equipo sin Internet:** instala el proyecto en otro PC con conexión y copia su caché de npm (ruta: `npm config get cache`, normalmente `%LocalAppData%\npm-cache`) a la misma ruta del equipo sin conexión. Después ejecuta el paso 1: `npm ci` instala desde la caché verificada.

Mientras falten las dependencias, `-Action Menu`, `Start` y las demás acciones se detienen con el aviso «Faltan las dependencias del proyecto». Primero completa `-InstallDependencies`.

### Conflicto npm entre Vite y el plugin React

El proyecto conserva Vite 6 y utiliza `@vitejs/plugin-react` 4.7 compatible. La serie 6 del plugin exige Vite 8. Actualiza juntos `package.json` y `package-lock.json` desde esta corrección y vuelve a ejecutar `-InstallDependencies`; no uses `--force` ni `--legacy-peer-deps`, y no borres el lockfile.


## 2. Inicio automático mediante el panel

Desde la raíz extraída/clonada del proyecto:

```powershell
# Solo este equipo; inicia Web compilada, API, SSE y HTTPS y abre el navegador.
pwsh -NoProfile -File .\control\Panel-Sistema.ps1 -InstallDependencies

# Red local: sustituye la IP por una IP privada fija REAL de tu equipo.
pwsh -NoProfile -File .\control\Panel-Sistema.ps1 -Mode LAN -LanAddress 192.168.1.20 -InstallDependencies

# Menú persistente con estado, backup, exportación y parada.
pwsh -NoProfile -File .\control\Panel-Sistema.ps1 -Action Menu
```

La primera ejecución pregunta país físico, responsable/contacto y una frase de **14–1024 caracteres**, introducida sin eco dos veces. Prefiere varias palabras aleatorias, exclusivas. La frase entra a Node por **stdin**, no por argumentos/URL. Se guarda un hash scrypt con sal; no la contraseña. Se crea aparte una clave aleatoria de 32 bytes para respaldos.

Se comprueba Node, se ejecuta `npm ci` solo al pedir `-InstallDependencies`, se compila salvo `-NoBuild`, se valida Caddy, se inicia el backend, se verifica una **identidad de instancia** sobre salud de loopback y después HTTPS con cadena y nombre. Un servicio ajeno que conteste en el mismo puerto no basta para declarar el nuevo backend listo, ni en el puerto interno ni a través de HTTPS: antes de iniciar se comprueba que ambos puertos estén libres y el probe HTTPS exige el identificador de esta instancia. Un error de inicio detiene únicamente procesos propios comprobados.

**No supone instalación validada en tu Windows.** En Arena se comprobó gramática PowerShell mediante tree-sitter; el parser real/DACL/ciclo Caddy se ejecutaron satisfactoriamente en CI Windows con fixtures el 2026-11-06; ver VERIFICACION.md. Esa VM no sustituye el equipo del usuario ni prueba confianza interactiva de CA, firewall o teléfonos físicos. Ejecuta primero con fixtures en el equipo de destino.

### Cuentas personales y recuperación

La frase inicial del panel crea la cuenta **`admin`** solo si no hay cuentas. Cada persona del equipo debe recibir su propio usuario/rol desde **Usuarios y acceso**. Nuevas contraseñas: 14–1024 caracteres; las temporales deben cambiarse antes de acceder a datos. **Mi cuenta** solicita la contraseña actual y cierra las demás sesiones. El administrador puede revocar sesiones o desactivar una cuenta; el servidor consulta rol/estado en cada solicitud. Gestor administra el auxiliar fiscal, Lectura solo lo consulta/exporta y Técnico no accede a él. Solo administradores ven usuarios, eventos de acceso y estado de seguridad. Matriz completa en README.

Las cuentas y hashes existentes de PR #2 se preservan. Los hashes antiguos scrypt/NFKC se verifican sin cambiar su contraseña; las nuevas usan scrypt reforzado. El hash de arranque sirve **solo para la primera cuenta**, no es una contraseña maestra ni un mecanismo de recuperación. Node puede arrancar sin esa variable cuando ya hay cuentas persistidas; el panel conserva su configuración/archivos privados. La compatibilidad de bootstrap en claro no es la opción recomendada.

Si pierdes acceso, usa consola local autorizada, no chat ni una URL. Detén el servicio para una recuperación controlada, conserva evidencia y confirma **la ruta de la base existente**. Para el estado predeterminado del panel:

```powershell
$config = Get-Content (Join-Path $env:LOCALAPPDATA 'NexoFacturacion\control.json') -Raw | ConvertFrom-Json
$env:DATA_DIR = $config.dataDir  # con -StateDirectory personalizado, lee SU control.json
# Sustituye admin por el usuario real. --admin lo activa/promueve o lo crea si no existe.
npm run user:reset-password -- admin --admin
```

La contraseña aleatoria se muestra una sola vez en la consola: no la redirijas a logs compartidos y entrégala por un canal seguro. Se exige cambio en el primer acceso y se revocan las sesiones de esa cuenta. Arranca el servicio y comprueba HTTPS/login/rol. **Regenerar `access.scrypt` o cambiar `APP_PASSWORD` no cambia contraseñas de cuentas que ya existen.** El acceso al SO y a SQLite sigue siendo privilegiado y exige DACL/cifrado de disco.

Las sesiones se guardan con token bearer hashado y CSRF propio, con `SESSION_IDLE_MINUTES` (30) de inactividad HTTP —con aviso «¿Sigues ahí?» en pantalla— / `SESSION_MAX_HOURS` (8) absolutas y límites 20/cuenta, 256 globales. Cada persona puede cerrar sus otros dispositivos en **Mi cuenta → Mis sesiones**. El arranque real invalida todas las sesiones guardadas; conserva cuentas y datos. La copia elimina sesiones y bloqueos de acceso **en la instantánea**, nunca en la base activa. Hay verificación en dos pasos TOTP por cuenta (obligatoria para administradores con `REQUIRE_ADMIN_2FA=true`) y bloqueo persistente de `LOGIN_LOCK_MINUTES` (5) tras `LOGIN_MAX_ATTEMPTS` (5) fallos por cuenta y conexión. No hay aislamiento por cliente: los cuatro roles son internos del mismo Suministrador; no se deben entregar como un portal al Cliente Final.

### Estado privado y cambios de modo

Por defecto: `%LOCALAPPDATA%\NexoFacturacion\`. Contiene `control.json`, `processes.json`, `data`, `logs`, `secrets` y `caddy-storage`. DACL Windows solo operador y SYSTEM; permisos Unix privados. Se escribe JSON mediante temporal + reemplazo. No sobrescribe claves de una inicialización parcial: **conserva y recupera la configuración**, no borres la clave para reintentar.

`-Mode`, dominio e IP se aplican **al inicializar**. Los puertos sí pueden cambiarse después con `-Action SetPort` (ver [Convivencia con NovaGest](#convivencia-con-novagest-u-otra-app-en-el-mismo-puerto)). Una configuración ya existente se reutiliza. Para ensayar otro despliegue utiliza `-StateDirectory` distinto y datos ficticios; para migrar el mismo negocio, detén el servicio y revisa conjuntamente `control.json`, Caddyfile, orígenes, DNS y rutas de datos/secretos con tu administrador. No recrees claves ni copies bases activas a mano.

Hay exclusión mutua para operaciones de control. Un menú abierto mantiene el bloqueo: usa sus opciones o sal manteniendo servicios antes de ejecutar otra operación. `Status` es lectura. No hay un servicio Windows instalado automáticamente ni alta silenciosa de tareas programadas.

### Convivencia con NovaGest u otra app en el mismo puerto

Nexo usa **`https://localhost:8450`** por defecto (puerto interno 3000). NovaGest (`yhquintero/inventario`) usa **8443** (Web + API) y **8444** en el mismo PC. Las instalaciones de Nexo anteriores a este cambio usaban 8443.

Si dos programas usan el mismo puerto, Windows lo permite sin avisar: uno escucha en `0.0.0.0` y el otro en `127.0.0.1`. Al abrir la dirección aparece **la pantalla de inicio de sesión de la otra aplicación**. La aplicación instalable de NovaGest además guarda su pantalla para usarla sin conexión, y la sigue mostrando en esa dirección aunque su servidor esté apagado.

Ahora el panel:

- comprueba antes de iniciar que el puerto HTTPS y el interno estén libres, y dice qué programa (nombre y PID) los ocupa;
- verifica por HTTPS que responde **esta** instancia de Nexo, no solo «algún servicio»;
- avisa si Windows todavía no confía en la CA local de Nexo.

**Para mover una instalación existente** (conserva datos, cuentas, contraseñas, copias y la confianza en la CA, porque el certificado depende del nombre y no del puerto):

```powershell
git pull
pwsh -NoProfile -File .\control\Panel-Sistema.ps1 -Action SetPort -HttpsPort 8450
# Solo si el puerto interno también está ocupado:
pwsh -NoProfile -File .\control\Panel-Sistema.ps1 -Action SetPort -InternalPort 3010
# Una vez, si aún no lo hiciste (comprueba antes la huella):
pwsh -NoProfile -File .\control\Panel-Sistema.ps1 -Action TrustLocalCA
pwsh -NoProfile -File .\control\Panel-Sistema.ps1 -Action Menu
```

`SetPort` detiene los servicios propios, reescribe el Caddyfile y actualiza `control.json` (origen y orígenes permitidos). No está disponible en modo `Public`, que siempre usa 443. En modo LAN, abre la dirección nueva en cada móvil. Si tenías la regla de firewall del puerto anterior, elimínala desde PowerShell elevado (`Remove-NetFirewallRule -Name Nexo-LAN-HTTPS-8443`) y vuelve a ejecutar `-Action OpenLanFirewall`.

**Si el navegador sigue mostrando NovaGest en `https://localhost:8443`**, es la pantalla que guardó su aplicación instalable. Abre Nexo en la dirección nueva que indica el panel (`https://localhost:8450`). Para limpiar la antigua: en Chrome o Edge, abre `https://localhost:8443` → F12 → *Application* → *Service workers* → *Unregister*, y después *Storage* → *Clear site data*. Hazlo solo si NovaGest no usa esa dirección en este PC, porque en ese caso es suya.

## 3. Confianza HTTPS local/LAN: no basta el candado configurado

El panel genera una CA local con Caddy (`skip_install_trust`). Informa la ruta a `share\Nexo-CA-PUBLICA.crt` y su huella SHA-256. El probe Node confía explícitamente en esa CA **solo para verificar**, sin cambiar el almacén del equipo.

1. Contrasta la huella por un canal independiente/confiable.
2. En Windows, si apruebas esa CA propia:
   ```powershell
   pwsh -NoProfile -File .\control\Panel-Sistema.ps1 -Action TrustLocalCA
   ```
   Pide escribir `CONFIAR` y modifica solo `Cert:\CurrentUser\Root`. Firefox u otros navegadores pueden requerir su propio procedimiento.
3. En cada móvil, instala **solo el certificado raíz público** y habilita confianza mediante el procedimiento del sistema/navegador. En iOS puede requerir activar confianza plena en Ajustes; en Android la aceptación de CA de usuario depende del cliente y política del dispositivo. Verifica el candado y nombre/IP; **no ignores advertencias de certificado**.
4. Nunca compartas `caddy-storage`, `root.key`, `intermediate.key`, claves TLS, `backup.key`, hashes de acceso ni el directorio de estado completo.
5. Desde el móvil abre `https://IP-DEL-SERVIDOR:8450` (o el puerto que muestre el panel), no `localhost`. Usa la misma Wi-Fi, reserva DHCP/IP fija y comprueba que la red no aísle clientes.

Para abrir exclusivamente HTTPS a la subred local en Windows, acción explícita desde PowerShell elevado **solo para esa operación**, con el mismo usuario y estado:

```powershell
pwsh -NoProfile -File .\control\Panel-Sistema.ps1 -Action OpenLanFirewall
# Revocar después, cuando deje de ser necesaria:
pwsh -NoProfile -File .\control\Panel-Sistema.ps1 -Action RemoveLanFirewall
```

Solo perfil Private, `LocalSubnet`, puerto HTTPS y ejecutable Caddy. Nunca abre el puerto interno. No hay cambios automáticos de router/UPnP. No uses perfiles de Wi-Fi pública para el servidor de producción.

## 4. Internet y LAN con un mismo dominio

```powershell
# Ejemplo: sustituye por un dominio que controles; no constituye una publicación realizada.
pwsh -NoProfile -File .\control\Panel-Sistema.ps1 -Mode Public -Domain facturacion.tu-dominio-propio.cu -InstallDependencies
```

Requiere autorización de exposición (`PUBLICAR`), hospedaje nacional o excepción jurídica documentada, DNS A/AAAA correctos, ruta 80/443 hacia Caddy, permiso de firewall revisado y acceso a ACME. Public usa **443** y Caddy gestiona certificados/renovación y redirección HTTP; `-HttpsPort` es para Local/LAN. El backend solo escucha loopback.

Desde LAN utiliza el mismo dominio y certificado público mediante DNS dividido o NAT hairpin correctamente configurados. No añadas un origen HTTP para solucionar una advertencia. Si hay CGNAT, resolver con el proveedor/hospedaje nacional; no se crea un túnel extranjero automáticamente.

Antes de abrir a Internet: restringe acceso administrativo, valora VPN propia/nacional o pasarela de identidad con MFA y revisión de residencia. **Hay cuentas individuales, roles internos y verificación en dos pasos TOTP (actívala en todas las cuentas administrativas o define `REQUIRE_ADMIN_2FA=true`); no hay llaves de seguridad/SSO ni portal aislado por cliente.** Asigna mínimo privilegio y no entregues cuentas internas a Clientes Finales. El firewall, DNS, renovación real, disponibilidad pública y confianza de teléfonos se deben probar en el destino.

## 5. Control diario y publicación del paquete

```powershell
pwsh -NoProfile -File .\control\Panel-Sistema.ps1 -Action Status
pwsh -NoProfile -File .\control\Panel-Sistema.ps1 -Action Restart
pwsh -NoProfile -File .\control\Panel-Sistema.ps1 -Action Stop
pwsh -NoProfile -File .\control\Panel-Sistema.ps1 -Action Backup
pwsh -NoProfile -File .\control\Panel-Sistema.ps1 -Action ExportService
# Nombre explícito; destino NUEVO .zip:
pwsh -NoProfile -File .\control\Panel-Sistema.ps1 -Action ExportService -ExportPath C:\Distribucion\Nexo-Servicio.zip
```

La parada valida PID + fecha de inicio + ejecutable, solicita cierre de Node por señal en archivo privado (no hay endpoint remoto de apagado) y espera hasta 15 s. Si necesita forzar el backend, avisa: revisa integridad/operaciones interrumpidas. No mata procesos por nombre ni un puerto ocupado por terceros.

`ExportService`/`npm run package:service` produce ZIP con fuentes, compilación si existe, panel, guías y manifiesto SHA-256. Excluye `.env`, datos, copias, logs, dependencias, enlaces simbólicos y formatos de claves; rechaza marcadores de claves privadas/hashes incrustados. **No es un anonimizado infalible:** revisa código, documentación y ZIP antes de compartir. El manifiesto detecta alteraciones respecto a esa copia, no es firma independiente. No incluye APK, datos del negocio ni Node/Caddy/PowerShell; el destino necesita prerrequisitos y `npm ci` con acceso al registro o caché verificada.

Si Caddy cambia, el hash fijado bloquea el inicio hasta `-Action ApproveCaddy`, tras contrastar origen/checksum oficial y confirmación `VERIFICADO`. Para política AllSigned firma los scripts con certificado aprobado; no emplees `ExecutionPolicy Bypass`. Si un ZIP verificado conserva marca de Internet, resuelve el desbloqueo/firma con la política del equipo, no globalmente.

Opcionalmente, un administrador puede registrar una tarea **al iniciar sesión** con el mismo usuario, privilegios mínimos, rutas absolutas y argumentos `-NoBrowser -NoBuild`; requiere compilación previa y prueba de reinicio. Esta persistencia no se configura ni se acredita automáticamente.

## 6. Respaldo cifrado y recuperación ensayable

Formato `NXBK0001`, IV aleatorio de 12 bytes, tag AES-256-GCM de 16 bytes, ciphertext y manifiesto SHA-256. La instantánea SQLite usa `VACUUM INTO` sobre datos consistentes, en subdirectorio temporal privado que se retira al terminar. Se conservan cuentas/hashes/eventos, pero se eliminan y compactan las sesiones únicamente en la copia: un backup no desconecta usuarios activos ni una restauración reabre sesiones antiguas. Una clave de 32 bytes **separada de backups** es imprescindible; perderla impide recuperar. La contraseña de acceso no la sustituye. El cifrado de backup no cifra la BD activa ni los archivos PDF/DOCX/XLSX descargados.

Fuera del panel, `.env`/variables deben apuntar a claves y datos correctos:

```powershell
npm run backup:key -- C:\EstadoPrivado\secrets\backup.key  # solo archivo NUEVO
npm run backup
# Solo autentica, descifra y valida SQLite en un destino NUEVO; nunca adopta ni sobreescribe la BD activa.
npm run backup:decrypt -- C:\Copias\facturacion-copia.nxb C:\RecuperacionPrivada\facturacion-verificada.sqlite
```

Con estado del panel, establece temporalmente `BACKUP_KEY_FILE` desde `control.json` (ruta, nunca contenido). Usa `Panel -Action Backup` para producir la copia. `--allow-plaintext` existe **solo laboratorio fuera de producción**, con advertencia; no usar en un negocio.

### Restauración de producción, sin mezclar WAL antiguos

1. Detén escrituras y realiza otro backup protegido si es viable. `Stop` y `Status`: confirma procesos detenidos y anota fecha/incidente.
2. Preserva **íntegro** el directorio original, incluida BD, `-wal`, `-shm`, logs y claves. No borres un WAL ni copies una BD activa suelta.
3. Descifra a archivo NUEVO en directorio privado; tag inválido, clave errónea, truncación o fallo de `quick_check` abortan sin publicar el destino. Comprueba también el manifiesto y el inventario esperado.
4. En un entorno aislado comprueba numeración, contratos, firmas, cadena fiscal, saldos, adjuntos/referencias y último registro recuperado.
5. Para adoptar, crea **otro directorio de datos** protegido con la copia validada como `facturacion.sqlite`; revisa `control.json:dataDir` para apuntar a él con el servicio parado. Nunca dejes un `-wal/-shm` anterior junto a la nueva BD. No sobrescribas ni elimines el original o las claves.
6. Arranca, repite HTTPS/integridad y documenta pérdida máxima observada y tiempo de recuperación. Conserva evidencia de aprobación. El programa no promete RPO/RTO sin esa prueba real.

Programa backups según un RPO aprobado; conserva al menos una copia cifrada desconectada/inmutable en ubicación permitida, clave en otro medio y ensayos regulares. Define rotación/retención: en producción el servidor crea una copia cifrada diaria desde `BACKUP_HOUR` (2) si existe `BACKUP_KEY_FILE` (`BACKUP_AUTO=false` la desactiva) y conserva **en el directorio local** las `BACKUP_KEEP` (30) más recientes, borrando las anteriores; usa `BACKUP_KEEP=0` si la retención fiscal la gestiona el operador. La rotación local no sustituye las copias desconectadas ni recupera claves perdidas.

## 7. Despliegue técnico alternativo

### Desarrollo con datos ficticios

```powershell
npm ci
$env:TLS_MODE='off'; $env:SEED_DEMO='true'; $env:HOST='127.0.0.1'
npm run dev
```

No reutilices una BD real para una demo. `ALLOW_PUBLIC_DEMO` solo admite una base marcada como demostración; no convierte ni desprotege una BD privada. El HTTP de laboratorio no es HTTPS productivo. Arena es únicamente una demostración sintética, no hospedaje aprobado para tus datos reales.

### Node detrás de proxy/directo

Configura `.env.example`. Producción exige origen HTTPS, autenticación, responsable/contacto y país CU declarado o referencia de excepción revisada. `TRUST_PROXY=1/true/*` se rechaza; usa IP/CIDR explícitos y bloqueo de puerto interno. `ALLOWED_ORIGINS` no usa comodines. Proxy debe sobrescribir `X-Forwarded-Proto`/`For` y no permitir origen arbitrario. TLS directo valida correspondencia clave/certificado, fecha y SAN antes de abrir la BD; admite TLS 1.2/1.3. La cadena de confianza externa y su renovación no se demuestran solo con esa validación; rota/reinicia al cambiar material o usa Caddy.

`npm run probe:https -- --url https://tu-dominio` comprueba nombre/cadena y salud. CA propia: añade `--ca ruta-raiz-publica.crt`. No hay `rejectUnauthorized=false`. Un probe desde el servidor no sustituye pruebas desde otra red/teléfono.

### Docker Compose (plantilla sin ejecución local acreditada)

Define variables `NEXO_*`, país/responsable/contacto y archivos secretos; revisa UID/permisos de secretos para que el usuario `node` pueda leerlos **sin** permisos públicos. `docker compose config` y prueba en entorno aislado antes de `up`. Solo Caddy publica 80/443, por defecto en 127.0.0.1; abrir `NEXO_BIND_IP=0.0.0.0` es una decisión explícita. Red de backend interna, IP proxy fija, filesystem de aplicación read-only, volúmenes privados, límites de memoria/PID, capacidades reducidas y sin privilegios adicionales.

Verifica disponibilidad/vulnerabilidades y fija **digest** de las imágenes para una entrega productiva. Las etiquetas fijadas por versión no son inmutables; Docker no estuvo disponible aquí. No se ejecutó escáner de imágenes ni despliegue Docker.

## 8. Incidentes y comprobaciones

- Revisa `data/logs/security.ndjson`: ID de solicitud, ruta de plantilla, estado, ID del actor autenticado cuando procede, eventos y peer seudonimizado. No registra contraseñas, cookies, cuerpos, firmas o IP en claro. Rotación aproximada de 10 MiB × 6 archivos; no es SIEM ni registro sellado. Los logs de stdout del panel requieren conservación/rotación operacional.
- Ante incidente: restringe exposición, conserva evidencia/backup sin sobrescribir, revoca las sesiones/cuentas afectadas desde Usuarios y acceso o recuperación local; un reinicio invalida todas las sesiones, pero **no cambia contraseñas** (rotar el hash inicial tampoco las restablece), evalúa alcance y obligaciones de notificación con el responsable/autoridad competente. No borres huellas. Ley 149 art. 48 no equivale automáticamente al plazo europeo de 72 horas.
- Verifica SO/Defender/EDR, actualizaciones, software/licencias/drivers firmados, BitLocker, cortafuegos, restauración, reloj, DNS/certificados y cuentas con privilegios mínimos. No se inspeccionaron tus equipos.
- Revisa también **Actividad de acceso** (solo administradores): nombres/usuarios y cambios de cuentas son datos personales; conserva evidencia según política. La tabla mantiene hasta 5000 eventos recientes, no un archivo fiscal/pericial inmutable. El peer nuevo es seudonimizado; los registros históricos heredados pueden contener IP en claro y requieren revisión/retención aprobada.
- Móvil: bloqueo, cifrado del dispositivo y navegador actualizados, nada de perfiles/CA desconocidos, ni claves de clientes en notas de soporte. PWA no prueba ausencia de root/jailbreak y no aporta pinning nativo.
- SSE autenticado notifica invalidaciones; reconexión vuelve a consultar. No es un protocolo offline de edición. Los formularios no se envían sin conexión; revisa conflictos de edición. Los clientes/contratos/catálogo no tienen control de versión general por usuario: evita edición simultánea del mismo registro.
