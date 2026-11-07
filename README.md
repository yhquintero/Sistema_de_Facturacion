# Nexo · Sistema de Facturación

Web profesional en español + servidor Express/SQLite + PWA móvil para **Suministrador → Cliente → Contrato → Factura → Conformidad**. Preparación fiscal enfocada en **Cuba, TCP/persona natural, ingresos 2026**.

> Endurecimiento técnico no equivale a certificación ni aceptación ONAT. La DJ-08 oficial y la presentación están **bloqueadas** hasta verificar plantilla/instructivo/reglas del ejercicio. La demo contiene datos sintéticos; no alojes información real en Arena/GitHub ni en nube extranjera sin revisión de residencia/excepción legal.

## Inicio recomendado: HTTPS con panel PowerShell

Requisitos: **Node ≥22.13, PowerShell ≥7.4 y Caddy oficial** instalados/verificados. Desde la raíz:

```powershell
# Local: inicia Web + API + tiempo real + HTTPS y abre navegador.
pwsh -NoProfile -File .\control\Panel-Sistema.ps1 -InstallDependencies

# Primera inicialización para móvil en red local (cambia por TU IP privada fija).
pwsh -NoProfile -File .\control\Panel-Sistema.ps1 -Mode LAN -LanAddress 192.168.1.20 -InstallDependencies

# Menú y operaciones posteriores:
pwsh -NoProfile -File .\control\Panel-Sistema.ps1 -Action Menu
pwsh -NoProfile -File .\control\Panel-Sistema.ps1 -Action Stop
pwsh -NoProfile -File .\control\Panel-Sistema.ps1 -Action Backup
pwsh -NoProfile -File .\control\Panel-Sistema.ps1 -Action ExportService
```

El modo se conserva tras inicializar. El panel solicita frase sin eco, guarda scrypt y clave independiente de backups en estado privado, valida procesos propios y HTTPS, no abre router ni instala CA silenciosamente. **Cada PC/teléfono debe confiar explícitamente en la CA local** tras verificar huella. Internet exige dominio/DNS/ACME y hospedaje permitido; no está publicado automáticamente. Ver [operación segura](docs/OPERACION-SEGURA.md) antes de usar datos reales.

**Estado de validación:** Node/Linux y navegador ejercitados; scripts sin errores de gramática PowerShell según tree-sitter. CI Linux y Windows con parser real/ACL/Caddy pasó con fixtures; ver [evidencia de CI](docs/VERIFICACION.md). Esto no acredita una instalación en tu Windows/móvil real ni un escaneo TLS público. Docker Compose es una plantilla aún sin ejecución local.

## Lo que incluye

