import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Bell, BookOpen, Building2, ChevronDown, ChevronRight, ChevronsUpDown, CircleHelp, Command, Download, FileCheck2, FilePlus2, FileSignature, FileText, FolderKanban, Home, Laptop, Layers3, LayoutDashboard, Menu, MoreHorizontal, Plus, Search, Settings2, ShieldCheck, Smartphone, Users, WifiOff, X } from 'lucide-react';
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
import { LogOut } from 'lucide-react';

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
  const [search, setSearch] = useState('');
  const [notifications, setNotifications] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [installHelp, setInstallHelp] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<InstallEvent | null>(null);
  const [online, setOnline] = useState(navigator.onLine);
  const notificationRef = useRef<HTMLDivElement>(null);
  const pending = invoices.filter(i => isRevenue(i) && i.signatureStatus === 'pendiente_firma');
  const title = path.startsWith('/invoices') ? 'Facturas' : path.startsWith('/clients') ? 'Clientes' : path.startsWith('/contracts') ? 'Contratos' : path.startsWith('/catalog') ? 'Catálogo de servicios' : path.startsWith('/settings') ? 'Mi negocio' : 'Resumen general';
  useEffect(() => { setDrawer(false); setNotifications(false); document.title = `${title} · Nexo Facturación`; }, [route, title]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); if (!document.querySelector('[aria-modal="true"]')) setSearchOpen(true); } if (e.key === 'Escape') { setDrawer(false); setNotifications(false); } };
    const install = (e: Event) => { e.preventDefault(); setInstallPrompt(e as InstallEvent); };
    const onOnline = () => setOnline(true); const onOffline = () => setOnline(false);
    document.addEventListener('keydown', onKey); window.addEventListener('beforeinstallprompt', install); window.addEventListener('online', onOnline); window.addEventListener('offline', onOffline);
    return () => { document.removeEventListener('keydown', onKey); window.removeEventListener('beforeinstallprompt', install); window.removeEventListener('online', onOnline); window.removeEventListener('offline', onOffline); };
  }, []);
  useEffect(() => { const outside = (e: MouseEvent) => { if (notificationRef.current && !notificationRef.current.contains(e.target as Node)) setNotifications(false); }; if (notifications) document.addEventListener('mousedown', outside); return () => document.removeEventListener('mousedown', outside); }, [notifications]);
  const go = (url: string) => { navigate(url); setSearchOpen(false); setDrawer(false); };
  const install = async () => { if (installPrompt) { await installPrompt.prompt(); await installPrompt.userChoice; setInstallPrompt(null); } else setInstallHelp(true); };
  const navItems = [
    { path: '/', label: 'Resumen general', icon: LayoutDashboard },
    { path: '/invoices', label: 'Facturas', icon: FileText, count: invoices.length },
    { path: '/clients', label: 'Clientes', icon: Users },
    { path: '/contracts', label: 'Contratos', icon: FileSignature },
    { path: '/catalog', label: 'Catálogo de servicios', icon: Layers3 },
  ];
  const normalizedSearch = search.trim().toLocaleLowerCase('es');
  const results = [
    ...invoices.filter(i => `${i.invoiceNumber} ${i.client?.name} ${i.contract?.contractNumber}`.toLowerCase().includes(normalizedSearch)).slice(0, 5).map(i => ({ key: i.id, title: i.invoiceNumber, subtitle: `${i.client?.name} · ${money(i.total, i.currency, true)}`, path: `/invoices/${i.id}`, icon: FileText })),
    ...clients.filter(c => `${c.name} ${c.taxId} ${c.representativeName}`.toLowerCase().includes(normalizedSearch)).slice(0, 3).map(c => ({ key: c.id, title: c.name, subtitle: `Cliente · ${c.code}`, path: `/clients?edit=${c.id}`, icon: Users })),
    ...contracts.filter(c => `${c.contractNumber} ${c.title}`.toLowerCase().includes(normalizedSearch)).slice(0, 3).map(c => ({ key: c.id, title: c.contractNumber, subtitle: c.title, path: `/contracts?edit=${c.id}`, icon: FileSignature })),
  ];
  const renderView = () => {
    if (path === '/') return <DashboardView />;
    if (path === '/invoices') return <InvoicesListView route={route} />;
    if (path === '/invoices/new') return <InvoiceBuilderView />;
    if (path.startsWith('/invoices/')) {
      const id = path.split('/')[2]; const invoice = invoices.find(i => i.id === id);
      if (!invoice) return <EmptyState title="No encontramos esta factura" description="Puede haber sido eliminada. Vuelve al listado para consultar tus documentos." action={<button className="btn btn-primary" onClick={() => go('/invoices')}>Ver facturas</button>} />;
      return path.endsWith('/edit') && invoice.signatureStatus !== 'firmada_cliente' ? <InvoiceBuilderView key={id} invoice={invoice} /> : <InvoiceDetailView key={id} invoice={invoice} route={route} />;
    }
    if (path === '/clients') return <ClientsView route={route} />;
    if (path === '/contracts') return <ContractsView route={route} />;
    if (path === '/catalog') return <CatalogView />;
    if (path === '/settings') return <SupplierProfileView />;
    return <EmptyState title="Esta página no existe" description="Regresa a tu espacio de trabajo para continuar." action={<button className="btn btn-primary" onClick={() => go('/')}>Ir al resumen</button>} />;
  };
  return <div className="app-shell"><a className="skip-link" href="#main-content">Saltar al contenido</a>{drawer && <button className="sidebar-scrim" aria-label="Cerrar navegación" onClick={() => setDrawer(false)} />}
    <aside className={`sidebar no-print ${drawer ? 'open' : ''}`} aria-label="Navegación principal">
      <a href="#/" className="brand" aria-label="Nexo, inicio"><BrandSymbol /><div><div className="brand-word">nexo<b>.</b></div><div className="brand-subtitle">Facturación inteligente</div></div></a>
      <button className="workspace-switcher" onClick={() => setWorkspaceOpen(true)}><span className="workspace-avatar"><Building2 size={17} strokeWidth={1.6} /></span><span><span className="workspace-title">Mi espacio de trabajo</span><span className="workspace-subtitle"><span className="demo-dot" style={!auth.demo ? { background: '#7e9c83' } : undefined} />{auth.demo ? 'Datos de demostración' : 'Espacio privado'}</span></span><ChevronsUpDown size={13} /></button>
      <div className="nav-label">PRINCIPAL</div><nav className="sidebar-nav">{navItems.map(item => <button key={item.path} className={`nav-item ${(item.path === '/' ? path === '/' : path.startsWith(item.path)) ? 'active' : ''}`} aria-current={(item.path === '/' ? path === '/' : path.startsWith(item.path)) ? 'page' : undefined} onClick={() => go(item.path)}><item.icon size={17} strokeWidth={1.6} /><span>{item.label}</span>{item.count !== undefined && <span className="nav-count">{item.count.toString().padStart(2, '0')}</span>}</button>)}</nav>
      <div className="nav-divider" /><div className="nav-label">MI ESPACIO</div><nav className="sidebar-nav"><button className={`nav-item ${path === '/settings' ? 'active' : ''}`} onClick={() => go('/settings')}><Settings2 size={17} strokeWidth={1.6} />Mi negocio</button><button className="nav-item" onClick={() => setHelpOpen(true)}><CircleHelp size={17} strokeWidth={1.6} />Centro de ayuda<ArrowRight size={12} style={{ marginLeft: 'auto', opacity: .6 }} /></button></nav>
      <div className="sidebar-bottom">{auth.protected && <button className="nav-item" style={{ marginBottom: 12 }} onClick={auth.logout}><LogOut size={16} />Cerrar sesión</button>}<div className="mobile-card"><Smartphone size={19} strokeWidth={1.6} /><h4>Tu oficina, donde estés</h4><p>Gestiona y firma tus facturas<br />desde cualquier dispositivo.</p><button onClick={install}>Instalar aplicación<ArrowRight size={12} /></button></div><button className="sidebar-profile" onClick={() => go('/settings')}><span className="profile-avatar">{initials(supplier.ownerName)}</span><span><span className="profile-name">{supplier.ownerName.replace(/\s*\(.*/, '').replace(/^Ing\.\s*/, '')}</span><span className="profile-role">Suministrador · Mi negocio</span></span><ChevronRight size={14} /></button></div>
    </aside>
    <div className="main-shell"><header className="topbar no-print"><button className="icon-btn menu-toggle" aria-label="Abrir navegación" aria-expanded={drawer} onClick={() => setDrawer(s => !s)}><Menu size={21} /></button><a href="#/" className="mobile-logo"><BrandSymbol />nexo.</a><div className="breadcrumb"><Home size={13} strokeWidth={1.5} /><span>Espacio de trabajo</span><ChevronRight size={11} /><span className="current">{title}</span></div><div className="topbar-tools"><button className="global-search" onClick={() => setSearchOpen(true)} aria-label="Buscar en el sistema"><Search size={14} strokeWidth={1.7} /><span>Buscar algo…</span><kbd>⌘ K</kbd></button><div className="topbar-separator" /><div ref={notificationRef}><button className={`icon-btn ${pending.length ? 'notification-button' : ''}`} aria-label="Ver notificaciones" aria-expanded={notifications} onClick={() => setNotifications(s => !s)}><Bell size={18} strokeWidth={1.6} /></button>{notifications && <div className="notification-menu"><h3>Al día con tu negocio</h3>{pending.length ? pending.map(i => <button className="notification-item" key={i.id} onClick={() => go(`/invoices/${i.id}?sign=1`)}><FileSignature size={17} /><span><strong>{i.invoiceNumber}</strong><br />Pendiente de conformidad de {i.client?.name}</span><ChevronRight size={12} /></button>) : <p>No tienes firmas pendientes. Todo en orden.</p>}<button className="notification-item" onClick={() => go('/contracts')}><FileCheck2 size={17} /><span><strong>{contracts.filter(c => ['vigente', 'en_ejecucion'].includes(c.status)).length} contratos activos</strong><br />Consulta tus condiciones y entregables.</span></button></div>}</div><button className="topbar-profile" onClick={() => go('/settings')} aria-label="Abrir perfil del suministrador"><span className="profile-avatar">{initials(supplier.ownerName)}</span><ChevronDown size={12} /></button></div></header>
      {!online && <div className="offline-banner" role="status"><WifiOff size={13} style={{ display: 'inline', marginRight: 6 }} />Sin conexión. Los cambios, firmas y exportaciones necesitan conexión al servidor.</div>}
      <main id="main-content" className="page-content"><div key={path} className="fade-in">{renderView()}</div><footer className="footer no-print"><span>© {new Date().getFullYear()} Nexo. Cada detalle, en orden.</span><div className="footer-links"><button onClick={() => setHelpOpen(true)}>Ayuda y documentación</button><button onClick={() => go('/settings')}>Configuración del negocio</button></div><span><span className="server-dot" style={!online ? { background: '#c59c65' } : undefined} />{online ? 'Conectado al servidor' : 'Sin conexión'}<span style={{ margin: '0 5px', opacity: .5 }}>·</span>v1.0</span></footer></main>
    </div>
    <nav className="mobile-nav no-print" aria-label="Navegación móvil"><button className={path === '/' ? 'active' : ''} onClick={() => go('/')}><LayoutDashboard size={19} strokeWidth={1.7} />Inicio</button><button className={path.startsWith('/invoices') ? 'active' : ''} onClick={() => go('/invoices')}><FileText size={19} strokeWidth={1.7} />Facturas</button><button className="new-mobile" aria-label="Nueva factura" onClick={() => go('/invoices/new')}><Plus size={23} /></button><button className={path === '/clients' ? 'active' : ''} onClick={() => go('/clients')}><Users size={19} strokeWidth={1.7} />Clientes</button><button onClick={() => setDrawer(true)}><MoreHorizontal size={20} />Más</button></nav>
    {searchOpen && <Modal title="Encuentra lo que necesitas" subtitle="Busca facturas, clientes o contratos. Atajo: Ctrl / ⌘ + K." onClose={() => setSearchOpen(false)}><div className="command-search"><Search size={19} /><input autoFocus placeholder="Número de factura, cliente, contrato…" value={search} onChange={e => setSearch(e.target.value)} aria-label="Buscar facturas, clientes y contratos" /></div><div className="command-results">{results.length ? results.map(r => <button className="command-result" key={r.key} onClick={() => go(r.path)}><r.icon size={18} /><div><strong>{r.title}</strong><span>{r.subtitle}</span></div><ChevronRight size={14} /></button>) : <EmptyState title="Sin resultados" description="Prueba con otro nombre o número de documento." />}</div><div className="modal-actions"><button className="btn btn-primary" onClick={() => go('/invoices/new')}><Plus size={16} />Crear una factura</button></div></Modal>}
    {helpOpen && <Modal title="Un negocio conectado, de principio a fin" subtitle="Tu guía rápida de Nexo Facturación." onClose={() => setHelpOpen(false)} wide><div className="help-steps"><div className="help-step"><span>1</span><div><strong>Configura tu perfil como Suministrador</strong>Completa tus datos fiscales, bancarios, impuestos y firma en «Mi negocio». Las dos actividades económicas se conservan íntegramente.</div></div><div className="help-step"><span>2</span><div><strong>Registra al Cliente y elabora su contrato</strong>Define objeto, vigencia, pagos, garantía y cláusula de aceptación. Vincula el contrato a la factura del mismo cliente.</div></div><div className="help-step"><span>3</span><div><strong>Detalla cada servicio y cada equipo</strong>Usa el catálogo de desarrollo y soporte. En instalación, identifica el equipo y documenta SO, versiones, licencias, programas, drivers y pruebas.</div></div><div className="help-step"><span>4</span><div><strong>Revisa, recibe la firma y exporta</strong>El Cliente Final firma sobre pantalla táctil o con ratón. Descarga PDF, Word o Excel con el tamaño y orientación de hoja elegidos.</div></div></div><div className="alert alert-warning"><ShieldCheck size={19} /><p>La firma dibujada es una firma manuscrita electrónica, no una firma digital certificada. Este sistema no constituye una certificación fiscal universal ni sustituye la facturación electrónica oficial. Antes de usarlo en producción, adapta impuestos y requisitos a tu país y habilita autenticación, HTTPS y copias de seguridad.</p></div><div className="modal-actions"><button className="btn btn-primary" onClick={() => { setHelpOpen(false); go('/settings'); }}>Configurar mi negocio<ArrowRight size={16} /></button></div></Modal>}
    {workspaceOpen && <Modal title="Tu espacio de trabajo" subtitle="Suministrador → Cliente → Contrato → Factura → Conformidad" onClose={() => setWorkspaceOpen(false)}><div className="supplier-notice"><Building2 size={20} /><span>{auth.demo ? 'Estás trabajando con datos de ejemplo editables. Para datos reales, inicia un espacio vacío siguiendo la configuración del servidor.' : 'Tus datos se guardan en la base de datos privada de este servidor. Mantén tus datos fiscales y copias de seguridad al día.'}</span></div><h3 style={{ fontSize: 14, marginBottom: 8 }}>{supplier.businessName}</h3><p className="subtle">{clients.length} clientes · {contracts.length} contratos · {invoices.length} facturas</p><div className="modal-actions"><button className="btn btn-primary" onClick={() => { setWorkspaceOpen(false); go('/settings'); }}>Personalizar mi negocio<ArrowRight size={15} /></button></div></Modal>}
    {installHelp && <Modal title="Nexo también va contigo" subtitle="Web y móvil, con los mismos documentos y el mismo servidor." onClose={() => setInstallHelp(false)}><div className="help-steps"><div className="help-step"><Smartphone size={25} /><div><strong>iPhone o iPad</strong>Abre el sitio en Safari, pulsa Compartir y elige «Añadir a pantalla de inicio».</div></div><div className="help-step"><Download size={25} /><div><strong>Android y escritorio</strong>En Chrome o Edge abre el menú del navegador y selecciona «Instalar aplicación» o «Añadir a pantalla de inicio».</div></div></div><div className="alert alert-info"><Laptop size={19} /><p>La instalación requiere HTTPS y un navegador compatible. Si estás en una vista previa, abre el sitio en una pestaña independiente. Los datos y exportaciones necesitan conexión al servidor.</p></div></Modal>}
  </div>;
}
