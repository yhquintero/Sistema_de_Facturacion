# Nexo · Sistema de Facturación

Aplicación en español para un **Suministrador** de desarrollo de software y soporte técnico: clientes, contratos, facturas detalladas, instalación por equipo y conformidad del **Cliente Final**. Web responsive, API con SQLite y experiencia móvil instalable (PWA); un solo servidor y una sola base de datos.

## Empezar

Requisitos: **Node.js 22.13 o superior** y npm. SQLite está incluido en Node; no necesitas instalar un servidor de base de datos.

```bash
npm ci
npm run dev
```

Abre `http://localhost:3000`. El servidor escucha en `0.0.0.0`; desde otro dispositivo de tu red usa la dirección del servidor, no `localhost`. El frontend utiliza URLs relativas: web, API y descargas comparten el mismo origen.

**Sin `.env`, el desarrollo inicia una base demostrativa** con tres clientes, contratos y facturas. Todos los documentos del espacio demostrativo se identifican como ejemplos. Las firmas precargadas son sintéticas y no representan aceptaciones reales.

### Un espacio vacío para tus datos reales

```bash
cp .env.example .env
# Edita .env: SEED_DEMO=false, DATA_DIR=./data-real y APP_PASSWORD=<contraseña del primer administrador>
npm run build
npm start
```

- `DATA_DIR` debe señalar una **base nueva** para aplicar `SEED_DEMO=false`. Cambiar la variable no elimina ni transforma documentos existentes.
- El espacio vacío conserva el catálogo editable de servicios, pero no crea clientes, contratos, facturas, datos fiscales ni firmas ficticias. El impuesto inicial es **0 %**: configura el que corresponda.
- Completa **Mi negocio**, incluidos tus datos fiscales y de contacto. Los dos textos oficiales de actividades están protegidos contra cambios.
- En el primer arranque, `APP_PASSWORD` crea la cuenta **`admin`** (o la definida en `ADMIN_USERNAME`). Entra con ese usuario y crea las cuentas del equipo en **Usuarios y acceso**.
- Usa HTTPS y una contraseña fuerte antes de exponer datos personales. `npm start` exige `APP_PASSWORD` (≥12 caracteres) mientras no exista ninguna cuenta, salvo la habilitación explícita de una demostración pública.

## Qué incluye

