# Metadatos del repositorio en GitHub

Valores de la página del repositorio `https://github.com/yhquintero/Sistema_de_Facturacion`. Requieren **permisos de administración**. Si hay que volver a aplicarlos, cópialos desde aquí.

## 1 · Descripción («About»)

**Settings → General → Description**, en una línea:

```text
Nexo: facturación para TCP en Cuba — clientes, contratos, facturas PDF/Word/Excel, firma de conformidad y registro fiscal ONAT. Web PWA + servidor propio Express/SQLite con HTTPS, 2FA y copias cifradas
```

## 2 · Temas (`topics`)

**About → ⚙ → Topics** (solo minúsculas, números y guiones):

```text
facturacion
facturas
cuba
onat
tcp
pwa
react
typescript
express
sqlite
vite
offline-first
2fa
```

## 3 · Sitio web (`homepage`) y GitHub Pages

El sitio está en [`docs/index.html`](index.html): autocontenido y con rutas relativas a `docs/assets/`.

**Publicarlo:** *Settings → Pages* → *Source*: **Deploy from a branch** → *Branch*: **`main`** y carpeta **`/docs`** → **Save**. Queda en:

```text
https://yhquintero.github.io/Sistema_de_Facturacion/
```

> `docs/.nojekyll` ya está incluido: GitHub publica los archivos tal cual, sin procesarlos con Jekyll.

Después, pon esa dirección en **About → Website**.

## 4 · Vista previa social

*Settings → General → Social preview → Edit → Upload an image*: [`docs/assets/social-preview.png`](assets/social-preview.png) (1920 × 960, proporción 2:1). Esta imagen solo se puede subir desde la Web de GitHub; la API no lo permite.

## 5 · Con la CLI de GitHub

```bash
gh api -X PATCH repos/yhquintero/Sistema_de_Facturacion \
  -f description="…" -f homepage="https://yhquintero.github.io/Sistema_de_Facturacion/"
gh api -X PUT repos/yhquintero/Sistema_de_Facturacion/topics \
  -f "names[]=facturacion" -f "names[]=facturas" -f "names[]=cuba"   # …
gh api -X POST repos/yhquintero/Sistema_de_Facturacion/pages \
  -f "source[branch]=main" -f "source[path]=/docs"
```

## 6 · Regenerar las capturas

```bash
node --import tsx tests/e2e-server.ts   # servidor de demostración en otra terminal
npm run docs:capturas
```
