import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Clock, LogOut } from 'lucide-react';
import type { SessionInfo } from '../../shared/permissions';

const WARNING_SECONDS = 60;
const PING_INTERVAL_MS = 60_000;
const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll'] as const;

/**
 * Cierre de sesión por inactividad.
 * El servidor es quien decide (SESSION_IDLE_MINUTES); aquí solo se mantiene viva la sesión
 * mientras la persona trabaja y se avisa un minuto antes de que caduque.
 * - La actividad (teclado, ratón, toque) se notifica como máximo una vez por minuto.
 * - Antes de avisar se consulta al servidor sin contar como actividad (?probe=1): si otra pestaña
 *   sigue en uso, la cuenta atrás se reinicia en lugar de cerrar la sesión.
 */
export default function IdleWatcher({ onExpired, onLogout }: { onExpired: () => void; onLogout: () => void }) {
  const deadline = useRef(0); const lastActivity = useRef(Date.now()); const lastPing = useRef(Date.now()); const probing = useRef(false);
  const [remaining, setRemaining] = useState<number | null>(null);
  const remainingRef = useRef<number | null>(null); remainingRef.current = remaining;

  const query = useCallback(async (probe: boolean): Promise<boolean> => {
    try {
      const response = await fetch(`/api/session${probe ? '?probe=1' : ''}`, { cache: 'no-store' });
      if (!response.ok) return true; // error de red o del servidor: no cerrar la sesión por eso
      const info = await response.json() as SessionInfo;
      if (!info.authenticated) { onExpired(); return false; }
      if (!probe) lastPing.current = Date.now();
      if (typeof info.idleRemainingSeconds === 'number') deadline.current = Date.now() + info.idleRemainingSeconds * 1000;
      else deadline.current = 0;
      return true;
    } catch { return true; }
  }, [onExpired]);

  useEffect(() => {
    void query(true);
    const activity = () => { lastActivity.current = Date.now(); };
    for (const name of ACTIVITY_EVENTS) window.addEventListener(name, activity, { passive: true, capture: true });
    const visible = () => { if (document.visibilityState === 'visible') void query(true); };
    document.addEventListener('visibilitychange', visible);
    const timer = window.setInterval(async () => {
      if (probing.current) return; const now = Date.now();
      // Mantener viva la sesión si hubo actividad desde la última notificación.
      if (lastActivity.current > lastPing.current && now - lastPing.current >= PING_INTERVAL_MS && (deadline.current === 0 || deadline.current - now > WARNING_SECONDS * 1000)) { probing.current = true; await query(false); probing.current = false; return; }
      if (!deadline.current) return;
      const left = Math.ceil((deadline.current - now) / 1000);
      if (left > WARNING_SECONDS) { setRemaining(null); return; }
      if (left <= 0 || remainingRef.current === null) {
        // Confirmar con el servidor antes de avisar o de cerrar (otra pestaña pudo seguir trabajando).
        probing.current = true; const alive = await query(true); probing.current = false;
        if (!alive) return;
        const confirmed = Math.ceil((deadline.current - Date.now()) / 1000);
        if (confirmed <= 0) { onExpired(); return; }
        setRemaining(confirmed > WARNING_SECONDS ? null : confirmed); return;
      }
      setRemaining(left);
    }, 1000);
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', visible); for (const name of ACTIVITY_EVENTS) window.removeEventListener(name, activity, { capture: true }); };
  }, [query, onExpired]);

  if (remaining === null) return null;
  const keep = async () => { lastActivity.current = Date.now(); await query(false); setRemaining(null); };
  // Portal fuera de #root: debe seguir siendo usable aunque otro diálogo haya dejado la app inerte.
  return createPortal(<div className="modal-backdrop idle-backdrop" role="presentation">
    <div className="modal idle-modal" role="alertdialog" aria-modal="true" aria-labelledby="idle-title" aria-describedby="idle-copy">
      <span className="section-icon"><Clock size={20} /></span>
      <h2 id="idle-title">¿Sigues ahí?</h2>
      <p id="idle-copy">Por seguridad, tu sesión se cerrará por inactividad en <strong className="idle-count">{remaining} s</strong>.</p>
      <div className="modal-actions"><button type="button" className="btn btn-ghost" onClick={onLogout}><LogOut size={15} />Cerrar sesión</button><button type="button" className="btn btn-primary" onClick={keep} autoFocus>Seguir trabajando</button></div>
    </div>
  </div>, document.body);
}