- **Usuarios y roles:** cuentas personales con contraseña propia, cuatro roles aplicados por el servidor, contraseñas temporales, desactivación, cierre de sesiones y registro de accesos. Ver [Usuarios, roles y acceso](#usuarios-roles-y-acceso).
- **Panel:** saludo, avisos (cobros vencidos o por vencer, contratos por terminar), primeros pasos guiados, facturación, cobros, pendientes, actividad reciente y acceso rápido. Los importes no se mezclan entre monedas.
- **Análisis y metas:** facturado del mes frente al anterior, acumulado del año, ticket promedio, tasa de cobro, antigüedad de lo pendiente (al día, 1–30, 31–60, más de 60 días), mejores clientes y tendencia de 6, 12 o 24 meses con la meta mensual. Metas mensuales y anuales por moneda, con aviso de si el ritmo actual llega. Datos de la gráfica en tabla, CSV e informe imprimible.
- **Experiencia:** paleta de comandos `Ctrl/⌘ + K`, atajos de teclado, tema automático/claro/oscuro, tamaño de letra ajustable y campana de avisos. Ver [Experiencia de uso](#experiencia-de-uso).
- **Clientes:** datos fiscales, contacto y representante autorizado.
- **Contratos Suministrador ↔ Cliente:** alcance, vigencia, moneda, condiciones, garantías, cláusulas y declaración de recepción.
- **Facturas:** numeración correlativa, descuentos por línea, impuestos configurables, notas y estados de cobro. Los importes se calculan en el servidor; no se confía en totales enviados por el navegador.
- **Instalación por equipo:** modelo, serie, activo, hardware, respaldo previo, modalidad, sistemas operativos, programas, drivers y verificación de entrega.
- **Conformidad:** firma manuscrita con ratón, lápiz o pantalla táctil; nombre, identificación, cargo, consentimiento y fecha del servidor.
- **Documentos:** exportación real a PDF, Word y Excel, con datos de las partes, contrato, detalle económico/técnico, condiciones y firmas. El PDF incorpora fuentes Unicode; Excel tiene dos hojas y fórmulas recalculables.
- **Móvil:** navegación adaptada, controles táctiles, manifiesto, iconos y página de desconexión. Instálala desde el navegador en Android/escritorio o con «Añadir a pantalla de inicio» en iOS. La instalación y el service worker requieren HTTPS (o `localhost`).

### Actividades oficiales — literales

**Actividad Principal**

> Diseño, desarrollo e implementación de aplicaciones informáticas multiplataforma (web, móviles y de escritorio), incluyendo el análisis de requerimientos, la programación, las pruebas y el despliegue de soluciones de software a medida.

**Actividad Secundaria**

> Servicios de soporte técnico y mantenimiento de sistemas informáticos, que comprenden: diagnóstico y reparación de hardware y software; instalación, configuración y actualización de sistemas operativos, aplicaciones y controladores; montaje y mantenimiento de equipos de cómputo, periféricos y servidores; así como la recuperación de datos y la asistencia técnica remota y presencial a usuarios.

### Desglose de instalación

Cada equipo permite múltiples elementos de cada clasificación:

| Clasificación | Datos registrados |
|---|---|
| **Sistemas operativos** | Familia (Windows Desktop/Server, GNU/Linux, macOS, virtualización, móvil/embebido), edición/versión, arquitectura, intervención, particionado, licencia, actualizaciones y notas. |
| **Programas / aplicaciones** | Ofimática; utilidades; seguridad/respaldo; diseño/CAD/multimedia; desarrollo/bases de datos/servidores; software contable/empresarial/a medida. Versión, licencia y configuración. |
| **Controladores / firmware** | Chipset/BIOS, GPU, almacenamiento/RAID, red, audio, impresión/POS y energía/seguridad. Dispositivo, fabricante, versión, fuente, verificación y notas. |
| **Entrega** | Arranque/rendimiento, dispositivos sin errores, red/periféricos, integridad de datos y pendientes técnicos. |

Las plantillas son referencias **editables**, no una afirmación de que un producto esté instalado, actualizado, licenciado o soportado. Las verificaciones empiezan desmarcadas. Comprueba versión, licencia, ciclo de soporte y compatibilidad reales; nunca registres claves de activación ni credenciales. Los precios del anexo técnico son cero: los cargos van en las líneas económicas para evitar duplicarlos.

### Papel internacional

Todos los formatos permiten **vertical y horizontal**, con márgenes y dimensiones físicas coherentes:

| Papel | Dimensiones verticales (mm) |
|---|---:|
| ISO A3 | 297 × 420 |
| ISO A4 | 210 × 297 |
| ISO A5 | 148 × 210 |
| ISO B4 | 250 × 353 |
| ISO B5 | 176 × 250 |
| Carta / Letter | 215,9 × 279,4 |
| Oficio / Legal | 215,9 × 355,6 |
| Folio | 215,9 × 330,2 |
| Executive | 184,15 × 266,7 |
| Tabloid | 279,4 × 431,8 |

«Oficio» puede significar otro tamaño según el país: aquí equivale a Legal de 8,5 × 14 pulgadas; Folio de 8,5 × 13 es una opción aparte. ISO B4/B5 **no son JIS B4/B5**: Excel utiliza B4 nativo y dimensiones explícitas para B5. La impresora y la aplicación de Office deben admitir el tamaño elegido; revisa la configuración de impresión. La vista de lectura web es continua: **Vista PDF real** muestra la paginación final. Word/Excel pueden redistribuir páginas según su versión y las fuentes disponibles.

## Experiencia de uso

Inspirada en la Web de [NovaGest](https://github.com/yhquintero/inventario), adaptada a la facturación.

- **Paleta de comandos (`Ctrl/⌘ + K` o `/`):** busca facturas, clientes y contratos sin distinguir mayúsculas ni tildes («logistico» encuentra «Logístico») y resalta lo que coincide. También ejecuta acciones: nueva factura, nuevo cliente, ver vencidas, cambiar tema… Usa ↑ ↓ y Enter. Solo muestra lo que tu rol permite.
- **Atajos de teclado:** funcionan cuando no estás escribiendo en un campo. Pulsa `?` para verlos todos.

  | Tecla | Acción |
  | --- | --- |
  | `Ctrl/⌘ + K`, `/` | Buscar o ejecutar una acción |
  | `N` | Nueva factura |
  | `T` | Cambiar tema |
  | `G` y luego `R` `F` `C` `O` `S` `A` `N` `U` | Ir a Resumen, Facturas, Clientes, Contratos, Catálogo, Análisis, Mi negocio o Usuarios |
  | `?` | Lista de atajos |

- **Tema automático, claro u oscuro:** «Automático» sigue al sistema y cambia en vivo si el equipo pasa a modo nocturno. La hoja de la factura y el lienzo de firma siguen en blanco, como el papel, y la impresión sale siempre en claro. Se elige en **Apariencia**, con el botón de la barra superior o con `T`.
- **Tamaño de letra:** Normal, Grande o Muy grande. Agranda textos, iconos y botones a la vez; al imprimir se usa el normal. Tema y letra se guardan en cada navegador.
- **Avisos:** la campana y el Resumen avisan de facturas vencidas (urgente), facturas que vencen en 7 días, conformidades pendientes, contratos que terminan en 30 días o que siguen activos tras su fin y borradores sin tocar en 14 días. El menú Facturas se marca en rojo si hay vencidas.
- **Primeros pasos:** una lista en el Resumen guía la puesta en marcha: datos del negocio, primer cliente, contrato, factura, firma y meta. Se puede ocultar.

Las metas se guardan en el servidor (`GET/PUT /api/goals`): todos las consultan y solo quien edita **Mi negocio** (administrador) puede cambiarlas.

> Para desarrolladores: `src/index.css` se escribe con colores normales. Al compilar, `scripts/theme-colors.ts` convierte cada color en una variable y calcula su versión oscura (mismo tono, luz invertida; los textos nunca bajan de una luz legible y las sombras no se invierten). Para que un color de acento se aclare en oscuro, usa tonos con luminosidad inferior al 50 %. Las zonas con `.theme-keep-light` o `.paper-sheet` se quedan en claro.

## Flujo de trabajo

1. Configura tus datos como **Suministrador**, cuenta bancaria, impuestos, numeración y firma.
2. Registra al **Cliente** y a su representante autorizado.
3. Crea un contrato vigente con el alcance y la moneda correspondientes.
4. Emite la factura desde el contrato. Añade servicios y, si corresponde, equipos con SO, programas y drivers. Revisa las verificaciones, garantías y pendientes.
5. El **Cliente Final revisa** contrato, desglose económico y anexo antes de firmar y dar consentimiento.
6. Descarga `.pdf`, `.docx` o `.xlsx` con el papel y orientación deseados. Actualiza el cobro sin modificar el contenido aceptado.

Un borrador puede guardarse sin contrato o servicios, pero no firmarse. Emitir exige cliente fiscalmente identificado, datos completos del Suministrador, contrato vigente/en ejecución, fecha dentro de su vigencia, misma moneda y alcance compatible. No se elimina una factura emitida: se anula. Una anulación es terminal.

### Integridad y límites de la firma

- Al firmar se congela una instantánea de **Suministrador, Cliente y contrato** y se registra SHA-256 del contenido comercial/técnico, condiciones y firma del Suministrador. Cambios posteriores en las fichas no reescriben la factura aceptada.
- El servidor valida el PNG y la presencia de tinta, exige consentimiento, impide sobreescrituras y rechaza una revisión obsoleta. Registra creación, ediciones, firma y cambios de cobro.
- **Integridad y registro de actividad** muestra la huella, su coincidencia y los eventos. Si el contenido firmado deja de coincidir, se bloquean sus exportaciones.
- El estado de cobro y la presentación del papel quedan fuera de la huella. La imagen/ficha de la firma del Cliente se registra por separado; la huella protege el contenido aceptado, no proporciona autenticación criptográfica de esa identidad.
- Es una **firma manuscrita electrónica**, no una firma digital certificada, una PKI ni un sello de tiempo independiente. No hay verificación externa de identidad, enlace público de firma ni portal de acceso por cliente. El Suministrador debe verificar la autorización del firmante; la eficacia jurídica depende del país y del contrato.
- Word y Excel son editables. Su huella textual no certifica un archivo modificado: contrástalo con el original del servidor. El registro SQLite tampoco es un libro inalterable frente al administrador de la base de datos.
- Esta aplicación no implementa autorización tributaria, factura electrónica fiscal de una jurisdicción concreta, contabilidad completa ni certificación legal. Adapta impuestos y documentos a la normativa aplicable.

### Cálculo monetario

Aritmética decimal y redondeo comercial **HALF_UP a dos decimales**: importe bruto por línea → descuento por línea → suma neta → impuesto global → total. Excel reproduce las mismas etapas con `ROUND` y resultados precalculados. No se implementan retenciones, múltiples tasas por línea ni monedas sin dos decimales. Límite de subtotal/total por factura: 9.999.999.999,99.

## Usuarios, roles y acceso

Cada persona entra con **su propio usuario y contraseña**. El rol se comprueba en el servidor en cada solicitud; la interfaz solo oculta lo que el servidor rechazaría.

| Permiso | Administrador | Gestor de facturación | Técnico | Solo lectura |
|---|:-:|:-:|:-:|:-:|
| Consultar todo y descargar PDF/Word/Excel | ✓ | ✓ | ✓ | ✓ |
| Gestionar usuarios y ver el registro de accesos | ✓ | — | — | — |
| Editar **Mi negocio** (Suministrador) | ✓ | — | — | — |
| Catálogo, clientes y contratos | ✓ | ✓ | — | — |
| Crear y editar **borradores** (incluido el anexo técnico por equipo) | ✓ | ✓ | ✓ | — |
| Emitir, editar emitidas, cambiar estado de cobro y anular | ✓ | ✓ | — | — |
| Eliminar borradores | ✓ | ✓ | — | — |
| Registrar la firma del Cliente Final | ✓ | ✓ | ✓ | — |

- **Alta:** el administrador crea la cuenta con una contraseña temporal (puede generarla) que se muestra una sola vez. Por defecto se exige cambiarla en el primer acceso; hasta entonces el servidor bloquea cualquier otra operación.
- **Cambios inmediatos:** un cambio de rol se aplica en la siguiente solicitud, sin volver a iniciar sesión. Desactivar una cuenta o asignarle una contraseña nueva cierra sus sesiones. Cambiar la propia contraseña (desde **Mi cuenta**, con la actual) cierra las demás sesiones.
- **Trazabilidad:** las cuentas no se eliminan, se desactivan. El registro de actividad de cada factura indica quién creó, editó, cambió el cobro o registró la firma. **Actividad de acceso** guarda inicios de sesión, intentos fallidos, altas, cambios de rol, restablecimientos y cierres de sesión (los últimos 5000 eventos). Nunca se registran contraseñas.
- **Protecciones:** nadie puede cambiar su propio rol ni desactivarse, y siempre queda al menos un administrador activo. Los usuarios usan minúsculas, números, punto o guion; las contraseñas tienen al menos 12 caracteres.
- **Contraseñas y sesiones:** contraseñas con scrypt y sal por cuenta; sesiones en SQLite guardadas como SHA-256 del token (sobreviven a un reinicio, la cookie no se puede reconstruir desde la base). Duración máxima de 12 horas y **cierre por inactividad a los 30 minutos**: un minuto antes aparece «¿Sigues ahí?» con cuenta atrás, y la pantalla de acceso explica por qué se cerró. Otra pestaña en uso mantiene viva la sesión.
- **Bloqueo por intentos:** 5 fallos seguidos (contraseña o código de verificación) bloquean ese usuario desde esa IP durante 5 minutos, aunque después se escriba la contraseña correcta. El mensaje indica cuántos intentos quedan. Además, cada IP admite como máximo 30 fallos cada 15 minutos.
- **Verificación en dos pasos (TOTP):** desde **Mi cuenta → Verificación en dos pasos** se escanea un código QR con Google Authenticator, Microsoft Authenticator, 1Password, Aegis u otra app compatible. Al activarla se muestran **10 códigos de recuperación** de un solo uso (se pueden copiar o descargar y solo se guardan sus huellas SHA-256). Un código ya usado no vale dos veces. Desactivarla exige la contraseña y un código. Con `REQUIRE_ADMIN_2FA=true` los administradores deben activarla antes de poder trabajar.
- **Mis sesiones:** cada persona ve en **Mi cuenta** los dispositivos con sesión abierta (navegador, IP y última actividad) y puede cerrar uno o todos los demás.
- **Recuperar el acceso** desde la consola del servidor:

  ```bash
  npm run user:reset-password -- admin           # contraseña temporal para una cuenta existente
  npm run user:reset-password -- admin --admin   # además la reactiva como administrador (o la crea)
  npm run user:reset-password -- ana --reset-2fa # desactiva su verificación en dos pasos (teléfono perdido)
  # Docker: docker compose exec facturacion npm run user:reset-password -- admin
  ```

- **Modo abierto:** sin cuentas ni `APP_PASSWORD` (desarrollo), cualquiera con la dirección trabaja en el espacio como si fuera administrador, salvo gestionar usuarios. Desde **Usuarios y acceso** puedes crear el primer administrador; a partir de ese momento se exige iniciar sesión. Con `ALLOW_PUBLIC_DEMO=true` en producción no se pueden crear cuentas desde la interfaz.
- **Actualizar desde la contraseña compartida:** en una instalación existente, el primer arranque con esta versión crea `admin` con el valor actual de `APP_PASSWORD`. Desde entonces `APP_PASSWORD` se ignora: cambiarla no modifica ninguna cuenta; usa **Mi cuenta** o el comando de recuperación.

Si alguien pierde el teléfono y sus códigos, un administrador puede **restablecer su verificación en dos pasos** desde su ficha en **Usuarios y acceso** (se cierran sus sesiones). La política completa, las cabeceras y cómo informar de una vulnerabilidad están en [`SECURITY.md`](SECURITY.md).

Sigue siendo un espacio de trabajo de un solo negocio: no hay varias empresas, permisos por cliente ni inicio de sesión con proveedores externos (SSO).

## Servidor, acceso y persistencia

| Variable | Uso |
|---|---|
| `PORT` | Puerto HTTP; `3000` por defecto. |
| `DATA_DIR` | Directorio de SQLite; `./data` por defecto. Usa almacenamiento persistente. |
| `APP_PASSWORD` | Contraseña del primer administrador; ≥12 caracteres. Solo se usa si aún no existe ninguna cuenta. |
| `ADMIN_USERNAME` | Usuario de ese primer administrador; `admin` por defecto. |
| `SEED_DEMO` | `true` incluye ejemplos; `false` crea un espacio vacío. Solo afecta al primer arranque de una base nueva. Por defecto: demostración en desarrollo y vacío en producción. |
| `ALLOW_PUBLIC_DEMO` | `true` permite producción sin contraseña, **únicamente con datos ficticios**. |
| `TRUST_PROXY` | `1` si hay exactamente un proxy de confianza con HTTPS; `0` por defecto. |
| `SESSION_IDLE_MINUTES` / `SESSION_MAX_HOURS` | Cierre por inactividad (`30`; `0` lo desactiva) y duración máxima de la sesión (`12`). |
| `LOGIN_MAX_ATTEMPTS` / `LOGIN_LOCK_MINUTES` | Intentos fallidos antes del bloqueo temporal (`5`) y su duración (`5`). |
| `REQUIRE_ADMIN_2FA` | `true` obliga a los administradores a activar la verificación en dos pasos. |
| `FRAME_ANCESTORS` | Quién puede mostrar Nexo en un `<iframe>` en producción: `self` (por defecto), `none` u orígenes concretos. |
| `BACKUP_KEY` | Clave (≥16 caracteres) para cifrar las copias con AES-256-GCM. Sin ella se guardan sin cifrar. |
| `BACKUP_KEEP` / `BACKUP_HOUR` / `BACKUP_AUTO` / `BACKUP_DIR` | Copias conservadas (`30`), hora de la copia diaria (`2`), `false` para desactivarla y directorio (`DATA_DIR/backups`). |

La cookie de sesión es HttpOnly, SameSite=Strict y Secure bajo HTTPS correctamente detectado. Toda solicitud modificadora debe llevar la cabecera propia `X-Nexo-Request: 1` y venir del mismo origen (anti-CSRF). En producción se envían `Content-Security-Policy` sin scripts en línea, `X-Frame-Options`, `Cross-Origin-Opener-Policy`/`Resource-Policy` y `Permissions-Policy`, y `Strict-Transport-Security` bajo HTTPS. En desarrollo no se envía CSP porque Vite necesita scripts en línea. No expongas directamente el puerto si configuras confianza en un proxy (las IP del registro de accesos dependen de `TRUST_PROXY`).

`data/facturacion.sqlite` guarda los datos, las firmas en PNG, las cuentas (con contraseñas cifradas mediante scrypt) y el registro de accesos. Se habilitan claves foráneas y WAL; el archivo y las copias se crean con permisos privados en sistemas POSIX. No lo publiques en Git. El service worker **nunca almacena APIs, documentos, sesiones o firmas**; el modo móvil necesita conexión para consultar, guardar, firmar o exportar. No es una aplicación nativa para tiendas ni un sistema offline de edición.

### Docker

```bash
cp .env.example .env
# Define APP_PASSWORD y deja SEED_DEMO=false.
docker compose up --build -d
docker compose logs -f facturacion
```

El contenedor ejecuta Node sin privilegios, incluye comprobación de salud y conserva SQLite en el volumen `facturacion-data`. El puerto se publica por defecto en `127.0.0.1:3000`: pon un proxy HTTPS delante. Ajusta `TRUST_PROXY=1` solo si ese proxy es de confianza. No uses `docker compose down -v` si quieres conservar tus datos. La configuración Docker se proporciona, pero su construcción no se ejecutó en el entorno de desarrollo sin Docker.

### Copias de seguridad y restauración

En producción se hace **una copia automática diaria** a partir de `BACKUP_HOUR` y se conservan las `BACKUP_KEEP` más recientes. Los administradores ven el estado (última copia, cifrado, programación), crean copias al momento y las descargan desde **Usuarios y acceso → Copias de seguridad**. Cada copia y cada descarga queda en la actividad de acceso.

```bash
npm run backup                                   # crea una copia y aplica la rotación
npm run backup:verify                            # descifra y comprueba la más reciente (o -- <archivo> / -- --all)
npm run backup:restore -- <archivo> --yes        # restaura (con el servidor detenido)
# Docker:
docker compose exec facturacion npm run backup
```

Cada copia es una instantánea consistente de SQLite (`VACUUM INTO`, válida con WAL activo) **sin sesiones abiertas ni bloqueos de acceso**, comprimida con gzip y, si existe `BACKUP_KEY`, **cifrada con AES-256-GCM** (`nexo-<fecha>.sqlite.gz.enc`; clave derivada con scrypt y sal propia por copia; cualquier alteración se detecta al descifrar). Guarda `BACKUP_KEY` en un gestor de contraseñas fuera del servidor: **sin ella no se puede restaurar**. Copia también los archivos a otro disco o ubicación; no hay envío automático a servicios externos.

`backup:restore` comprueba la integridad antes de tocar nada, guarda la base actual como `facturacion.sqlite.antes-de-restaurar-<fecha>`, elimina los auxiliares WAL y deja la copia en su lugar. Todas las personas deberán volver a iniciar sesión. Verifica clientes, totales, firmas y huellas, y ensaya la recuperación antes de depender de ella. Las copias antiguas de `facturacion-*.sqlite` (sin comprimir) se siguen reconociendo.

## Desarrollo y pruebas

```bash
npm run typecheck
npm test
npm run build
npx playwright install --with-deps chromium
npm run test:e2e
npm audit
```

Las pruebas de dominio/API/exportación crean bases aisladas temporales. Cubren avisos, cálculos de análisis y metas, búsqueda sin tildes, la paleta oscura derivada, validación, redondeo, numeración, relaciones, firma/consentimiento, instantáneas, integridad, auditoría, persistencia, autenticación, cuentas y la matriz de roles, la seguridad (vectores TOTP del RFC 6238, reutilización de códigos, códigos de recuperación, bloqueo por intentos, anti-CSRF, cabeceras, inactividad, «Mis sesiones», cifrado/rotación/restauración de copias), y las **20 combinaciones de papel/orientación** en los tres formatos. Playwright usa bases desechables en `tmp/`, sin modificar `data/`: prueba CRUD, el flujo contractual completo, la paleta de comandos, los atajos, el tema oscuro persistente, las metas, el alta de un usuario de solo lectura con cambio de contraseña obligatorio, la activación de la verificación en dos pasos con acceso mediante código de recuperación y la ausencia de infracciones de CSP en producción, firma real en canvas, descargas, borradores, táctil y tamaños de 360 a 1440 px. Si usas un Chromium propio, establece `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`.

Hay CI de GitHub Actions para tipos, pruebas, compilación y navegador. La tipografía PDF DejaVu y su licencia están en `server/assets/fonts/`; no se requieren fuentes, CDNs ni APIs externas en ejecución.

### Estructura

```text
src/                 React: panel, análisis y metas, clientes, contratos, facturas, catálogo y negocio
src/lib/             Avisos, análisis, búsqueda y preferencias (funciones puras, probadas)
shared/              Dominio, actividades oficiales, papel, plantillas y cálculo decimal
server/              Express, SQLite, validación, cuentas/sesiones/roles y exportadores PDF/DOCX/XLSX
public/              Iconos, manifiesto PWA y página de desconexión
scripts/             Copia SQLite, recuperación de acceso, iconos y tema oscuro derivado
tests/               Pruebas de dominio, HTTP, documentos y navegador
```

API principal: `/api/health`, `/api/session`, `/api/login` (`username`, `password`), `/api/login/2fa` (`challenge`, `code`), `/api/logout`, `/api/setup`, `/api/me/password`, `/api/me/2fa/{setup|enable|disable|recovery-codes}`, `/api/me/security`, `/api/me/sessions[/:id|/others]`, `/api/backups[/:archivo]`, `/api/users`, `/api/users/:id`, `/api/users/:id/sessions`, `/api/security-events`, `/api/dashboard`, `/api/supplier`, `/api/goals`, `/api/clients`, `/api/contracts`, `/api/catalog`, `/api/invoices`, `/api/invoices/:id/sign`, `/api/invoices/:id/status`, `/api/invoices/:id/integrity`, `/api/invoices/:id/events` y `/api/invoices/:id/export/{pdf|docx|xlsx}?paper=A4&orientation=portrait`.
