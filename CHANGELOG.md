# Registro de cambios

Todos los cambios relevantes de Nexo se documentan aquí. El formato sigue [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y el proyecto usa [versionado semántico](https://semver.org/lang/es/).

## [Sin publicar]

### Corregido

- **«No seguro» en `https://localhost:8450`:** `TrustLocalCA` muestra ahora las huellas que realmente aparecen en el navegador (SHA-256 del certificado raíz) y en el aviso de Windows (SHA-1), no el hash del archivo. Explica el aviso de Windows y comprueba que el certificado quedó instalado. Si ya estaba instalado, lo dice. Indica también cómo reiniciar Edge o Chrome para que dejen de mostrar «No seguro», y cómo importarlo en Firefox.
- **Nexo abría la pantalla de inicio de sesión de NovaGest:** las dos aplicaciones usaban `https://localhost:8443` en el mismo PC. Nexo usa ahora **8450** por defecto (también en `TLS_MODE=direct`).
- El panel comprueba antes de iniciar que el puerto HTTPS y el interno estén libres. Si están ocupados, dice qué programa los usa (nombre, PID, dirección) y cómo resolverlo.
- La verificación HTTPS exige el identificador de esta instancia de Nexo a través de Caddy. Otro servicio que conteste en ese puerto ya no se da por bueno.
- Aviso si Windows todavía no confía en la CA local de Nexo.
- El Caddyfile se genera con una sola función, compartida por la inicialización, `SetPort` y las pruebas de CI.

- **Instalación con conexión inestable:** `-InstallDependencies` ya no se detiene al primer `ECONNRESET`. Reintenta `npm ci` hasta 4 veces con esperas crecientes, reintenta cada descarga dentro de npm y reutiliza la caché verificada (`--prefer-offline`), de modo que cada intento continúa desde lo ya descargado.
- Si las dependencias ya corresponden al `package-lock.json`, no se vuelve a descargar nada.
- Mensajes de error con pasos concretos según la causa: red, proxy, certificado, archivos bloqueados o lockfile desincronizado. Los avisos `deprecated` de dependencias indirectas se resumen en una línea.
- Aviso más claro en `-Action Menu` y `Start` cuando faltan las dependencias.

### Añadido

- **Primer acceso guiado:** guía [docs/PRIMER-ACCESO.md](docs/PRIMER-ACCESO.md). Al iniciar, el panel recuerda con qué usuario entrar.
- `-Action ResetPassword [-User usuario]` y opción **[6]** del menú: contraseña temporal con la base de esa instalación, sin variables de entorno a mano. Con `admin`, la cuenta se reactiva o se crea.
- Opción **[7]** del menú para confiar en el certificado sin salir del menú.
- `-Action SetPort -HttpsPort N [-InternalPort N]` mueve una instalación existente a otro puerto sin tocar datos, cuentas, copias ni la confianza en la CA.
- La opción «Estado» del menú muestra la dirección de Nexo.
- `-NpmRegistry https://…` para usar un registro espejo solo durante la instalación. Cada paquete se sigue verificando con la huella del `package-lock.json`.

## [1.1.0] — 2026-11-06

### Seguridad (al estilo NovaGest)

- **Verificación en dos pasos (TOTP)** por cuenta, con código QR y 10 códigos de recuperación de un solo uso. Un administrador puede restablecerla (teléfono perdido) y `npm run user:reset-password -- <usuario> --reset-2fa` lo hace desde la consola.
- `REQUIRE_ADMIN_2FA=true` obliga a los administradores a activarla antes de operar.
- **Bloqueo persistente:** 5 intentos fallidos bloquean esa cuenta desde esa conexión durante 5 minutos (`LOGIN_MAX_ATTEMPTS`, `LOGIN_LOCK_MINUTES`). El bloqueo sobrevive a reinicios.
- **Cierre por inactividad** (`SESSION_IDLE_MINUTES`, 30) con aviso «¿Sigues ahí?» y duración máxima de sesión (`SESSION_MAX_HOURS`, 8).
- **Mis sesiones:** ver y cerrar los demás dispositivos abiertos.
- **Copias cifradas desde la Web:** crear y descargar copias AES-256-GCM, rotación (`BACKUP_KEEP`) y copia diaria automática (`BACKUP_HOUR`, `BACKUP_AUTO`).
- Normalización de `FRAME_ANCESTORS` y nuevo [SECURITY.md](SECURITY.md).

### Proyecto y documentación

- README renovado con capturas reales, insignias, ficha del proyecto y preguntas frecuentes.
- Sitio del proyecto en GitHub Pages (`docs/index.html`).
- Licencia propietaria ([LICENSE](LICENSE)), [CONTRIBUTING.md](CONTRIBUTING.md), [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) y este registro.
- Plantillas de issues y de pull requests.
- `npm run docs:capturas` regenera las capturas con datos de demostración.

### Rendimiento

- Las pantallas secundarias (factura, contratos, catálogo, análisis, fiscal, seguridad, usuarios y perfil) se cargan bajo demanda. El paquete inicial baja de 602 kB a 379 kB y la compilación ya no muestra avisos.

## [1.0.0] — 2026-11-06

Primera versión completa, fusionada en `main` a través de los PR #1 a #16.

### Añadido

- **Facturación** (#1): Suministrador → Cliente → Contrato → Factura → Conformidad, con firma táctil del Cliente Final, huella de contenido e historial. Exportación real a **PDF, Word y Excel** en A3, A4, A5, B4, B5, Letter, Legal, Folio, Executive y Tabloid, en vertical u horizontal. Desglose técnico por equipo: hardware, sistema operativo, programas y controladores.
- **Cuentas personales y cuatro roles** (#2): Administrador, Gestor, Técnico y Solo lectura, aplicados en el servidor. Contraseñas temporales, cambio obligatorio y actividad de acceso.
- **Experiencia Web** (#4): paleta de comandos `Ctrl/⌘ + K`, atajos de teclado, tema automático/claro/oscuro, tamaño de letra, avisos, primeros pasos y **Análisis y metas**.
- **HTTPS y operación segura** (#3): TLS directo o proxy Caddy, panel PowerShell para Windows, cabeceras CSP/HSTS, CSRF, límites de acceso, copias cifradas `.nxb` y restauración a archivo nuevo.
- **Fiscal · Cuba / ONAT** (#3): perfil fiscal, cobros, gastos, tributos, conciliación y auxiliares XLSX/CSV/ZIP de preparación. La DJ-08 oficial sigue bloqueada hasta verificar el modelo del ejercicio.
- Tiempo real entre dispositivos (SSE autenticado) y PWA instalable.

### Corregido

- Conflicto de dependencias npm y errores de arranque del panel (#14).
- Instalación de Caddy cuando la Microsoft Store no está disponible (#15).
- Comprobación de Caddy antes de instalar dependencias en el primer arranque (#16).

### Mantenimiento

- Dependabot: `actions/checkout` 7, `actions/upload-artifact` 7, `actions/setup-node` 7, imagen Node 26, TypeScript 7, Express 5.3 y `lucide-react` 1.x (#5–#12).

[Sin publicar]: https://github.com/yhquintero/Sistema_de_Facturacion/compare/main...HEAD
[1.1.0]: https://github.com/yhquintero/Sistema_de_Facturacion/pulls?q=is%3Apr+is%3Aopen
[1.0.0]: https://github.com/yhquintero/Sistema_de_Facturacion/pulls?q=is%3Apr+is%3Amerged
