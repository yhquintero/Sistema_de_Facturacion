import { cloneElement, isValidElement, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, Check, ChevronRight, CircleAlert, FileText, LoaderCircle, X, type LucideIcon } from 'lucide-react';
import type { ActivityScope, Invoice, InvoiceStatus } from '../../shared/types';
import { displayStatus, scopeLabels, statusLabels } from '../lib/format';
import { createPortal } from 'react-dom';

export function PageHeader({ eyebrow, title, description, actions, back }: { eyebrow?: string; title: string; description?: string; actions?: ReactNode; back?: () => void }) {
  return <div className="page-heading">{back && <button className="back-link" onClick={back}><ArrowLeft size={16} /> Volver a facturas</button>}<div className="page-heading-row"><div>{eyebrow && <div className="eyebrow">{eyebrow}</div>}<h1>{title}</h1>{description && <p className="page-description">{description}</p>}</div>{actions && <div className="page-actions">{actions}</div>}</div></div>;
}
export function StatusBadge({ invoice, status }: { invoice?: Invoice; status?: InvoiceStatus }) {
  const value = invoice ? displayStatus(invoice) : status || 'borrador';
  return <span className={`status-badge ${value}`}><span className="status-dot" />{statusLabels[value]}</span>;
}
export function ActivityBadge({ scope }: { scope: ActivityScope }) { return <span className={`activity-badge ${scope}`}>{scopeLabels[scope]}</span>; }
export function Field({ label, children, hint, className = '', required }: { label: string; children: ReactNode; hint?: string; className?: string; required?: boolean }) {
  const generatedId = useId();
  const element = isValidElement<{ id?: string; 'aria-describedby'?: string }>(children) ? children : null;
  const id = element?.props.id || generatedId;
  return <div className={`field ${className}`}><label htmlFor={id} className="field-label">{label}{required && <span className="required" aria-hidden="true"> *</span>}</label>{element ? cloneElement(element, { id, 'aria-describedby': hint ? `${id}-hint` : element.props['aria-describedby'] }) : children}{hint && <span id={`${id}-hint`} className="field-hint">{hint}</span>}</div>;
}
export function FormSection({ number, title, description, icon: Icon, action, children }: { number?: string; title: string; description?: string; icon?: LucideIcon; action?: ReactNode; children: ReactNode }) {
  return <section className="panel form-section"><div className="section-heading"><div className="section-title-group">{number ? <span className="section-number">{number}</span> : Icon && <span className="section-icon"><Icon size={19} /></span>}<div><h2>{title}</h2>{description && <p>{description}</p>}</div></div>{action}</div><div className="section-body">{children}</div></section>;
}
export function EmptyState({ title, description, icon: Icon = FileText, action }: { title: string; description: string; icon?: LucideIcon; action?: ReactNode }) {
  return <div className="empty-state"><span className="empty-icon"><Icon size={27} strokeWidth={1.5} /></span><h3>{title}</h3><p>{description}</p>{action}</div>;
}
export function Modal({ title, subtitle, children, onClose, wide = false }: { title: string; subtitle?: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const closeRef = useRef(onClose); closeRef.current = onClose;
  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const el = ref.current;
    const controls = () => [...(el?.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex="0"]') || [])].filter(e => e.getClientRects().length > 0);
    const first = controls()[0]; first?.focus();
    const appRoot = document.getElementById('root'); const wasInert = appRoot?.inert || false;
    if (appRoot) appRoot.inert = true;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); closeRef.current(); }
      if (e.key === 'Tab') { const items = controls(); const a = items[0]; const b = items.at(-1); if (e.shiftKey && document.activeElement === a) { e.preventDefault(); b?.focus(); } else if (!e.shiftKey && document.activeElement === b) { e.preventDefault(); a?.focus(); } }
    };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = overflow; if (appRoot) appRoot.inert = wasInert; previousFocus?.focus(); };
  }, []);
  return createPortal(<div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}><div className={`modal ${wide ? 'modal-wide' : ''}`} ref={ref} role="dialog" aria-modal="true" aria-labelledby={titleId}><div className="modal-heading"><div><h2 id={titleId}>{title}</h2>{subtitle && <p>{subtitle}</p>}</div><button className="icon-btn" aria-label="Cerrar" onClick={onClose}><X size={21} /></button></div><div className="modal-body">{children}</div></div></div>, document.body);
}
export function ConfirmDelete({ onConfirm, title = '¿Eliminar este registro?', description, trigger }: { onConfirm: () => Promise<void>; title?: string; description: string; trigger?: ReactNode }) {
  const [open, setOpen] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  return <><button className="icon-btn danger-hover" title="Eliminar" aria-label="Eliminar" onClick={() => setOpen(true)}>{trigger || <X size={16} />}</button>{open && <Modal title={title} onClose={() => { if (!busy) setOpen(false); }}><div className="alert alert-warning"><CircleAlert size={20} /><p>{description}</p></div>{error && <div className="form-error" role="alert">{error}</div>}<div className="modal-actions"><button className="btn btn-secondary" disabled={busy} onClick={() => setOpen(false)}>Cancelar</button><button className="btn btn-danger" disabled={busy} onClick={async () => { setBusy(true); setError(''); try { await onConfirm(); setOpen(false); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }}>{busy && <LoaderCircle size={16} className="spin" />}Sí, eliminar</button></div></Modal>}</>;
}
export function SaveButton({ busy, label = 'Guardar cambios' }: { busy: boolean; label?: string }) { return <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? <LoaderCircle className="spin" size={17} /> : <Check size={17} />}{busy ? 'Guardando…' : label}</button>; }
export function ErrorMessage({ error }: { error: string }) { return error ? <div className="form-error" role="alert"><CircleAlert size={17} />{error}</div> : null; }
export function SeeAll({ onClick, children = 'Ver todas' }: { onClick: () => void; children?: ReactNode }) { return <button className="text-link" onClick={onClick}>{children}<ChevronRight size={15} /></button>; }
