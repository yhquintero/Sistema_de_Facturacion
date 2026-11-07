# Evidencia de verificación y límites de entrega

Fecha de revisión local: **2026-11-04, America/Havana**; los nombres de logs/artefactos pueden usar UTC del día siguiente. Base `d43c537`, rama `arena/8420774d-sistema-de-facturacion`. Datos exclusivamente sintéticos. No certifica producción, ONAT ni legalidad de un alojamiento concreto.

## Ejecutado en este entorno

| Comprobación | Resultado | Alcance |
|---|---|---|
| `npm run typecheck` | **PASS** | TypeScript estricto de web/shared/backend/scripts/tests |
| `npm test` | **67/67 PASS**, 0 fallos, 0 omitidas | Dominio, API, exportación, seguridad, TLS local, backup, fiscal, paquete y arranque |
| `npm run build` | **PASS** | tsc + Vite 6.4.5; frontend compilado de producción |
| `npm run test:e2e` | **9/9 PASS** | Playwright/Chromium Linux; escritorio, pantallas 360–1440 px y firma táctil emulada; no teléfonos físicos |
| `npm audit --json` | **0 avisos conocidos**, todos los niveles | Dependencias del proyecto/lockfile. No scanner de malware, análisis de imagen ni prueba de ausencia de 0-days |
| Parser tree-sitter-powershell 0.26.6 | **Sin errores de gramática** | `control/Panel-Sistema.ps1`, `control/Nexo.Control.psm1`, `tests/powershell/Panel.Tests.ps1`; **no equivale** al parser/ejecutor real PowerShell |
| Paquete de servicio | ZIP producido y verificable | Allowlist, exclusión de datos/secrets/.env, manifest de hashes; pruebas de no sobrescritura, nombres únicos y rechazo de symlink/marcadores |
| Actividades oficiales | Preservadas | `shared/types.ts` sin modificación; pruebas verifican texto íntegro |

Entorno: **Node 22.22.3, npm 10.9.8, Debian 12, OpenSSL**. Se usó Chromium 153.0.0 de paquete npm temporal `@sparticuz/chromium` con bibliotecas incluidas para ejecutar las pruebas; no se añadió como dependencia del producto. Ejecución local del navegador:

```bash
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/tmp/chromium LD_LIBRARY_PATH=/tmp/al2023/lib:/tmp npm run test:e2e
```

En un checkout limpio, ejecuta `npm run build` antes de `npm test`: la regresión de arranque levanta el servidor productivo real y exige el frontend compilado.

En CI/destino normal: `npx playwright install --with-deps chromium` y `npm run test:e2e`. No replicar flags de un navegador de prueba como política de seguridad de los equipos de usuarios.

Los logs de trabajo están en `tmp/tests-delivery.log`, `tmp/build-delivery.log`, `tmp/e2e-delivery.log`, `tmp/audit-after.json` (no versionados ni parte del paquete). La evidencia reproducible persistente es el código de pruebas y los comandos, no un certificado emitido por un tercero.

## Pruebas añadidas y qué acreditan

- `tests/security.test.ts`: scrypt salado/verificación/formatos; configuración productiva; rechazo de proxies globales/incorrectos; Host/Origin/Fetch-Metadata/HTTPS; cookie `__Host-`/Secure/HttpOnly/Strict; CSRF ausente/erróneo/válido; logout y pérdida de acceso; caducidad inactividad HTTP/absoluta; SSE autenticado sin PII y revocado; rate limit y logs sin credenciales/nombres.
- `tests/tls.test.ts`: certificado/clave/SAN y protocolo; CA de laboratorio confiable frente a no confiable; probe HTTPS sin bypass; rechazo TLS1.1; fallo de configuración **antes** de crear BD. OpenSSL estuvo disponible: estas pruebas **no se omitieron**. No prueba cadena pública/ACME ni renovación real.
- `tests/backups.test.ts`: snapshot consistente con WAL comprometido, AES-256-GCM sin texto del comprobante, SHA-256, permisos Unix, restauración a archivo nuevo y lectura de SQLite, clave equivocada/tag/truncación/header, limpieza de temporales y prohibición de key dentro de backups.
- `tests/fiscal.test.ts`: factura `pagada` no inventa cobros; año/mes y CUP/moneda original; redondeo Decimal; fechas/importes/tasas/soportes; clasificación de gasto; idempotencia/reversión; sobrecobro; cobro de factura de año previo y anulación con cobros; perfil/vector; manipulación de payload o índice detectada, write/export bloqueado; DJ-08 devuelve 409; XLSX cinco hojas, CSV sin fórmulas y hashes de ZIP.
- `tests/package-service.test.ts`: archivo real ZIP/manifest; salida nueva/repetible; exclusión de `.env`, claves/datos; rechazo de claves privadas incrustadas y enlaces simbólicos (el caso symlink solo aplica cuando el SO lo permite).
- `tests/control-startup.test.ts`: handshake local de identidad del backend; señal privada de parada y cierre SQLite comprobado; demo pública no acepta una BD marcada privada.
- `tests/domain.test.ts`: nueva prueba protege contenido de factura emitida incluso sin firma y permite actualizar estado de cobro; permanecen las pruebas previas de firmas, snapshots, Decimal, numeración, borradores, actividades y validación.
- `tests/e2e/fiscal-security.spec.ts`: alta/reversión del libro, descarga XLSX, sincronización en otra ventana/contexto; interfaz fiscal/seguridad sin overflow móvil; dos sesiones protegidas con token CSRF y sin recarga. No demuestra aislamiento entre clientes: ambas sesiones pertenecen al mismo negocio.
- `tests/e2e/workflows.spec.ts`: se conservan flujos completos Cliente→Contrato→Factura→anexo→firma→PDF/DOCX/XLSX, móvil táctil y PWA privada; ahora también aviso de privacidad antes del login y logout con CSRF.

