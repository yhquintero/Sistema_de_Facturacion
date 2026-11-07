# Avisos de terceros

Nexo es software propietario (ver [LICENSE](LICENSE)), pero se apoya en componentes de terceros que **conservan sus propias licencias**. Esas licencias prevalecen sobre LICENSE en lo que respecta a cada componente.

El texto completo de cada licencia se instala junto al paquete en `node_modules/<paquete>/LICENSE`. Para regenerar el inventario completo, incluidas las dependencias indirectas:

```bash
npx license-checker-rseidelsohn --production --summary
```

## Incluidos en la aplicación (ejecución)

| Componente | Versión | Licencia | Uso en Nexo |
|---|---|---|---|
| [React](https://react.dev) y React DOM | 19.x | MIT | Interfaz Web |
| [Express](https://expressjs.com) | 5.x | MIT | Servidor HTTP y API |
| [Zod](https://zod.dev) | 4.x | MIT | Validación de datos en el servidor |
| [decimal.js](https://github.com/MikeMcl/decimal.js) | 10.x | MIT | Importes sin errores de redondeo |
| [PDFKit](https://pdfkit.org) | 0.16 | MIT | Facturas en PDF |
| [docx](https://docx.js.org) | 9.x | MIT | Facturas en Word |
| [ExcelJS](https://github.com/exceljs/exceljs) | 4.x | MIT | Facturas y auxiliares en Excel |
| [JSZip](https://stuk.github.io/jszip/) | 3.x | MIT o GPL-3.0 (se usa bajo MIT) | Paquetes ZIP de auxiliares fiscales |
| [node-qrcode](https://github.com/soldair/node-qrcode) | 1.x | MIT | QR de la verificación en dos pasos |
| [pngjs](https://github.com/pngjs/pngjs) | 7.x | MIT | Imágenes de firma |
| [Lucide](https://lucide.dev) (`lucide-react`) | 1.x | ISC | Iconos |
| [tsx](https://tsx.is) | 4.x | MIT | Ejecución del servidor TypeScript |
| [DejaVu Sans](https://dejavu-fonts.github.io) | 2.x | Licencia libre de Bitstream Vera / DejaVu | Fuente de los PDF (`server/assets/fonts/LICENSE.txt`) |

Dependencias indirectas de producción (resumen): MIT, ISC, BSD-3-Clause, Apache-2.0, Unlicense y MIT AND Zlib. Ninguna exige publicar el código de Nexo.

## Solo para desarrollo y pruebas (no se distribuyen)

| Componente | Licencia |
|---|---|
| [Vite](https://vite.dev) y `@vitejs/plugin-react` | MIT |
| [Tailwind CSS](https://tailwindcss.com) y `@tailwindcss/vite` | MIT |
| [TypeScript](https://www.typescriptlang.org) | Apache-2.0 |
| [Playwright](https://playwright.dev) | Apache-2.0 |
| [pdf-lib](https://pdf-lib.js.org) | MIT |
| PostCSS y tipos `@types/*` | MIT |

## Herramientas externas (no incluidas en el repositorio)

| Herramienta | Licencia | Uso |
|---|---|---|
| [Caddy](https://caddyserver.com) | Apache-2.0 | Proxy HTTPS opcional que instala el usuario |
| [Node.js](https://nodejs.org) | MIT | Entorno de ejecución |
| [PowerShell](https://github.com/PowerShell/PowerShell) | MIT | Panel de control en Windows |
