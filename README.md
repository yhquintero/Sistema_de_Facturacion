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
- **Panel:** facturación, cobros, pendientes, actividad reciente, contratos y acceso rápido. Los importes no se mezclan entre monedas.
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
- **Contraseñas y sesiones:** contraseñas con scrypt y sal por cuenta; sesiones de 8 horas en SQLite guardadas como SHA-256 del token (sobreviven a un reinicio, la cookie no se puede reconstruir desde la base). Límite de 10 intentos fallidos por IP cada 15 minutos.
- **Recuperar el acceso** desde la consola del servidor:

  ```bash
  npm run user:reset-password -- admin           # contraseña temporal para una cuenta existente
  npm run user:reset-password -- admin --admin   # además la reactiva como administrador (o la crea)
  # Docker: docker compose exec facturacion npm run user:reset-password -- admin
  ```

- **Modo abierto:** sin cuentas ni `APP_PASSWORD` (desarrollo), cualquiera con la dirección trabaja en el espacio como si fuera administrador, salvo gestionar usuarios. Desde **Usuarios y acceso** puedes crear el primer administrador; a partir de ese momento se exige iniciar sesión. Con `ALLOW_PUBLIC_DEMO=true` en producción no se pueden crear cuentas desde la interfaz.
- **Actualizar desde la contraseña compartida:** en una instalación existente, el primer arranque con esta versión crea `admin` con el valor actual de `APP_PASSWORD`. Desde entonces `APP_PASSWORD` se ignora: cambiarla no modifica ninguna cuenta; usa **Mi cuenta** o el comando de recuperación.

Sigue siendo un espacio de trabajo de un solo negocio: no hay varias empresas, permisos por cliente ni inicio de sesión con proveedores externos (SSO/2FA).

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

La cookie de sesión es HttpOnly, SameSite=Strict y Secure bajo HTTPS correctamente detectado. Hay límite de intentos de acceso y comprobación de origen en solicitudes modificadoras. No expongas directamente el puerto si configuras confianza en un proxy (las IP del registro de accesos dependen de `TRUST_PROXY`).

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

```bash
npm run backup
# Docker:
docker compose exec facturacion npm run backup
```

Se crea una copia SQLite consistente mediante `VACUUM INTO` en `DATA_DIR/backups/`, incluso con WAL activo. Las sesiones activas se eliminan de la copia. Guarda copias cifradas fuera del servidor y aplica una política de retención; contienen datos personales, firmas y los hashes de contraseña de las cuentas. No hay envío automático a servicios externos.

Para restaurar: **detén el servidor**, conserva una copia de lo existente, reemplaza `facturacion.sqlite` por la copia válida, elimina los antiguos archivos auxiliares `facturacion.sqlite-wal`/`facturacion.sqlite-shm` del destino detenido y vuelve a iniciar. Verifica clientes, totales, firmas y huellas. Ensaya la recuperación antes de depender de ella.

## Desarrollo y pruebas

```bash
npm run typecheck
npm test
npm run build
npx playwright install --with-deps chromium
npm run test:e2e
npm audit
```

Las pruebas de dominio/API/exportación crean bases aisladas temporales. Cubren validación, redondeo, numeración, relaciones, firma/consentimiento, instantáneas, integridad, auditoría, persistencia, autenticación, cuentas y la matriz de roles, y las **20 combinaciones de papel/orientación** en los tres formatos. Playwright usa bases desechables en `tmp/`, sin modificar `data/`: prueba CRUD, el flujo contractual completo, el alta de un usuario de solo lectura con cambio de contraseña obligatorio, firma real en canvas, descargas, borradores, táctil y tamaños de 360 a 1440 px. Si usas un Chromium propio, establece `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`.

Hay CI de GitHub Actions para tipos, pruebas, compilación y navegador. La tipografía PDF DejaVu y su licencia están en `server/assets/fonts/`; no se requieren fuentes, CDNs ni APIs externas en ejecución.

### Estructura

```text
src/                 React: panel, clientes, contratos, facturas, catálogo y negocio
shared/              Dominio, actividades oficiales, papel, plantillas y cálculo decimal
server/              Express, SQLite, validación, cuentas/sesiones/roles y exportadores PDF/DOCX/XLSX
public/              Iconos, manifiesto PWA y página de desconexión
scripts/             Copia SQLite, recuperación de acceso e iconos reproducibles
tests/               Pruebas de dominio, HTTP, documentos y navegador
```

API principal: `/api/health`, `/api/session`, `/api/login` (`username`, `password`), `/api/logout`, `/api/setup`, `/api/me/password`, `/api/users`, `/api/users/:id`, `/api/users/:id/sessions`, `/api/security-events`, `/api/dashboard`, `/api/supplier`, `/api/clients`, `/api/contracts`, `/api/catalog`, `/api/invoices`, `/api/invoices/:id/sign`, `/api/invoices/:id/status`, `/api/invoices/:id/integrity`, `/api/invoices/:id/events` y `/api/invoices/:id/export/{pdf|docx|xlsx}?paper=A4&orientation=portrait`.
