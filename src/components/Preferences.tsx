import { Check, Keyboard, Monitor, Moon, Sun, type LucideIcon } from 'lucide-react';
import { Modal } from './UI';
import { THEMES, TEXT_SIZES, usePreferences, type TextSize, type ThemeMode } from '../lib/preferences';

const THEME_ICONS: Record<ThemeMode, LucideIcon> = { system: Monitor, light: Sun, dark: Moon };
const THEME_HINTS: Record<ThemeMode, string> = { system: 'Cambia solo cuando tu equipo o móvil pasa a modo nocturno.', light: 'Fondo claro, ideal con mucha luz.', dark: 'Descansa la vista de noche. La hoja de la factura sigue en blanco.' };

/** Atajos de teclado disponibles (fuera de los campos de texto). */
export const SHORTCUTS: { keys: string[]; label: string; group: string }[] = [
  { keys: ['Ctrl', 'K'], label: 'Buscar o ejecutar una acción', group: 'General' },
  { keys: ['/'], label: 'Buscar', group: 'General' },
  { keys: ['?'], label: 'Ver esta lista de atajos', group: 'General' },
  { keys: ['T'], label: 'Cambiar el tema (automático, claro, oscuro)', group: 'General' },
  { keys: ['N'], label: 'Nueva factura', group: 'Crear' },
  { keys: ['G', 'R'], label: 'Ir al Resumen', group: 'Ir a' },
  { keys: ['G', 'F'], label: 'Ir a Facturas', group: 'Ir a' },
  { keys: ['G', 'C'], label: 'Ir a Clientes', group: 'Ir a' },
  { keys: ['G', 'O'], label: 'Ir a Contratos', group: 'Ir a' },
  { keys: ['G', 'S'], label: 'Ir al Catálogo de servicios', group: 'Ir a' },
  { keys: ['G', 'A'], label: 'Ir a Análisis y metas', group: 'Ir a' },
  { keys: ['G', 'N'], label: 'Ir a Mi negocio', group: 'Ir a' },
  { keys: ['G', 'U'], label: 'Ir a Usuarios y acceso (administradores)', group: 'Ir a' },
];

export function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  const groups = [...new Set(SHORTCUTS.map(s => s.group))];
  return <Modal title="Atajos de teclado" subtitle="Trabaja sin soltar el teclado. Funcionan cuando no estás escribiendo en un campo." onClose={onClose}>
    <div className="shortcut-groups">{groups.map(g => <section key={g}><h3>{g}</h3><ul className="shortcut-list">{SHORTCUTS.filter(s => s.group === g).map(s => <li key={s.label}><span>{s.label}</span><span className="shortcut-keys">{s.keys.map((k, i) => <span key={k + i}>{i > 0 && <small>{s.keys[0] === 'Ctrl' ? '+' : 'luego'}</small>}<kbd>{k}</kbd></span>)}</span></li>)}</ul></section>)}</div>
    <p className="subtle shortcut-note"><Keyboard size={13} />En Mac, usa ⌘ en lugar de Ctrl.</p>
  </Modal>;
}

export function PreferencesDialog({ onClose }: { onClose: () => void }) {
  const prefs = usePreferences();
  return <Modal title="Apariencia y accesibilidad" subtitle="Se guarda en este navegador. Cada persona puede elegir la suya." onClose={onClose}>
    <fieldset className="pref-group"><legend>Tema</legend><div className="theme-options" role="radiogroup" aria-label="Tema">
      {(Object.keys(THEMES) as ThemeMode[]).map(mode => { const Icon = THEME_ICONS[mode]; const on = prefs.theme === mode; return <button key={mode} type="button" role="radio" aria-checked={on} className={`theme-option ${mode} ${on ? 'selected' : ''}`} onClick={() => prefs.setTheme(mode)}><span className="theme-swatch theme-keep-light" aria-hidden="true"><span /><span /></span><span className="theme-option-title"><Icon size={14} />{THEMES[mode].short}{on && <Check size={13} className="theme-check" />}</span><small>{THEME_HINTS[mode]}</small></button>; })}
    </div></fieldset>
    <fieldset className="pref-group"><legend>Tamaño de letra</legend><div className="segmented" role="radiogroup" aria-label="Tamaño de letra">
      {(Object.keys(TEXT_SIZES) as TextSize[]).map(size => <button key={size} type="button" role="radio" aria-checked={prefs.textSize === size} className={prefs.textSize === size ? 'selected' : ''} onClick={() => prefs.setTextSize(size)}><span style={{ fontSize: 11 * TEXT_SIZES[size].zoom }}>Aa</span>{TEXT_SIZES[size].label}</button>)}
    </div><p className="field-hint">Agranda textos, iconos y botones a la vez, sin descolocar las tablas. Al imprimir se usa siempre el tamaño normal.</p></fieldset>
    <div className="modal-actions"><button className="btn btn-primary" onClick={onClose}>Listo</button></div>
  </Modal>;
}
