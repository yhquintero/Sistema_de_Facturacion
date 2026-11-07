/** Búsqueda tolerante (sin distinguir mayúsculas ni tildes) y resaltado de coincidencias. */

/** Minúsculas y sin diacríticos: «Logística» → «logistica». Conserva la longitud de cada letra base. */
export function fold(text: string) { return String(text ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es'); }

/** Todas las palabras de la consulta aparecen en el texto (en cualquier orden). */
export function matches(text: string, query: string) {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = fold(text);
  return words.every(w => hay.includes(w));
}

/** Puntuación sencilla: coincidencia al inicio > al inicio de palabra > en cualquier parte. */
export function score(text: string, query: string) {
  const q = fold(query).trim(); if (!q) return 0;
  const hay = fold(text);
  if (hay.startsWith(q)) return 3;
  if (new RegExp(`(^|[\\s·/-])${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(hay)) return 2;
  return matches(text, query) ? 1 : 0;
}

/** Trozos del texto marcando qué partes coinciden con alguna palabra de la consulta. */
export function highlight(text: string, query: string): { text: string; hit: boolean }[] {
  const source = String(text ?? '');
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (!words.length || !source) return [{ text: source, hit: false }];
  // Mapa de índice de la versión plegada → índice del texto original (NFD puede alargar letras).
  const folded: string[] = []; const origin: number[] = [];
  [...source].forEach((ch, i) => { for (const f of fold(ch)) { folded.push(f); origin.push(i); } });
  const chars = [...source]; const hit = new Array(chars.length).fill(false);
  const hay = folded.join('');
  for (const w of words) { let from = 0, at: number; while ((at = hay.indexOf(w, from)) !== -1) { for (let k = at; k < at + w.length; k++) hit[origin[k]] = true; from = at + w.length; } }
  const parts: { text: string; hit: boolean }[] = [];
  chars.forEach((ch, i) => { const last = parts[parts.length - 1]; if (last && last.hit === hit[i]) last.text += ch; else parts.push({ text: ch, hit: hit[i] }); });
  return parts;
}