## Ampliación de evidencia CI — 2026-11-06 (America/Havana)

La [ejecución GitHub Actions del commit `74af521`](https://github.com/yhquintero/Sistema_de_Facturacion/actions/runs/42319313336) terminó con **`test: success` y `windows-control: success`**. Es evidencia externa al sandbox, con datos sintéticos:

- Linux: instalación del lockfile, auditoría npm, typecheck, compilación, suite Node/API, SBOM CycloneDX y suite Playwright.
- Windows: checksum oficial **SHA-512** de Caddy 2.11.9; parser PowerShell nativo, módulo, DACL privada, JSON atómico, rechazo de identidad PID incorrecta, selección de una única ruta Node según prioridad PATH, inicio Web/API/Caddy, probe HTTPS que verifica CA/nombre, backup cifrado, restart y stop.
- Corregidos antes del merge: construir el frontend **antes** de la prueba de arranque productivo; usar el algoritmo SHA-512 establecido en `.goreleaser.yml` de Caddy; seleccionar solo el primer ejecutable cuando hay varias instalaciones en PATH. Se mantienen los fallos como exit codes no cero y anotaciones diagnósticas; no se desactivaron controles para pasar CI.

No acredita Windows del usuario, instalación/confianza interactiva de CA, regla de firewall, dispositivos físicos, despliegue público, Docker ni aceptación ONAT. Las advertencias de Actions sobre runtime Node 20 migrado a Node 24 son no bloqueantes; actualizar los pins de acciones, con revisión, sigue siendo mantenimiento de cadena de suministro. Los gates de producción de abajo no desaparecen porque CI esté verde.

## Límites de entorno y pruebas pendientes

- CI `.github/workflows/ci.yml`: acciones fijadas a SHA, npm audit, pruebas/build/browser, SBOM CycloneDX; job Windows que descarga Caddy oficial fijado, contrasta SHA-512 oficial de la distribución y ejecuta parser PowerShell real, módulo, DACL privada, JSON atómico, comprobación PID, inicio con HTTPS local, backup, reinicio y parada. **La ampliación anterior acredita un run Linux/Windows con fixtures; no una instalación productiva ni la interacción en los equipos del usuario.**
- `tests/powershell/Panel.Tests.ps1 -Integration`: listo para el runner/equipo Windows, no sustituto de probar la introducción interactiva de frase, política de ejecución, confianza CA y firewall en el Windows del usuario.
- Caddy/PowerShell/Docker nativos no estaban instalados en el sandbox. Descargas de binarios por redirect de GitHub no estuvieron disponibles; no se ignoró TLS ni se usó un túnel para eludir restricciones. La gramática PS se comprobó separadamente mediante parser temporal de npm, sin afirmar ejecución Windows.
- No hubo escaneo de puertos/SSL público, pentest externo, carga/DoS, escáner de imágenes Docker, revisión AV/EDR/BitLocker, Wi-Fi/router real, Android/iOS físicos, instalación nativa ni pinning.
- No hubo acceso autorizado a cuenta ONAT, vector fiscal del usuario, aceptación de archivo, firma digital certificada, envío de declaración o resolución jurídica sobre residencia/transferencias.

## Gates de aceptación de producción

1. Windows/OS soportado, prerrequisitos/origen, DACL/cifrado de disco y recuperación de claves comprobados.
2. Hospedaje/replicación permitidos, responsable/privacidad/derechos/conservación/gestiones legales aprobados.
3. Certificado/nombre/cadena, DNS/ruta/red/firewall, puerto interno cerrado y renovación comprobados desde otro equipo/móvil/red.
4. Restauración con datos representativos y RPO/RTO **medidos**, no solamente un backup creado.
5. Cuenta individual/MFA/roles si deja de ser un único administrador; no compartir credencial general con clientes.
6. Vector y modelos/instructivos/régimen/ejercicio aprobados por titular/asesor; dejar DJ-08 oficial bloqueada hasta completar sus pruebas de aceptación.
7. Revisión independiente y retest de riesgo proporcional al negocio; ningún umbral de tests o `audit=0` equivale a homologación/certificación.
