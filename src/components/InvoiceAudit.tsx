import { useEffect, useState } from 'react';
import { CheckCheck, Clock3, Fingerprint, LoaderCircle, ShieldAlert, ShieldCheck } from 'lucide-react';
import type { Invoice } from '../../shared/types';
import { api } from '../api';
import { ErrorMessage, Modal } from './UI';

export type InvoiceAuditEvent = { type: string; occurredAt: string; actorId?: string; actorName?: string; details: Record<string, unknown> };
export type InvoiceIntegrity = { signed: boolean; algorithm: string; recordedHash: string; computedHash: string; matches: boolean; signedAt: string; consent: { accepted: boolean; version: string } | null; isDemo: boolean };
const labels: Record<string, string> = { created: 'Factura creada', updated: 'Documento actualizado', client_signed: 'Conformidad del Cliente Final registrada', status_changed: 'Estado de cobro actualizado' };
const dateTime = (value: string) => new Date(value).toLocaleString('es', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' });

export function InvoiceAuditDialog({ invoice, onClose }: { invoice: Invoice; onClose: () => void }) {
  const [result, setResult] = useState<{ integrity: InvoiceIntegrity; events: InvoiceAuditEvent[] } | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { let active = true; Promise.all([api.getInvoiceIntegrity(invoice.id), api.getInvoiceEvents(invoice.id)]).then(([integrity, events]) => { if (active) setResult({ integrity, events }); }).catch(error => { if (active) setError(error.message); }); return () => { active = false; }; }, [invoice.id]);
  return <Modal title="Cada entrega deja una huella" subtitle={`${invoice.invoiceNumber} · Integridad del contenido y registro de actividad`} onClose={onClose} wide>
    {error ? <ErrorMessage error={error} /> : !result ? <div className="audit-loading"><LoaderCircle className="spin" size={19} />Consultando el registro del servidor…</div> : <>
      <div className={`audit-result ${result.integrity.signed && !result.integrity.matches ? 'mismatch' : ''}`}>
        {result.integrity.signed ? result.integrity.matches ? <ShieldCheck size={27} /> : <ShieldAlert size={27} /> : <Fingerprint size={27} />}
        <div><h3>{result.integrity.signed ? result.integrity.matches ? 'El contenido coincide con su huella' : 'El contenido no coincide. Requiere revisión.' : 'Documento pendiente de conformidad'}</h3><p>{result.integrity.signed ? 'Comprobación SHA-256 del contenido comercial y técnico, las partes y el contrato guardados al firmar.' : 'Al registrar la firma, se congelan los datos de las partes y el contrato y se calcula la huella del contenido aceptado.'}</p></div>
      </div>
      {invoice.isDemo && <div className="document-warning"><ShieldAlert size={16} /><span><strong>Documento de demostración.</strong> Los datos precargados y las firmas de muestra no representan una entrega ni una aceptación real.</span></div>}
      {result.integrity.recordedHash && <div className="audit-hash"><span className="section-kicker">HUELLA REGISTRADA · SHA-256</span><code>{result.integrity.recordedHash}</code><p><CheckCheck size={12} />{result.integrity.consent?.accepted ? `Consentimiento explícito registrado · ${result.integrity.consent.version}` : 'Sin consentimiento real registrado para la firma de muestra.'}{result.integrity.signedAt ? ` · ${dateTime(result.integrity.signedAt)} UTC` : ''}</p></div>}
      <h3 className="audit-heading"><Clock3 size={15} />Registro de actividad</h3>
      {result.events.length ? <ol className="audit-events">{result.events.map((event, index) => <li key={index}><div><strong>{labels[event.type] || event.type}</strong><time dateTime={event.occurredAt}>{dateTime(event.occurredAt)} UTC</time></div>{event.type === 'client_signed' && <p>{String(event.details.signerName || '')}</p>}{event.type === 'status_changed' && <p>{String(event.details.previous || '')} → {String(event.details.status || '')}</p>}{event.type === 'created' && <p>{String(event.details.invoiceNumber || '')} · {String(event.details.currency || '')}</p>}{event.actorName && <p className="audit-actor">{event.type === 'client_signed' ? 'Registrada por' : 'Por'} {event.actorName}</p>}</li>)}</ol> : <p className="technical-note">No hay eventos registrados para este documento de ejemplo o anterior al registro de actividad.</p>}
      <p className="signature-disclaimer">Esta huella permite detectar cambios en el contenido protegido; no certifica la identidad del firmante ni sustituye una firma digital certificada o un sello de tiempo de un tercero. El registro se conserva en esta base de datos: protégela y mantén copias de seguridad. Las exportaciones Word y Excel son editables y deben contrastarse con el original del servidor.</p>
    </>}
    <div className="modal-actions"><button className="btn btn-secondary" onClick={onClose}>Volver al documento</button></div>
  </Modal>;
}
