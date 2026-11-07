import { useEffect, useSyncExternalStore } from 'react';

/** Preferencias de visualización de este navegador: tema y tamaño de letra. */
export type ThemeMode = 'system' | 'light' | 'dark';
export type TextSize = 'normal' | 'large' | 'xlarge';

export const THEME_KEY = 'nexo.theme';
export const TEXT_KEY = 'nexo.textSize';

export const THEMES: Record<ThemeMode, { label: string; short: string }> = {
  system: { label: 'Automático (sigue al sistema)', short: 'Automático' },
  light: { label: 'Claro', short: 'Claro' },
  dark: { label: 'Oscuro', short: 'Oscuro' },
};
export const THEME_ORDER: ThemeMode[] = ['system', 'light', 'dark'];
export const TEXT_SIZES: Record<TextSize, { label: string; zoom: number }> = {
  normal: { label: 'Normal', zoom: 1 },
  large: { label: 'Grande', zoom: 1.12 },
  xlarge: { label: 'Muy grande', zoom: 1.25 },
};

/** Siguiente tema al pulsar el botón de la barra superior. */
export function nextTheme(mode: ThemeMode): ThemeMode { return THEME_ORDER[(THEME_ORDER.indexOf(mode) + 1) % THEME_ORDER.length]; }
/** Tema que realmente se pinta, según la preferencia y el sistema operativo. */
export function resolveTheme(mode: ThemeMode, systemDark: boolean): 'light' | 'dark' { return mode === 'dark' || (mode === 'system' && systemDark) ? 'dark' : 'light'; }
export function isThemeMode(v: unknown): v is ThemeMode { return v === 'system' || v === 'light' || v === 'dark'; }
export function isTextSize(v: unknown): v is TextSize { return v === 'normal' || v === 'large' || v === 'xlarge'; }

function read<T>(key: string, guard: (v: unknown) => v is T, fallback: T): T {
  try { const v = localStorage.getItem(key); return guard(v) ? v : fallback; } catch { return fallback; }
}
const listeners = new Set<() => void>();
const media = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
let state = { theme: read(THEME_KEY, isThemeMode, 'system' as ThemeMode), textSize: read(TEXT_KEY, isTextSize, 'normal' as TextSize), systemDark: !!media?.matches };

function apply() {
  const root = document.documentElement;
  const resolved = resolveTheme(state.theme, state.systemDark);
  root.dataset.theme = resolved;
  root.dataset.textSize = state.textSize;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', resolved === 'dark' ? '#0d1311' : '#2d6a57');
}
function emit() { apply(); listeners.forEach(l => l()); }
media?.addEventListener?.('change', e => { state = { ...state, systemDark: e.matches }; emit(); });
if (typeof window !== 'undefined') window.addEventListener('storage', e => {
  if (e.key === THEME_KEY || e.key === TEXT_KEY) { state = { ...state, theme: read(THEME_KEY, isThemeMode, 'system'), textSize: read(TEXT_KEY, isTextSize, 'normal') }; emit(); }
});

// Los informes impresos salen siempre en claro, aunque la pantalla esté en oscuro.
if (typeof window !== 'undefined') {
  window.addEventListener('beforeprint', () => { document.documentElement.dataset.theme = 'light'; });
  window.addEventListener('afterprint', apply);
}

export function setTheme(theme: ThemeMode) { state = { ...state, theme }; try { localStorage.setItem(THEME_KEY, theme); } catch { /* sin almacenamiento */ } emit(); }
export function setTextSize(textSize: TextSize) { state = { ...state, textSize }; try { localStorage.setItem(TEXT_KEY, textSize); } catch { /* sin almacenamiento */ } emit(); }

/** Hook: preferencias actuales y tema resuelto; se actualiza en vivo si el sistema cambia a modo oscuro. */
export function usePreferences() {
  const snap = useSyncExternalStore(cb => { listeners.add(cb); return () => { listeners.delete(cb); }; }, () => state);
  useEffect(() => { apply(); }, []);
  return { ...snap, resolved: resolveTheme(snap.theme, snap.systemDark), setTheme, setTextSize };
}
