import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Bell, BookOpen, Building2, ChevronDown, ChevronRight, ChevronsUpDown, CircleHelp, Command, Download, FileCheck2, FilePlus2, FileSignature, FileText, FolderKanban, Home, ChartLine, Keyboard, Monitor, Moon, Palette, Sun, TriangleAlert, Clock3, FileClock, Laptop, Layers3, LayoutDashboard, Menu, MoreHorizontal, Plus, Search, Settings2, ShieldCheck, Smartphone, Users, WifiOff, X } from 'lucide-react';
import { AppProvider, useApp, useRoute } from './context/AppContext';
import { EmptyState, Modal } from './components/UI';
import { initials, isRevenue, money } from './lib/format';
import DashboardView from './views/DashboardView';
import InvoicesListView from './views/InvoicesListView';
import InvoiceBuilderView from './views/InvoiceBuilderView';
import InvoiceDetailView from './views/InvoiceDetailView';
import ClientsView from './views/ClientsView';
import ContractsView from './views/ContractsView';
import CatalogView from './views/CatalogView';
import SupplierProfileView from './views/SupplierProfileView';
import AuthGate, { useAuth } from './components/AuthGate';
import { LogOut, UserCog } from 'lucide-react';
import UsersView from './views/UsersView';
import AccountDialog from './components/AccountDialog';
import { ROLE_INFO } from '../shared/permissions';
import AnalyticsView from './views/AnalyticsView';
import CommandPalette, { type PaletteCommand } from './components/CommandPalette';
import { PreferencesDialog, ShortcutsDialog } from './components/Preferences';
import { THEMES, nextTheme, usePreferences } from './lib/preferences';
import { buildAlerts, severityLabel, summarizeAlerts, type AlertKind } from './lib/alerts';
import { today } from './lib/format';

