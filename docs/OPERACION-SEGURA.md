# Operación segura · Web + Servidor + Móvil

**Alcance:** Nexo, un espacio de administración de un Suministrador TCP en Cuba. El teléfono utiliza la misma web/PWA y base del servidor; **no es un APK ni un portal multicliente aislado**. Fecha de revisión: 2026-11-04.

## 1. Antes de datos reales

- Equipo y sistema operativo soportados, Node **22.13+** (validado aquí con 22.22.3), **PowerShell 7.4+** y Caddy oficial. Windows PowerShell 5.1 no basta. Comprueba `node --version`, `pwsh --version`, `caddy version`.
- Instala los binarios desde sus proyectos oficiales y contrasta checksums/origen. El panel **no descarga ejecutables**, no omite ExecutionPolicy, no deshabilita antivirus y no instala CA ni abre firewall sin una acción explícita.
- Confirma ubicación física de servidor y réplicas, aviso de privacidad, responsable, conservación y registro/gestiones que procedan. Para Cuba, Res. 58/2022 art. 7 impide asumir que un túnel o nube extranjera es una opción predeterminada válida. Ver auditoría y fuentes.
- Activa y verifica BitLocker/LUKS o cifrado equivalente del almacenamiento. **SQLite no se cifra por la aplicación.** Protege también exportaciones y equipos móviles.
- No uses cuentas de administrador para la operación habitual. No compartas la frase de acceso con clientes; la firma actual es asistida/supervisada por el Suministrador.

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

Se comprueba Node, se ejecuta `npm ci` solo al pedir `-InstallDependencies`, se compila salvo `-NoBuild`, se valida Caddy, se inicia el backend, se verifica una **identidad de instancia** sobre salud de loopback y después HTTPS con cadena y nombre. Un servicio ajeno que conteste en el mismo puerto no basta para declarar el nuevo backend listo. Un error de inicio detiene únicamente procesos propios comprobados.

**No supone instalación validada en tu Windows.** En Arena se comprobó gramática PowerShell mediante tree-sitter; el parser real/DACL/ciclo Caddy se ejecutaron satisfactoriamente en CI Windows con fixtures el 2026-11-06; ver VERIFICACION.md. Esa VM no sustituye el equipo del usuario ni prueba confianza interactiva de CA, firewall o teléfonos físicos. Ejecuta primero con fixtures en el equipo de destino.

### Estado privado y cambios de modo

Por defecto: `%LOCALAPPDATA%\NexoFacturacion\`. Contiene `control.json`, `processes.json`, `data`, `logs`, `secrets` y `caddy-storage`. DACL Windows solo operador y SYSTEM; permisos Unix privados. Se escribe JSON mediante temporal + reemplazo. No sobrescribe claves de una inicialización parcial: **conserva y recupera la configuración**, no borres la clave para reintentar.

`-Mode`, dominio e IP se aplican **al inicializar**. Una configuración ya existente se reutiliza. Para ensayar otro despliegue utiliza `-StateDirectory` distinto y datos ficticios; para migrar el mismo negocio, detén el servicio y revisa conjuntamente `control.json`, Caddyfile, orígenes, DNS y rutas de datos/secretos con tu administrador. No recrees claves ni copies bases activas a mano.

Hay exclusión mutua para operaciones de control. Un menú abierto mantiene el bloqueo: usa sus opciones o sal manteniendo servicios antes de ejecutar otra operación. `Status` es lectura. No hay un servicio Windows instalado automáticamente ni alta silenciosa de tareas programadas.

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
5. Desde el móvil abre `https://IP-DEL-SERVIDOR:8443`, no `localhost`. Usa la misma Wi-Fi, reserva DHCP/IP fija y comprueba que la red no aísle clientes.

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

Antes de abrir a Internet: restringe acceso administrativo, valora VPN propia/nacional o pasarela de identidad con MFA y revisión de residencia. **No existe MFA/RBAC individual dentro de Nexo en esta entrega.** No distribuyas la contraseña general a Clientes Finales. El firewall, DNS, renovación real, disponibilidad pública y confianza de teléfonos se deben probar en el destino.

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

Formato `NXBK0001`, IV aleatorio de 12 bytes, tag AES-256-GCM de 16 bytes, ciphertext y manifiesto SHA-256. La instantánea SQLite usa `VACUUM INTO` sobre datos consistentes, en subdirectorio temporal privado que se retira al terminar. Una clave de 32 bytes **separada de backups** es imprescindible; perderla impide recuperar. La contraseña de acceso no la sustituye. El cifrado de backup no cifra la BD activa ni los archivos PDF/DOCX/XLSX descargados.

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

Programa backups según un RPO aprobado; conserva al menos una copia cifrada desconectada/inmutable en ubicación permitida, clave en otro medio y ensayos regulares. Define rotación/retención: el programa no purga automáticamente copias fiscales ni recupera claves perdidas.

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

- Revisa `data/logs/security.ndjson`: ID de solicitud, ruta de plantilla, estado, actor compartido, eventos y peer seudonimizado. No registra contraseñas, cookies, cuerpos, firmas o IP en claro. Rotación aproximada de 10 MiB × 6 archivos; no es SIEM ni registro sellado. Los logs de stdout del panel requieren conservación/rotación operacional.
- Ante incidente: restringe exposición, conserva evidencia/backup sin sobrescribir, revoca acceso rotando hash y reiniciando (sesiones en memoria), evalúa alcance y obligaciones de notificación con el responsable/autoridad competente. No borres huellas. Ley 149 art. 48 no equivale automáticamente al plazo europeo de 72 horas.
- Verifica SO/Defender/EDR, actualizaciones, software/licencias/drivers firmados, BitLocker, cortafuegos, restauración, reloj, DNS/certificados y cuentas con privilegios mínimos. No se inspeccionaron tus equipos.
- Móvil: bloqueo, cifrado del dispositivo y navegador actualizados, nada de perfiles/CA desconocidos, ni claves de clientes en notas de soporte. PWA no prueba ausencia de root/jailbreak y no aporta pinning nativo.
- SSE autenticado notifica invalidaciones; reconexión vuelve a consultar. No es un protocolo offline de edición. Los formularios no se envían sin conexión; revisa conflictos de edición. Los clientes/contratos/catálogo no tienen control de versión general por usuario: evita edición simultánea del mismo registro.
