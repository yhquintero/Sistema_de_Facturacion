/**
 * Tema claro / oscuro derivado automáticamente de la hoja de estilos.
 *
 * `src/index.css` se escribe con colores literales (más fácil de leer y mantener). Al compilar,
 * este módulo recorre cada declaración, sustituye cada color por un token `var(--nx-…)` y añade
 * al final la paleta clara (`:root`) y su equivalente oscuro (`:root[data-theme="dark"]`).
 *
 * El color oscuro se calcula invirtiendo la luminosidad en HSL (se conserva el tono): los fondos
 * claros pasan a superficies oscuras y los textos oscuros a textos claros. Las sombras no se
 * invierten (una sombra blanca parecería un brillo) y algunas piezas se fijan a mano en
 * `DARK_OVERRIDES` para mantener la jerarquía página < tarjeta.
 *
 * Las zonas marcadas con `.theme-keep-light` (la hoja de la factura, el lienzo de firma) siguen
 * en claro aunque el resto esté en oscuro: representan papel.
 */
import postcss, { type Root } from 'postcss';
import type { Plugin } from 'vite';

export interface Rgba { r: number; g: number; b: number; a: number }

/** Colores que no deben seguir la regla general (claves en hex de 6 dígitos, sin alfa). */
export const DARK_OVERRIDES: Record<string, string> = {
  'ffffff': '#151d1a', // tarjetas y superficies
  'f5f7f9': '#0d1311', // fondo de la página
  'fbfcfb': '#121916',
  'fafbfa': '#121916',
  '000000': '#000000',
};

/** Propiedades donde un color se deja tal cual (sombras y filtros). */
const KEEP_PROPS = /^(box-shadow|text-shadow|filter|-webkit-box-shadow)$/;

/** Propiedades (y variables) cuyo color se usa como texto: en oscuro necesitan más luz. */
const TEXT_PROPS = /^(color|fill|caret-color|-webkit-text-fill-color|text-decoration-color|--ink|--muted)$/;

const COLOR_RE = /#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)|\b(?:white|black)\b/g;

export function parseColor(token: string): Rgba | null {
  const t = token.trim().toLowerCase();
  if (t === 'white') return { r: 255, g: 255, b: 255, a: 1 };
  if (t === 'black') return { r: 0, g: 0, b: 0, a: 1 };
  if (t.startsWith('#')) {
    let h = t.slice(1);
    if (![3, 4, 6, 8].includes(h.length)) return null;
    if (h.length <= 4) h = [...h].map(c => c + c).join('');
    const n = (i: number) => parseInt(h.slice(i, i + 2), 16);
    return { r: n(0), g: n(2), b: n(4), a: h.length === 8 ? Math.round(n(6) / 255 * 1000) / 1000 : 1 };
  }
  const m = /^rgba?\(([^)]*)\)$/.exec(t);
  if (!m) return null;
  const parts = m[1].split(/[\s,/]+/).filter(Boolean);
  if (parts.length < 3) return null;
  const channel = (v: string) => v.endsWith('%') ? Math.round(parseFloat(v) * 2.55) : Number(v);
  const alpha = parts[3] === undefined ? 1 : parts[3].endsWith('%') ? parseFloat(parts[3]) / 100 : Number(parts[3]);
  const out = { r: channel(parts[0]), g: channel(parts[1]), b: channel(parts[2]), a: alpha };
  return [out.r, out.g, out.b, out.a].every(Number.isFinite) ? out : null;
}

const hex2 = (n: number) => Math.round(Math.min(255, Math.max(0, n))).toString(16).padStart(2, '0');
export function toHex({ r, g, b }: Rgba) { return `${hex2(r)}${hex2(g)}${hex2(b)}`; }
export function format(c: Rgba) {
  return c.a >= 1 ? `#${toHex(c)}` : `rgba(${Math.round(c.r)},${Math.round(c.g)},${Math.round(c.b)},${Math.round(c.a * 1000) / 1000})`;
}

