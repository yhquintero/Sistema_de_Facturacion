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

**Estado de validación:** Node/Linux y navegador ejercitados; scripts sin errores de gramática PowerShell según tree-sitter. CI Windows con parser real/ACL/Caddy quedó añadido, pero no se acredita su ejecución ni una instalación Windows/móvil real o un escaneo TLS público. Docker Compose es una plantilla aún sin ejecución local.

## Lo que incluye

- Escritorio/tablet/móvil, búsqueda, clientes, contratos, catálogo, perfil del Suministrador, resumen financiero y persistencia SQLite WAL.
- Textos íntegros de ambas actividades en `shared/types.ts`; no se reescriben ni se confunde su texto con autorización fiscal.
- Desglose económico y técnico por equipo: hardware/serie/activo; SO/edición/versión/licencia/actualizaciones; programas/versiones/licencias/configuración; drivers/proveedor/versión y pruebas de verificación.
- Firma del Cliente Final con consentimiento de conformidad, snapshot histórico, huella de contenido y registro de eventos. No es firma digital certificada ni autentica de forma independiente al firmante.
- PDF real (PDFKit/fuentes locales), DOCX real y XLSX real. **A3, A4, A5, B4, B5, Letter, Legal, Folio, Executive y Tabloid**, vertical/horizontal.
- HTTPS directo TLS1.2/1.3 o proxy restringido, scrypt, sesión HttpOnly/SameSite/Secure bajo HTTPS, CSRF/origen, límites de acceso/exportación, CSP/HSTS, errores saneados y logs sin cuerpos/credenciales.
- SSE autenticado entre dispositivos, reconexión/resincronización, indicadores visibles. No edición offline ni datos fiscales en caché PWA.
- Copias consistentes **AES-256-GCM**, restauración autenticada solo a archivo nuevo y paquete de servicio con manifiesto sin directorios de datos/secretos.
- **Fiscal · Cuba / ONAT**: perfil/vector declarado, cobros/gastos/tributos/seguridad social/retenciones, soporte, cambio documentado→CUP, reversión/idempotencia, resumen mensual y conciliación. XLSX/CSV/ZIP de preparación, no formularios oficiales.
- Pantalla **Seguridad y operación** y aviso de privacidad inicial. MFA, cuentas/RBAC individuales, sellado externo, certificación, contabilidad NCIF completa y modelos finales ONAT siguen pendientes.

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