interface InstallEvent extends Event { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }
export default function App() { return <AuthGate><AppProvider><Workspace /></AppProvider></AuthGate>; }
export function BrandSymbol() { return <div className="brand-symbol" aria-hidden="true"><span /><span /><span /></div>; }
function Workspace() {
  const route = useRoute();
  const auth = useAuth();
  const path = route.split('?')[0];
  const { supplier, invoices, clients, contracts, navigate } = useApp();
  const [drawer, setDrawer] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [prefsOpen, setPrefsOpen] = useState(false);
  const prefs = usePreferences();
  const [notifications, setNotifications] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [installHelp, setInstallHelp] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const canCreateInvoice = auth.can('invoices.draft');
  const [installPrompt, setInstallPrompt] = useState<InstallEvent | null>(null);
  const [online, setOnline] = useState(navigator.onLine);
  const notificationRef = useRef<HTMLDivElement>(null);
  const alerts = useMemo(() => buildAlerts(invoices, contracts, { today: today() }), [invoices, contracts]);
  const alertSummary = summarizeAlerts(alerts);
  const title = path.startsWith('/invoices') ? 'Facturas' : path.startsWith('/clients') ? 'Clientes' : path.startsWith('/contracts') ? 'Contratos' : path.startsWith('/catalog') ? 'Catálogo de servicios' : path.startsWith('/settings') ? 'Mi negocio' : path.startsWith('/users') ? 'Usuarios y acceso' : path.startsWith('/analytics') ? 'Análisis y metas' : 'Resumen general';
  useEffect(() => { setDrawer(false); setNotifications(false); document.title = `${title} · Nexo Facturación`; }, [route, title]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); if (!document.querySelector('[aria-modal="true"]')) setSearchOpen(true); } if (e.key === 'Escape') { setDrawer(false); setNotifications(false); } shortcutRef.current(e); };
    const install = (e: Event) => { e.preventDefault(); setInstallPrompt(e as InstallEvent); };
    const onOnline = () => setOnline(true); const onOffline = () => setOnline(false);
    document.addEventListener('keydown', onKey); window.addEventListener('beforeinstallprompt', install); window.addEventListener('online', onOnline); window.addEventListener('offline', onOffline);
    return () => { document.removeEventListener('keydown', onKey); window.removeEventListener('beforeinstallprompt', install); window.removeEventListener('online', onOnline); window.removeEventListener('offline', onOffline); };
  }, []);
  useEffect(() => { const outside = (e: MouseEvent) => { if (notificationRef.current && !notificationRef.current.contains(e.target as Node)) setNotifications(false); }; if (notifications) document.addEventListener('mousedown', outside); return () => document.removeEventListener('mousedown', outside); }, [notifications]);
  const go = useCallback((url: string) => { navigate(url); setSearchOpen(false); setDrawer(false); }, [navigate]);
  const cycleTheme = useCallback(() => prefs.setTheme(nextTheme(prefs.theme)), [prefs]);
  // Atajos de una tecla (fuera de campos de texto y sin diálogos abiertos). «G» seguido de otra tecla navega.
  const pendingG = useRef(0);
  const shortcutRef = useRef<(e: KeyboardEvent) => void>(() => {});
  shortcutRef.current = (e: KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented) return;
    const target = e.target as HTMLElement | null;
    if (target && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) return;
    if (document.querySelector('[aria-modal="true"]')) return;
    const key = e.key.toLowerCase();
    if (Date.now() - pendingG.current < 1500) {
      pendingG.current = 0;
      const dest: Record<string, string> = { r: '/', f: '/invoices', c: '/clients', o: '/contracts', s: '/catalog', a: '/analytics', n: '/settings', u: '/users' };
      if (dest[key]) { e.preventDefault(); go(dest[key]); }
      return;
    }
    if (key === 'g') { pendingG.current = Date.now(); return; }
    if (e.key === '?') { e.preventDefault(); setShortcutsOpen(true); }
    else if (e.key === '/') { e.preventDefault(); setSearchOpen(true); }
    else if (key === 'n' && canCreateInvoice) { e.preventDefault(); go('/invoices/new'); }
    else if (key === 't') { e.preventDefault(); cycleTheme(); }
  };
  const ThemeIcon = prefs.theme === 'system' ? Monitor : prefs.resolved === 'dark' ? Moon : Sun;
  const commands = useMemo<PaletteCommand[]>(() => [
    ...(canCreateInvoice ? [{ id: 'new-invoice', group: 'Acciones' as const, title: 'Nueva factura', subtitle: 'Crear un documento desde cero', keywords: 'crear emitir facturar', shortcut: 'N', icon: FilePlus2, run: () => go('/invoices/new') }] : []),
    ...(auth.can('clients.write') ? [{ id: 'new-client', group: 'Acciones' as const, title: 'Nuevo cliente', subtitle: 'Registrar un cliente', keywords: 'crear alta cliente', icon: Users, run: () => go('/clients?new=1') }] : []),
    ...(auth.can('contracts.write') ? [{ id: 'new-contract', group: 'Acciones' as const, title: 'Nuevo contrato', subtitle: 'Redactar un contrato', keywords: 'crear contrato', icon: FileSignature, run: () => go('/contracts?new=1') }] : []),
    { id: 'pending-sign', group: 'Acciones', title: 'Revisar conformidades pendientes', subtitle: 'Facturas que esperan la firma del cliente', keywords: 'firma firmar pendiente', icon: FileClock, run: () => go('/invoices?signature=pending') },
    { id: 'overdue', group: 'Acciones', title: 'Ver facturas vencidas', subtitle: 'Cobros fuera de plazo', keywords: 'vencidas atrasadas cobro deuda', icon: TriangleAlert, run: () => go('/invoices?status=vencida') },
    { id: 'theme', group: 'Acciones', title: 'Cambiar tema', subtitle: `Ahora: ${THEMES[prefs.theme].short}. Automático, claro u oscuro`, keywords: 'oscuro claro modo noche apariencia', shortcut: 'T', icon: Moon, run: () => { cycleTheme(); } },
    { id: 'prefs', group: 'Acciones', title: 'Apariencia y tamaño de letra', subtitle: 'Tema y accesibilidad', keywords: 'letra grande zoom accesibilidad tema', icon: Palette, run: () => { setSearchOpen(false); setPrefsOpen(true); } },
    { id: 'shortcuts', group: 'Acciones', title: 'Atajos de teclado', subtitle: 'Todas las teclas rápidas', keywords: 'teclado atajos ayuda', shortcut: '?', icon: Keyboard, run: () => { setSearchOpen(false); setShortcutsOpen(true); } },
    { id: 'go-home', group: 'Ir a', title: 'Resumen general', keywords: 'inicio panel dashboard', shortcut: 'G R', icon: LayoutDashboard, run: () => go('/') },
    { id: 'go-invoices', group: 'Ir a', title: 'Facturas', keywords: 'documentos listado', shortcut: 'G F', icon: FileText, run: () => go('/invoices') },
    { id: 'go-clients', group: 'Ir a', title: 'Clientes', shortcut: 'G C', icon: Users, run: () => go('/clients') },
    { id: 'go-contracts', group: 'Ir a', title: 'Contratos', shortcut: 'G O', icon: FileSignature, run: () => go('/contracts') },
    { id: 'go-catalog', group: 'Ir a', title: 'Catálogo de servicios', keywords: 'servicios precios', shortcut: 'G S', icon: Layers3, run: () => go('/catalog') },
    { id: 'go-analytics', group: 'Ir a', title: 'Análisis y metas', keywords: 'estadisticas graficos informe metas objetivos cobro', shortcut: 'G A', icon: ChartLine, run: () => go('/analytics') },
    { id: 'go-settings', group: 'Ir a', title: 'Mi negocio', keywords: 'suministrador datos fiscales configuracion', shortcut: 'G N', icon: Settings2, run: () => go('/settings') },
    ...((auth.can('users.manage') || !auth.protected) ? [{ id: 'go-users', group: 'Ir a' as const, title: 'Usuarios y acceso', keywords: 'cuentas roles permisos', shortcut: 'G U', icon: UserCog, run: () => go('/users') }] : []),
  ], [canCreateInvoice, auth, prefs.theme, go, cycleTheme]);
  const alertIcon: Record<AlertKind, typeof Bell> = { overdue: TriangleAlert, due_soon: Clock3, signature: FileSignature, stale_draft: FileClock, contract_ending: FileCheck2, contract_expired: FileCheck2 };
  const install = async () => { if (installPrompt) { await installPrompt.prompt(); await installPrompt.userChoice; setInstallPrompt(null); } else setInstallHelp(true); };
  const navItems = [
    { path: '/', label: 'Resumen general', icon: LayoutDashboard },
    { path: '/invoices', label: 'Facturas', icon: FileText, count: invoices.length, alert: alertSummary.overdue },
    { path: '/clients', label: 'Clientes', icon: Users },
    { path: '/contracts', label: 'Contratos', icon: FileSignature },
    { path: '/catalog', label: 'Catálogo de servicios', icon: Layers3 },
    { path: '/analytics', label: 'Análisis y metas', icon: ChartLine },
  ];
  const renderView = () => {
    if (path === '/') return <DashboardView />;
    if (path === '/invoices') return <InvoicesListView route={route} />;
    if (path === '/invoices/new') return canCreateInvoice ? <InvoiceBuilderView /> : <EmptyState icon={ShieldCheck} title="Tu rol no permite crear facturas" description="Puedes consultar y descargar los documentos. Pide a un administrador que ajuste tu rol si lo necesitas." action={<button className="btn btn-primary" onClick={() => go('/invoices')}>Ver facturas</button>} />;
    if (path.startsWith('/invoices/')) {
      const id = path.split('/')[2]; const invoice = invoices.find(i => i.id === id);
      if (!invoice) return <EmptyState title="No encontramos esta factura" description="Puede haber sido eliminada. Vuelve al listado para consultar tus documentos." action={<button className="btn btn-primary" onClick={() => go('/invoices')}>Ver facturas</button>} />;
      const canEdit = auth.can('invoices.issue') || (auth.can('invoices.draft') && invoice.status === 'borrador');
      return path.endsWith('/edit') && canEdit && invoice.signatureStatus !== 'firmada_cliente' ? <InvoiceBuilderView key={id} invoice={invoice} /> : <InvoiceDetailView key={id} invoice={invoice} route={route} />;
    }
    if (path === '/clients') return <ClientsView route={route} />;
    if (path === '/contracts') return <ContractsView route={route} />;
    if (path === '/catalog') return <CatalogView />;
    if (path === '/settings') return <SupplierProfileView />;
    if (path === '/users') return <UsersView />;
    if (path === '/analytics') return <AnalyticsView />;
    return <EmptyState title="Esta página no existe" description="Regresa a tu espacio de trabajo para continuar." action={<button className="btn btn-primary" onClick={() => go('/')}>Ir al resumen</button>} />;
  };
  return <div className="app-shell"><a className="skip-link" href="#main-content">Saltar al contenido</a>{drawer && <button className="sidebar-scrim" aria-label="Cerrar navegación" onClick={() => setDrawer(false)} />}
    <aside className={`sidebar no-print ${drawer ? 'open' : ''}`} aria-label="Navegación principal">
      <a href="#/" className="brand" aria-label="Nexo, inicio"><BrandSymbol /><div><div className="brand-word">nexo<b>.</b></div><div className="brand-subtitle">Facturación inteligente</div></div></a>
      <button className="workspace-switcher" onClick={() => setWorkspaceOpen(true)}><span className="workspace-avatar"><Building2 size={17} strokeWidth={1.6} /></span><span><span className="workspace-title">Mi espacio de trabajo</span><span className="workspace-subtitle"><span className={`demo-dot ${auth.demo ? '' : 'private'}`} />{auth.demo ? 'Datos de demostración' : 'Espacio privado'}</span></span><ChevronsUpDown size={13} /></button>
      <div className="nav-label">PRINCIPAL</div><nav className="sidebar-nav">{navItems.map(item => <button key={item.path} className={`nav-item ${(item.path === '/' ? path === '/' : path.startsWith(item.path)) ? 'active' : ''}`} aria-current={(item.path === '/' ? path === '/' : path.startsWith(item.path)) ? 'page' : undefined} onClick={() => go(item.path)}><item.icon size={17} strokeWidth={1.6} /><span>{item.label}</span>{item.count !== undefined && <span className={`nav-count ${item.alert ? 'nav-danger' : ''}`} title={item.alert ? `${item.alert} ${item.alert === 1 ? 'factura vencida' : 'facturas vencidas'}` : undefined}>{item.count.toString().padStart(2, '0')}</span>}</button>)}</nav>
      <div className="nav-divider" /><div className="nav-label">MI ESPACIO</div><nav className="sidebar-nav"><button className={`nav-item ${path === '/settings' ? 'active' : ''}`} onClick={() => go('/settings')}><Settings2 size={17} strokeWidth={1.6} />Mi negocio</button>{(auth.can('users.manage') || !auth.protected) && <button className={`nav-item ${path === '/users' ? 'active' : ''}`} aria-current={path === '/users' ? 'page' : undefined} onClick={() => go('/users')}><UserCog size={17} strokeWidth={1.6} />Usuarios y acceso{!auth.protected && <span className="nav-count nav-alert">!</span>}</button>}<button className="nav-item" onClick={() => setPrefsOpen(true)}><Palette size={17} strokeWidth={1.6} />Apariencia<span className="nav-hint">{THEMES[prefs.theme].short}</span></button><button className="nav-item" onClick={() => setHelpOpen(true)}><CircleHelp size={17} strokeWidth={1.6} />Centro de ayuda<ArrowRight size={12} style={{ marginLeft: 'auto', opacity: .6 }} /></button></nav>
      <div className="sidebar-bottom">{auth.protected && <button className="nav-item" style={{ marginBottom: 12 }} onClick={auth.logout}><LogOut size={16} />Cerrar sesión</button>}<div className="mobile-card"><Smartphone size={19} strokeWidth={1.6} /><h4>Tu oficina, donde estés</h4><p>Gestiona y firma tus facturas<br />desde cualquier dispositivo.</p><button onClick={install}>Instalar aplicación<ArrowRight size={12} /></button></div><button className="sidebar-profile" onClick={() => setAccountOpen(true)} aria-label="Abrir mi cuenta">{auth.user ? <><span className="profile-avatar">{initials(auth.user.displayName)}</span><span><span className="profile-name">{auth.user.displayName}</span><span className="profile-role">{ROLE_INFO[auth.user.role].label} · @{auth.user.username}</span></span></> : <><span className="profile-avatar">{initials(supplier.ownerName)}</span><span><span className="profile-name">{supplier.ownerName.replace(/\s*\(.*/, '').replace(/^Ing\.\s*/, '')}</span><span className="profile-role">Modo abierto · sin cuentas</span></span></>}<ChevronRight size={14} /></button></div>
    </aside>
    <div className="main-shell"><header className="topbar no-print"><button className="icon-btn menu-toggle" aria-label="Abrir navegación" aria-expanded={drawer} onClick={() => setDrawer(s => !s)}><Menu size={21} /></button><a href="#/" className="mobile-logo"><BrandSymbol />nexo.</a><div className="breadcrumb"><Home size={13} strokeWidth={1.5} /><span>Espacio de trabajo</span><ChevronRight size={11} /><span className="current">{title}</span></div><div className="topbar-tools"><button className="global-search" onClick={() => setSearchOpen(true)} aria-label="Buscar en el sistema"><Search size={14} strokeWidth={1.7} /><span>Buscar algo…</span><kbd>⌘ K</kbd></button><button className="icon-btn topbar-tool" aria-label={`Tema: ${THEMES[prefs.theme].short}. Cambiar tema`} title={`Tema: ${THEMES[prefs.theme].label} (T)`} onClick={cycleTheme}><ThemeIcon size={17} strokeWidth={1.7} /></button><button className="icon-btn topbar-tool hide-mobile" aria-label="Atajos de teclado" title="Atajos de teclado (?)" onClick={() => setShortcutsOpen(true)}><Keyboard size={17} strokeWidth={1.7} /></button><div className="topbar-separator" /><div ref={notificationRef} className="notification-anchor"><button className={`icon-btn ${alerts.length ? 'notification-button' : ''} ${alertSummary.high ? 'urgent' : ''}`} aria-label={alerts.length ? `Ver avisos (${alerts.length})` : 'Ver avisos'} aria-expanded={notifications} onClick={() => setNotifications(s => !s)}><Bell size={18} strokeWidth={1.6} />{alerts.length > 0 && <span className="bell-count" aria-hidden="true">{alerts.length > 9 ? '9+' : alerts.length}</span>}</button>{notifications && <div className="notification-menu"><h3>{alerts.length ? `${alerts.length} ${alerts.length === 1 ? 'aviso' : 'avisos'} de tu negocio` : 'Al día con tu negocio'}</h3>{alerts.length ? <div className="notification-scroll">{alerts.slice(0, 12).map(a => { const Icon = alertIcon[a.kind]; return <button className={`notification-item sev-${a.severity}`} key={a.id} onClick={() => go(a.path)}><Icon size={17} /><span><strong>{a.title}</strong><br />{a.detail}{a.amount !== undefined && a.currency ? ` ${money(a.amount, a.currency, true)}.` : ''}</span><span className={`sev-tag ${a.severity}`}>{severityLabel[a.severity]}</span></button>; })}</div> : <p>Sin cobros vencidos, firmas pendientes ni contratos por terminar. Todo en orden.</p>}{alerts.length > 12 && <p className="notification-more">Y {alerts.length - 12} más.</p>}<button className="notification-item" onClick={() => go('/analytics')}><ChartLine size={17} /><span><strong>Análisis y metas</strong><br />Tendencia, antigüedad del cobro y metas.</span><ChevronRight size={12} /></button></div>}</div><button className="topbar-profile" onClick={() => setAccountOpen(true)} aria-label="Abrir mi cuenta"><span className="profile-avatar">{initials(auth.user?.displayName || supplier.ownerName)}</span><ChevronDown size={12} /></button></div></header>
      {!online && <div className="offline-banner" role="status"><WifiOff size={13} style={{ display: 'inline', marginRight: 6 }} />Sin conexión. Los cambios, firmas y exportaciones necesitan conexión al servidor.</div>}
      <main id="main-content" className="page-content"><div key={path} className="fade-in">{renderView()}</div><footer className="footer no-print"><span>© {new Date().getFullYear()} Nexo. Cada detalle, en orden.</span><div className="footer-links"><button onClick={() => setHelpOpen(true)}>Ayuda y documentación</button><button onClick={() => go('/settings')}>Configuración del negocio</button></div><span><span className={`server-dot ${online ? '' : 'offline'}`} />{online ? 'Conectado al servidor' : 'Sin conexión'}<span style={{ margin: '0 5px', opacity: .5 }}>·</span>v1.0</span></footer></main>
    </div>
    <nav className="mobile-nav no-print" aria-label="Navegación móvil"><button className={path === '/' ? 'active' : ''} onClick={() => go('/')}><LayoutDashboard size={19} strokeWidth={1.7} />Inicio</button><button className={path.startsWith('/invoices') ? 'active' : ''} onClick={() => go('/invoices')}><FileText size={19} strokeWidth={1.7} />Facturas</button>{canCreateInvoice ? <button className="new-mobile" aria-label="Nueva factura" onClick={() => go('/invoices/new')}><Plus size={23} /></button> : <button className={path === '/contracts' ? 'active' : ''} onClick={() => go('/contracts')}><FileSignature size={19} strokeWidth={1.7} />Contratos</button>}<button className={path === '/clients' ? 'active' : ''} onClick={() => go('/clients')}><Users size={19} strokeWidth={1.7} />Clientes</button><button onClick={() => setDrawer(true)}><MoreHorizontal size={20} />Más</button></nav>
    {searchOpen && <CommandPalette onClose={() => setSearchOpen(false)} go={go} commands={commands} />}
    {shortcutsOpen && <ShortcutsDialog onClose={() => setShortcutsOpen(false)} />}
    {prefsOpen && <PreferencesDialog onClose={() => setPrefsOpen(false)} />}
    {accountOpen && <AccountDialog onClose={() => setAccountOpen(false)} />}
    {helpOpen && <Modal title="Un negocio conectado, de principio a fin" subtitle="Tu guía rápida de Nexo Facturación." onClose={() => setHelpOpen(false)} wide><div className="help-steps"><div className="help-step"><span>1</span><div><strong>Configura tu perfil como Suministrador</strong>Completa tus datos fiscales, bancarios, impuestos y firma en «Mi negocio». Las dos actividades económicas se conservan íntegramente.</div></div><div className="help-step"><span>2</span><div><strong>Registra al Cliente y elabora su contrato</strong>Define objeto, vigencia, pagos, garantía y cláusula de aceptación. Vincula el contrato a la factura del mismo cliente.</div></div><div className="help-step"><span>3</span><div><strong>Detalla cada servicio y cada equipo</strong>Usa el catálogo de desarrollo y soporte. En instalación, identifica el equipo y documenta SO, versiones, licencias, programas, drivers y pruebas.</div></div><div className="help-step"><span>4</span><div><strong>Revisa, recibe la firma y exporta</strong>El Cliente Final firma sobre pantalla táctil o con ratón. Descarga PDF, Word o Excel con el tamaño y orientación de hoja elegidos.</div></div></div><div className="alert alert-warning"><ShieldCheck size={19} /><p>La firma dibujada es una firma manuscrita electrónica, no una firma digital certificada. Este sistema no constituye una certificación fiscal universal ni sustituye la facturación electrónica oficial. Antes de usarlo en producción, adapta impuestos y requisitos a tu país y habilita autenticación, HTTPS y copias de seguridad.</p></div><div className="modal-actions"><button className="btn btn-primary" onClick={() => { setHelpOpen(false); go('/settings'); }}>Configurar mi negocio<ArrowRight size={16} /></button></div></Modal>}
    {workspaceOpen && <Modal title="Tu espacio de trabajo" subtitle="Suministrador → Cliente → Contrato → Factura → Conformidad" onClose={() => setWorkspaceOpen(false)}><div className="supplier-notice"><Building2 size={20} /><span>{auth.demo ? 'Estás trabajando con datos de ejemplo editables. Para datos reales, inicia un espacio vacío siguiendo la configuración del servidor.' : 'Tus datos se guardan en la base de datos privada de este servidor. Mantén tus datos fiscales y copias de seguridad al día.'}</span></div><h3 style={{ fontSize: 14, marginBottom: 8 }}>{supplier.businessName}</h3><p className="subtle">{clients.length} clientes · {contracts.length} contratos · {invoices.length} facturas</p><div className="modal-actions"><button className="btn btn-primary" onClick={() => { setWorkspaceOpen(false); go('/settings'); }}>Personalizar mi negocio<ArrowRight size={15} /></button></div></Modal>}
    {installHelp && <Modal title="Nexo también va contigo" subtitle="Web y móvil, con los mismos documentos y el mismo servidor." onClose={() => setInstallHelp(false)}><div className="help-steps"><div className="help-step"><Smartphone size={25} /><div><strong>iPhone o iPad</strong>Abre el sitio en Safari, pulsa Compartir y elige «Añadir a pantalla de inicio».</div></div><div className="help-step"><Download size={25} /><div><strong>Android y escritorio</strong>En Chrome o Edge abre el menú del navegador y selecciona «Instalar aplicación» o «Añadir a pantalla de inicio».</div></div></div><div className="alert alert-info"><Laptop size={19} /><p>La instalación requiere HTTPS y un navegador compatible. Si estás en una vista previa, abre el sitio en una pestaña independiente. Los datos y exportaciones necesitan conexión al servidor.</p></div></Modal>}
  </div>;
}