- Escritorio/tablet/móvil, búsqueda, clientes, contratos, catálogo, perfil del Suministrador, resumen financiero y persistencia SQLite WAL.
- Se preserva PR #4: paleta Ctrl/⌘+K, atajos, tema automático/claro/oscuro, tamaño de letra, avisos y primeros pasos; **Análisis y metas** por moneda, CSV e informe imprimible. Las metas se guardan en el servidor, solo Admin las cambia. El análisis comercial por estado de factura **no sustituye cobros/asientos del libro fiscal**.
- Textos íntegros de ambas actividades en `shared/types.ts`; no se reescriben ni se confunde su texto con autorización fiscal.
- Desglose económico y técnico por equipo: hardware/serie/activo; SO/edición/versión/licencia/actualizaciones; programas/versiones/licencias/configuración; drivers/proveedor/versión y pruebas de verificación.
- Firma del Cliente Final con consentimiento de conformidad, snapshot histórico, huella de contenido y registro de eventos. No es firma digital certificada ni autentica de forma independiente al firmante.
- PDF real (PDFKit/fuentes locales), DOCX real y XLSX real. **A3, A4, A5, B4, B5, Letter, Legal, Folio, Executive y Tabloid**, vertical/horizontal.
- HTTPS directo TLS1.2/1.3 o proxy restringido, scrypt, sesión HttpOnly/SameSite/Secure bajo HTTPS, CSRF/origen, límites de acceso/exportación, CSP/HSTS, errores saneados y logs sin cuerpos/credenciales.
- SSE autenticado entre dispositivos, reconexión/resincronización, indicadores visibles. No edición offline ni datos fiscales en caché PWA.
- Copias consistentes **AES-256-GCM**: diaria automática en producción con rotación (`BACKUP_KEEP`), creación/descarga desde **Usuarios y acceso**, restauración autenticada solo a archivo nuevo y paquete de servicio con manifiesto sin directorios de datos/secretos.
- **Fiscal · Cuba / ONAT**: perfil/vector declarado, cobros/gastos/tributos/seguridad social/retenciones, soporte, cambio documentado→CUP, reversión/idempotencia, resumen mensual y conciliación. XLSX/CSV/ZIP de preparación, no formularios oficiales.
- **Cuentas personales y cuatro roles** aplicados por el servidor, contraseñas temporales/cambio obligatorio, desactivación, revocación de sesiones y actividad de acceso. Se conservan las cuentas incorporadas por PR #2.
- **Verificación en dos pasos (TOTP)** por cuenta con QR y 10 códigos de recuperación de un solo uso; opcionalmente obligatoria para administradores (`REQUIRE_ADMIN_2FA=true`). **Bloqueo de 5 minutos tras 5 intentos fallidos** por usuario y conexión, aviso «¿Sigues ahí?» antes del cierre por inactividad y **Mis sesiones** para cerrar otros dispositivos. Ver [SECURITY.md](SECURITY.md).
- Pantalla **Seguridad y operación** (administradores) y aviso de privacidad inicial. Llaves de seguridad/SSO, aislamiento entre negocios/clientes, sellado externo, certificación, contabilidad NCIF completa y modelos finales ONAT siguen pendientes.

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

## Usuarios, roles y acceso

Entra con **usuario y contraseña**, no con una contraseña compartida. En la primera inicialización, el panel crea `admin` con la frase introducida. En Node/Compose, `ADMIN_USERNAME` (por defecto `admin`) identifica la primera cuenta creada con el hash/credencial de arranque. **Una base que ya contiene cuentas conserva sus usuarios, hashes y roles; la credencial de arranque no sustituye sus contraseñas ni permite saltarse el login.** No borres ni recrees la BD para actualizar.

| Acción | Administrador | Gestor | Técnico | Solo lectura |
|---|:-:|:-:|:-:|:-:|
| Consultar datos comerciales y descargar facturas | Sí | Sí | Sí | Sí |
| Preparar borradores / recoger firma asistida | Sí | Sí | Sí | No |
| Clientes, contratos, catálogo y ciclo de emisión/cobro/anulación | Sí | Sí | No | No |
| Perfil del Suministrador, usuarios y estado de seguridad | Sí | No | No | No |
| Consultar / exportar auxiliares fiscales | Sí | Sí | No | Sí |
| Perfil fiscal, movimientos y reversiones | Sí | Sí | No | No |

