# Cómo contribuir a Nexo

¡Gracias por tu interés! Nexo es **software propietario con código visible**: puedes leer el código, abrir issues y proponer cambios mediante pull requests, pero usar el sistema en un negocio requiere una licencia del titular (ver [LICENSE](LICENSE)).

## Antes de empezar

- **Seguridad:** si encuentras una vulnerabilidad, **no abras un issue público**. Sigue [SECURITY.md](SECURITY.md).
- **Datos reales:** nunca subas bases de datos, copias (`*.nxb`), claves, `.env`, contraseñas, códigos 2FA ni capturas con datos de personas reales. Usa siempre los datos de demostración.
- **Fiscalidad:** Nexo prepara información, no presenta declaraciones. Cualquier cambio en `server/fiscal/` debe citar la norma o el instructivo ONAT en que se apoya (ver [docs/ONAT-CUBA.md](docs/ONAT-CUBA.md)).

## Preparar el entorno

Requisitos: **Node.js 22.13 o superior** y npm. Para el panel de Windows, PowerShell 7.4+ y Caddy.

```bash
npm ci
# Laboratorio con datos ficticios (no reutilices una base real):
TLS_MODE=off SEED_DEMO=true HOST=127.0.0.1 npm run dev
```

En PowerShell:

```powershell
$env:TLS_MODE='off'; $env:SEED_DEMO='true'; $env:HOST='127.0.0.1'
npm run dev
```

## Flujo de trabajo

1. Abre o comenta un issue para acordar el cambio antes de dedicarle mucho tiempo.
2. Crea una rama desde `main` con un nombre descriptivo (`fix/pdf-a5-margenes`, `feat/papelera`).
3. Haz commits pequeños con mensajes claros, en español o inglés.
4. Ejecuta las comprobaciones (abajo) y abre el pull request con la plantilla.
5. La CI (Linux + Windows) debe quedar en verde antes de fusionar.

## Comprobaciones obligatorias

```bash
npm run typecheck     # TypeScript sin errores
npm run build         # compilación sin avisos
npm test              # pruebas de dominio, API, seguridad, copias y fiscal
npx playwright install chromium
npm run test:e2e      # recorridos completos en el navegador
npm audit --omit=dev  # sin vulnerabilidades conocidas en producción
```

El panel PowerShell tiene sus propias pruebas en `tests/powershell/Panel.Tests.ps1` (Pester), que la CI ejecuta en Windows.

## Estilo

- **Idioma:** toda la interfaz, los mensajes de error y la documentación de usuario van en **español**, claros y sin jerga técnica.
- **Permisos en el servidor:** cada acción se autoriza en `server/security/authorization.ts`. Ocultar un botón no es un control de seguridad.
- **Importes:** usa `decimal.js` (`shared/`) para el dinero; nunca `number` con decimales.
- **Compatibilidad de datos:** una base existente debe actualizarse sin borrar ni recrear nada. Añade migraciones idempotentes.
- **Colores:** escribe `src/index.css` con colores normales; `scripts/theme-colors.ts` genera el modo oscuro. Las zonas `.paper-sheet` y `.theme-keep-light` se quedan en claro.
- **Accesibilidad:** controles con nombre accesible, foco visible y navegación con teclado.

## Capturas del README

Las imágenes de `docs/assets/` se generan con datos de demostración:

```bash
node --import tsx tests/e2e-server.ts   # en otra terminal
npm run docs:capturas
```

## Registro de cambios

Añade una línea en la sección «Sin publicar» de [CHANGELOG.md](CHANGELOG.md) describiendo el cambio desde el punto de vista de quien usa Nexo.

## Licencia de las contribuciones

Al enviar una contribución aceptas la cláusula 6 de [LICENSE](LICENSE): declaras que tienes derecho a aportarla y concedes al titular una licencia para usarla como parte de Nexo. Contribuir no otorga derecho de uso del sistema.