function rgbToHsl({ r, g, b }: Rgba) {
  const R = r / 255, G = g / 255, B = b / 255;
  const max = Math.max(R, G, B), min = Math.min(R, G, B), l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min, s = l > .5 ? d / (2 - max - min) : d / (max + min);
  const h = max === R ? (G - B) / d + (G < B ? 6 : 0) : max === G ? (B - R) / d + 2 : (R - G) / d + 4;
  return { h: h / 6, s, l };
}
function hslToRgb(h: number, s: number, l: number) {
  if (s === 0) return { r: l * 255, g: l * 255, b: l * 255 };
  const q = l < .5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  const f = (t: number) => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
  return { r: f(h + 1 / 3) * 255, g: f(h) * 255, b: f(h - 1 / 3) * 255 };
}

/** Equivalente oscuro de un color: misma tonalidad, luminosidad invertida y algo menos saturado. */
export function darkVariant(color: Rgba, role: 'surface' | 'text' = 'surface'): Rgba {
  const key = toHex(color);
  if (role === 'surface' && DARK_OVERRIDES[key]) return { ...parseColor(DARK_OVERRIDES[key])!, a: color.a };
  const { h, s, l } = rgbToHsl(color);
  // Texto: la jerarquía se conserva (tinta → casi blanco, gris tenue → gris medio) y nunca baja de 0,4.
  // Superficie: claros (fondos, bordes) → oscuros; oscuros (botones, acentos) → tonos claros.
  const nl = role === 'text' ? Math.max(.4, .93 - l * .62) : l >= .5 ? .1 + (1 - l) * .62 : .93 - l * .74;
  const ns = role === 'text' ? Math.min(1, s * .8) : l >= .5 ? s * .55 : Math.min(1, s * .9);
  return { ...hslToRgb(h, ns, nl), a: color.a };
}

/** Nombre del token para un color, p. ej. `--nx-2d6a57` o `--nx-2d6a57-10` (alfa en %). */
export function tokenName(c: Rgba, role: 'surface' | 'text' = 'surface') { return `--nx-${role === 'text' ? 't' : ''}${toHex(c)}${c.a < 1 ? `-${Math.round(c.a * 1000)}` : ''}`; }

export interface ThemeToken { color: Rgba; role: 'surface' | 'text' }
export interface ThemeResult { css: string; tokens: Map<string, ThemeToken> }

/** Convierte la hoja en una con tokens y añade la paleta clara/oscura. */
export function themeCss(source: string, opts: { keepLight?: string[] } = {}): ThemeResult {
  const keepLight = (opts.keepLight ?? ['.theme-keep-light', '.paper-sheet']).map(sel => `:root[data-theme="dark"] ${sel}`).join(',');
  const root: Root = postcss.parse(source);
  const tokens = new Map<string, ThemeToken>();
  // Variables propias (p. ej. `--green`) que usan tokens: se vuelven a declarar en las zonas claras,
  // porque una variable se resuelve donde se declara y heredaría el valor oscuro.
  const semantic: string[] = [];
  root.walkDecls(decl => {
    if (KEEP_PROPS.test(decl.prop) || decl.value.includes('url(')) return;
    const role = TEXT_PROPS.test(decl.prop) ? 'text' : 'surface';
    decl.value = decl.value.replace(COLOR_RE, match => {
      const color = parseColor(match);
      if (!color) return match;
      const name = tokenName(color, role);
      tokens.set(name, { color, role });
      return `var(${name})`;
    });
    if (decl.prop.startsWith('--') && decl.value.includes('var(--nx-') && decl.parent?.type === 'rule' && (decl.parent as { selector?: string }).selector === ':root') semantic.push(`${decl.prop}:${decl.value}`);
  });
  const entries = [...tokens.entries()].sort(([a], [b]) => a.localeCompare(b));
  const light = entries.map(([n, t]) => `${n}:${format(t.color)}`).join(';');
  const dark = entries.map(([n, t]) => `${n}:${format(darkVariant(t.color, t.role))}`).join(';');
  root.append(postcss.parse(`:root{${light}}:root[data-theme="dark"]{color-scheme:dark;${dark}}${keepLight}{color-scheme:light;${light}${semantic.length ? `;${semantic.join(';')}` : ''}}`));
  return { css: root.toString(), tokens };
}

/** Plugin de Vite: aplica `themeCss` a `src/index.css` antes que Tailwind. */
export function themeColorsPlugin(file = '/src/index.css'): Plugin {
  return {
    name: 'nexo-theme-colors',
    enforce: 'pre',
    transform(code, id) {
      if (!id.split('?')[0].endsWith(file)) return null;
      return { code: themeCss(code).css, map: null };
    },
  };
}