- El administrador invita desde **Usuarios y acceso**, asigna rol y entrega la contraseña temporal por un canal seguro. El cambio obligatorio bloquea datos/operaciones hasta elegir contraseña propia. Se protege la existencia de al menos un administrador activo.
- **Mi cuenta** permite cambiar la contraseña con la actual; revoca las demás sesiones. Desactivar/restablecer una cuenta revoca sus sesiones; el rol vigente se vuelve a leer en cada solicitud. La interfaz no es el control de seguridad.
- Nuevas contraseñas: 14–1024 caracteres, scrypt con sal aleatoria. Los hashes de PR #2 siguen verificándose (incluida su normalización NFKC); al cambiar contraseña se usa el formato reforzado. No se cambia una contraseña por actualizar el servidor.
- **Verificación en dos pasos:** cada persona la activa en **Mi cuenta** con cualquier app TOTP (Google Authenticator, Microsoft Authenticator, Aegis…). Desactivarla exige contraseña y código; un administrador puede restablecerla a otra persona (teléfono perdido) y `npm run user:reset-password -- <usuario> --reset-2fa` lo hace desde la consola.
- **Bloqueo:** `LOGIN_MAX_ATTEMPTS` (5) fallos de contraseña o código bloquean esa cuenta desde esa conexión `LOGIN_LOCK_MINUTES` (5), con intentos restantes en el mensaje; persiste tras reinicios. Se suma a los límites en memoria por conexión/cuenta/global.
- Cookies HttpOnly/Strict/Secure bajo HTTPS, CSRF por sesión, `SESSION_IDLE_MINUTES` (30) de inactividad con aviso previo en pantalla y `SESSION_MAX_HOURS` (8) absolutas; máximo 20 sesiones por cuenta / 256 globales. Reiniciar el proceso cierra las sesiones, **no** elimina las cuentas. Las copias excluyen sesiones sin desconectar usuarios del servidor activo.
- El registro comercial conserva autor individual y **Actividad de acceso** es solo de administradores; no es un registro inmutable ni identifica criptográficamente al Cliente Final. Todos estos roles pertenecen al **mismo negocio**, no son cuentas aisladas para clientes.
- Ni siquiera un administrador puede reescribir el contenido de una factura emitida/firmada; se conservan los límites de integridad. Portal multicliente y llaves de seguridad siguen pendientes.

**Recuperación local:** en el servidor y con `DATA_DIR` apuntando a la base correcta, `npm run user:reset-password -- <usuario> [--admin | --reset-2fa]` genera una contraseña temporal, la muestra una vez y revoca sesiones. `--admin` recupera/crea un administrador activo; requiere acceso al SO, no es un endpoint público. Cambiar `APP_PASSWORD` o regenerar el hash inicial **no** restablece cuentas existentes. Ver el procedimiento y las rutas del panel en [operación segura](docs/OPERACION-SEGURA.md#cuentas-personales-y-recuperación).

## Documentación y auditoría, en el orden solicitado

1. [Auditoría jurídica/técnica, estándares, capas, hallazgos, plan y balance](docs/AUDITORIA-SEGURIDAD.md)
2. [Inicio HTTPS, confianza LAN/móvil, Internet, panel, backup/recuperación y Docker](docs/OPERACION-SEGURA.md)
3. [Alcance fiscal Cuba TCP 2026, auxiliares y gates de DJ-08/otros informes](docs/ONAT-CUBA.md)
4. [Evidencia de verificaciones y límites](docs/VERIFICACION.md)

## Desarrollo y comprobación

```powershell
npm ci
# Solo laboratorio ficticio (no reutilizar base real):
$env:TLS_MODE='off'; $env:SEED_DEMO='true'; $env:HOST='127.0.0.1'
npm run dev

npm run typecheck
npm run build
npm test
npx playwright install chromium
npm run test:e2e
npm audit
```

`.env.example` corresponde a producción protegida: adapta origen, IP exacta del proxy, archivos de secretos, responsable/contacto y país físico confirmado. No uses `TRUST_PROXY=1`. El panel administra variables/configuración privada aparte y no carga `.env`.

```text
control/                 Panel .ps1 y módulo operativo
server/security/         Sesiones/CSRF, scrypt, cabeceras, logs, backups cifrados
server/fiscal/           Libro, conciliación, validaciones y auxiliares
server/realtime.ts       SSE autenticado con límites y resincronización
src/views/               Web y páginas fiscal/seguridad
shared/                  Modelos, textos oficiales, Decimal y tamaños de papel
scripts/                 CLI hash/clave/backup/descifrado/probe HTTPS/paquete
tests/                   Dominio, API, TLS, seguridad, backup, fiscal, paquete, navegador y PS
```

No se incluyen datos ni secretos en Git. Los cambios de archivos quedan guardados en la rama de trabajo; no hace falta borrar o recrear la base para actualizar. Consulta los procedimientos de recuperación/migración antes de mover una BD con WAL.
