# Auditoría y remediación · Nexo Facturación

**Fecha:** 2026-11-04 (America/Havana). **Jurisdicción/alcance confirmado:** Cuba; TCP/persona natural; ingresos 2026; facturación y soporte, sin procesamiento directo de tarjetas ni salud. **Base comparada:** `d43c537d74ca31b4012c9104925c5d8de72e5d07`. **Rama:** `arena/8420774d-sistema-de-facturacion`.

**Ampliación técnica, 2026-11-06:** [CI Linux y Windows del commit `74af521`](https://github.com/yhquintero/Sistema_de_Facturacion/actions/runs/42319313336) aprobada con datos sintéticos, incluido parser PowerShell nativo, DACL y ciclo backend/Caddy/HTTPS/backup/reinicio/parada. Se corrigieron orden build→test, checksum oficial SHA-512 de Caddy y selección de ejecutable PATH. Véase VERIFICACION.md. Esta ampliación no es nueva verificación jurídica, validación del equipo del usuario ni despliegue público.

**Método y límites:** revisión de código/configuración, comparación Git, pruebas de dominio/API/criptografía/TLS local y navegador con datos sintéticos; consulta de fuentes primarias jurídicas. No se accedió a tus equipos, datos reales, dominio, router, ONAT, nube, CA pública ni infraestructura productiva. No es pentest externo, dictamen jurídico, certificación, homologación ONAT ni garantía de ausencia de malware. Los controles añadidos y su evidencia se distinguen de configuraciones pendientes. No se asigna CVE ni una puntuación global de «seguridad».

## 1. Marco jurídico aplicable → controles técnicos y organizativos

### 1.1 Protección de datos y seguridad TIC en Cuba

Texto consultado de **Ley 149/2022 y Res. MINCOM 58/2022**: [Gaceta 90 ordinaria, publicación oficial MINJUS](https://www.minjus.gob.cu/sites/default/files/archivos/publicacion/2022-08/goc-2022-o90_0_0.pdf), incluidos capítulos de principios, derechos, conservación, obligaciones, transferencias y articulado de la Resolución. No se importa automáticamente GDPR ni su plazo de 72 horas.

| Norma/verificación | Traducción concreta para este sistema | Implementado / evidencia | Pendiente del responsable |
|---|---|---|---|
| Ley 149 arts. 10–12, 17, 44–47: finalidad, seguridad, información y supuestos de consentimiento/excepción | Recoger solo datos fiscales/contractuales necesarios; no credenciales de clientes ni datos de tarjeta/salud; identificar responsable/finalidad/destinatarios/conservación antes de recogida | Aviso inicial público `/api/privacy`, accesible en login/web; responsable/contacto exigidos al arrancar producción real; sin analítica/CDN de terceros; cabeceras, scrypt, sesión y control de acceso | Aprobar aviso completo, bases de tratamiento y forma de acreditar información/consentimiento o excepción legal; inventario de campos/destinatarios y acuerdos de confidencialidad. La conformidad de una factura no sustituye un consentimiento general de privacidad |
| Ley 149 arts. 19–28 y 44: derechos y procedimiento | Canal de solicitudes, comprobar identidad/representación, acceso sin revelar otros clientes, rectificaciones sin destruir documentos sujetos a conservación | Contacto de privacidad configurado, exportación documental y snapshots históricos; no hay portal automatizado de derechos | Procedimiento y registro de solicitudes. Art. 25: hasta **5 días hábiles** para decidir procedencia y efectividad dentro de **10 días hábiles desde la formulación**, con ampliación única justificada en los términos de la norma; no interpretar como 5+10 automáticamente |
| Ley 149 art. 39: conservación según finalidad/norma; hasta cinco años salvo ley distinta o consentimiento de otro plazo | Calendario por categoría (facturas, contratos, firmas, logs, backups), bloqueo por obligaciones fiscales/litigio y supresión segura cuando proceda | No se borra automáticamente historia fiscal/firmada; errores/logs no contienen cuerpos/firmas/contraseñas | Determinar plazos fiscales/especiales y excepciones con asesor; aplicar calendario a copias y descargas. **No se propone un borrado universal a los cinco años ni conservación indefinida** |
| Ley 149 arts. 40–43: control/declaración de bases conforme al marco de autoridad competente | Identificar responsable, finalidad, categorías, ubicación, cesiones, acceso y conservación; tramitar declaración/actualización que proceda | Modelo de configuración y documentación de despliegue | Gestión formal ante autoridad competente, sin presumir que subir código/llenar configuración registra la base |
| Ley 149 art. 48; Res. 58 art. 4: incidentes y salvaguardas | Detectar, contener, conservar evidencia y notificar conforme a legislación/autoridad aplicable | Registro NDJSON sin secretos, ID de petición, límites, backups autenticados, guía de incidente | Designar responsable, contactos oficiales, clasificación, escalamiento y plazos aplicables; simulacro. No se ha notificado ni ensayado un incidente real |
| Res. 58 arts. 6 y 8: seguridad/respaldo, información sobre finalidad, ubicación, cookies y opciones | Backup consistente/cifrado; cookie necesaria; información inicial; almacenamiento explícito | AES-256-GCM, restauración solo a archivo nuevo, cookie HttpOnly/SameSite/Secure bajo HTTPS y CSRF; PWA sin caché de API/documentos | Programación, copias desconectadas y recuperación real; aprobación de textos/conservación; comprobar permisos Windows/disco |
| **Res. 58 art. 7** y Ley 149 arts. 63–66/excepciones aplicables: ubicación/transferencias | No asumir hospedaje o réplicas extranjeros permitidos; servidor nacional físicamente en Cuba salvo casos previstos y revisados | País declarado o referencia de excepción exigidos para producción real; panel no crea túnel ni nube extranjera; código no verifica geolocalización | **Gate previo a datos reales:** contrato/proveedor, ubicación física/réplicas/backups, accesos y posibles transferencias; revisión jurídica de excepción si corresponde. `CU` en un archivo no constituye prueba |
| Res. 58 art. 8(d): cambios de términos y condiciones | Avisar con **al menos tres meses** de antelación mediante canales admitidos | Versión técnica del aviso y documentación de operación | Proceso de notificación, evidencia de fechas/destinatarios y aprobación de cambios; no se confunde con retrasar parches de seguridad |

**Seguridad TIC:** se leyeron arts. 1–22 del **Decreto 360/2019**, en particular art. 10 (incluye personas naturales), enfoque de riesgo/medidas integrales y planificación (arts. 13–20), en [Gaceta 45/2019](https://www.gacetaoficial.gob.cu/sites/default/files/goc-2019-o45.pdf). Se traduce a inventario de activos, riesgos, responsabilidades, controles físicos/organizativos, continuidad e incidentes, no solamente HTTPS. El [catálogo oficial de esa publicación](https://www.gacetaoficial.gob.cu/es/gaceta-oficial-no-45-ordinaria-de-2019) identifica también Res. 128/129/2019: **su texto completo, reformas y requisitos específicos deben verificarse con asesor/autoridad** antes de afirmar cumplimiento integral; no se inventan artículos o plazos.

### 1.2 Facturación, contabilidad y ONAT: ejercicio 2026

| Fuente y alcance verificado | Control/decisión adoptada | Lo que no se certifica |
|---|---|---|
| **Ley 113/2012 concordada, ES1 de 12/01/2026**, arts. 50–58: otros ingresos, deducciones, pagos anticipados, registros/sistema contable. [Texto oficial](https://www.gacetaoficial.gob.cu/sites/default/files/goc-2026-es1.pdf) | Libro de cobros/gastos/tributos, soporte, fechas, cambio documentado, conciliación y reversiones; no se inventa que una factura `pagada` sea un cobro con fecha | El art. 57 remite a registros establecidos por ONAT; el libro propio es **auxiliar**. No es NCIF completa ni liquidación de todos los ingresos personales |
| **Ley 181/2025**, presupuesto 2026; art. 52 leído en [publicación MFP](https://www.mfp.gob.cu/ficheros/publicaciones/P-GOC%5B139-2025%5D.pdf) | Se separa **campaña 2026 = ingresos 2025** de ingresos **2026**. No se reutilizan automáticamente escala, casillas o bonificación de la campaña anterior | No se asegura que las reglas de liquidación/campaña 2027 estén verificadas; no se programan cuotas finales con una norma temporal incorrecta |
| Res. 271/2024 y 272/2024, Gaceta 78; **catálogos** de tributación/precios y actualización contable, no lectura integral acreditada del articulado operativo. [271](https://www.gacetaoficial.gob.cu/es/resolucion-271-de-2024-de-ministerio-de-finanzas-y-precios), [272](https://www.gacetaoficial.gob.cu/es/resolucion-272-de-2024-de-ministerio-de-finanzas-y-precios) | Perfil de vector/actividad/municipio; clasificación de gastos por operador con soporte/fundamento. No se supone un tipo universal del 10% ni deducibilidad automática | Umbrales y supuestos contables exactos, exenciones/tipos y obligaciones individuales deben validarse. El MFP describe >/<500 000 CUP [3](https://www.mfp.gob.cu/noticia/887); no se ha resuelto aquí el supuesto exactamente igual ni se automatiza ese umbral |
| DJ-08 y otros modelos oficiales ONAT | Exportación XLSX/CSV/JSON/ZIP claramente **BORRADOR AUXILIAR**; endpoint DJ-08 oficial bloqueado **409**; sin envío automático | Descargas ONAT no verificables desde el entorno; no se obtuvo plantilla/instructivo de ingresos 2026/campaña 2027. No se afirma que no exista, sino que no se verificó. Otros modelos dependen del vector, no se promete una lista universal completa |
| Inscripción TCP/actividad autorizada y seguridad social | Se conservan literalmente los textos del usuario; perfil fiscal pide referencia de vector/actividad/inscripción; entradas separadas de seguridad social | Texto de actividad ≠ licencia/autorización. El Decreto-Ley 90/2024 aparece modificado en el catálogo; no se presenta como texto inalterado. No se aplica por defecto el Decreto 107/2024 que figura derogado. Consultar [Gaceta 78 y estado de normas](https://www.gacetaoficial.gob.cu/es/gaceta-oficial-no-78-ordinaria-de-2024) |
| Imagen de firma/eficacia de evidencia | Consentimiento explícito de conformidad, contenido congelado, snapshot y huella; no se exporta un supuesto certificado ONAT | Firma dibujada no acredita sola identidad/representación, no es sello de tercero ni certificado de firma digital; canal/admisión/eficacia jurídica requieren contraste |

**Actualización normativa:** enero 2026 no es una consolidación exhaustiva hasta noviembre. El [catálogo actual de Ley 113](https://www.gacetaoficial.gob.cu/es/ley-113-de-2012-de-asamblea-nacional-del-poder-popular) identifica reformas; el [catálogo Res. 93/2026](https://www.gacetaoficial.gob.cu/es/resolucion-93-de-2026-de-ministerio-de-finanzas-y-precios) describe un cambio de documentos migratorios del Anexo 4; el [catálogo Ley 187/2026](https://www.gacetaoficial.gob.cu/es/ley-187-de-2026-de-asamblea-nacional-del-poder-popular) la identifica como **Ley de la Vivienda**, modificativa de Ley 113. No se confunden con privacidad ni se extrapolan a tasas TCP de soporte informático. Su texto/entrada en vigor y cualquier otra reforma especial deben contrastarse según operación; esta revisión no certifica ausencia de otras normas.

**No aplicabilidad automática:** no se exige PCI DSS por no tratar datos de tarjeta, ni HIPAA por no tratar salud, ni GDPR/RGPD por idioma o ubicación aproximada del operador. Si cambia actividad, mercados/establecimiento, titulares o datos tratados, se revisa extraterritorialidad y alcance. Contabilidad profesional/servicios financieros/AML, empleados, importaciones, ventas físicas u otras actividades requieren estudio adicional; no se infieren del hecho de usar una aplicación de facturación.

## 2. Estándares/certificaciones: prioridad, esfuerzo y presupuesto realista

**Orden recomendado para un TCP pequeño:** obligaciones cubanas y operación segura → verificación técnica → gestión sostenida → certificación solo si aporta valor contractual. Los siguientes son **presupuestos de planificación propios, orientativos en USD**, no cotizaciones ni precios cubanos verificados. Excluyen impuestos, licencias/hardware, hospedaje, viajes y disponibilidad/condiciones de contratación de proveedores; confirmar contratación y restricciones aplicables a Cuba. Un recurso abierto puede costar cero en licencia pero requiere horas.

| Prioridad / referencia | Qué se adopta | Esfuerzo/presupuesto orientativo | Certificación y condición de salida |
|---|---|---|---|
| **0. Controles operativos + revisión cubana** | Inventario, residencia, vector, privacidad, cifrado de disco, mínimo privilegio, restauración, parches y respuesta a incidentes | 3–10 jornadas técnicas + 1–3 jornadas de asesoría; reservar ~300–2500 USD según apoyo externo, más infraestructura local | Evidencias firmadas por responsables/asesor, no un «sello» de la web; antes de datos reales |
| **1. OWASP ASVS 5.0.0** (30/05/2025), objetivo L2 acorde a riesgo | Matriz de requisitos aplicables: auth/sesión, validación, autorización, criptografía, errores, configuración y pruebas negativas. [Fuente primaria](https://owasp.org/www-project-application-security-verification-standard/) | Gap assessment 16–40 h; remediación/pruebas 40–120 h, 2–6 semanas; ~1500–10000 USD con tercero según alcance | Estándar abierto, **no certificación de OWASP** ni cumplimiento L2 demostrado por esta entrega. Exigir matriz requisito/evidencia/no aplicable y revisión independiente |
| **1. Pentest web/API + revisión TLS/infra** después de remediar | Auditor autorizado independiente, dominio real, dos cuentas/roles si se añaden, móvil, backup/restore, abuso y retest | 3–8 jornadas + 1–2 retest; ~1500–8000 USD para alcance pequeño bien delimitado | Informe y retest, no garantía «sin vulnerabilidades»; no se ha contratado/ejecutado aquí |
| **2. NIST CSF 2.0** | Perfil actual/objetivo en GOVERN, IDENTIFY, PROTECT, DETECT, RESPOND, RECOVER, dueño/evidencia/métrica por resultado. [Documento NIST](https://nvlpubs.nist.gov/nistpubs/CSWP/NIST.CSWP.29.pdf) | 16–40 h iniciales, 1–2 semanas; licencia gratuita, 0 USD si autogestionado o ~500–2500 con apoyo; mantenimiento mensual | Marco de gestión, no certificación NIST de un producto; adaptar al TCP, sin burocracia de gran empresa |
| **2. OWASP MASVS/MASTG**, aplicado con criterio a PWA | Caché/descargas, sesión/canal, almacenamiento/navegador y privacidad en Android/iOS. [Fuente OWASP](https://mas.owasp.org/MASVS/) | 2–5 jornadas con teléfonos reales; ~500–2500 USD si separado de pentest | PWA no es app nativa: no afirmar pinning, detección root/jailbreak ni cumplimiento íntegro de controles nativos |
| **3. ISO/IEC 27001:2022 + Amd 1:2024** | SGSI organizacional: alcance, riesgos, tratamiento, políticas, competencias, proveedores, evaluación, auditoría interna y mejora | ~6–12 meses y 200–600 h según madurez; reserva inicial ~7000–30000 USD incluyendo preparación/auditorías y ~2000–10000/año de mantenimiento/seguimiento; solicitar cotizaciones | La certifica un organismo de certificación competente/acreditado en un alcance organizativo, **no el propio código ni ISO**. Fuente pública [ISO](https://www.iso.org/standard/27001) confirma edición/enmienda; no se declara haber auditado cláusulas de texto licenciado |
| **No prioritario ahora: SOC 2 / marcos de tarjetas/salud** | Solo por cliente/contrato o cambio real de alcance | SOC 2 puede requerir decenas de miles de USD y meses de evidencias; no presupuestarlo al TCP sin necesidad | SOC 2 es atestación, no sustituto de ley cubana; PCI/sector salud no se fuerzan artificialmente |

HTTPS, un antivirus, `npm audit=0` o un manifiesto SHA-256 **no certifican** el sistema. En particular, usar un certificado público TLS no significa «aplicación certificada» ni «ONAT homologada».

## 3. Vulnerabilidades/riesgos por capas: revisión real del repositorio

| Capa | Observación del baseline y control añadido | Riesgo residual / validación que falta |
|---|---|---|
| **Web / API** | SQL preparado y validación Zod ya existían; ahora CSP productiva sin scripts inline/eval, origen/Host/Fetch-Metadata, CSRF por sesión, errores saneados, rutas protegidas, límites API/exportación | No se demostró SQLi, XSS o RCE; no se inventa un exploit. Estilos inline aún permitidos por diseño React. Falta revisión ASVS completa, fuzzing y pentest independiente |
| **TLS / transporte** | Baseline levantaba `http.createServer` en 0.0.0.0 sin imposición TLS. Ahora TLS directo validado antes de abrir BD o proxy con IP/CIDR explícitos; TLS1.2/1.3, HTTPS para operaciones, HSTS en producción HTTPS | Cadena/nombre verificados con CA de laboratorio; dominio público, ACME, DNS, renovación, suites/SSL scan desde Internet aún pendientes. Cabeceras de proxy solo seguras si backend no es accesible directamente |
| **Auth / sesión** | Antes clave en variable y comparación SHA-256, sin KDF de almacenamiento; ahora scrypt-file, cookie `__Host-` bajo HTTPS, CSRF, límites KDF/login/sesión, caducidad absoluta y por inactividad HTTP, logout verificado | Compatibilidad `APP_PASSWORD`/file en claro sigue disponible para migración, no recomendada. Un solo administrador compartido, sin MFA/RBAC/tenants; no dar acceso general a clientes. Refrescos HTTP automáticos pueden renovar inactividad; máximo absoluto sigue en 8 h |
| **Servidor / infraestructura** | Arranque validado, timeouts/límites, loopback detrás de Caddy, panel con PID+inicio+exe y handshake de instancia, JSON atómico, bloqueo operativo y permisos privados. Compose separa proxy/backend | No se inspeccionaron SO, permisos/DACL reales de Windows, firewall/router, parches, servicio al reinicio, UPS ni imágenes Docker. La plantilla no equivale a despliegue probado |
| **Móvil / PWA / tiempo real** | Caché solo de recursos públicos; offline sin datos privados; SSE autenticado, invalidaciones sin PII, revocación, caps/backpressure, heartbeat y resync; indicador visible | No hay edición offline, aislamiento nativo o pinning. Descargas quedan bajo control del teléfono/usuario; confianza CA en cada móvil y rutas LAN/Internet pendientes. SSE es de un proceso, no sincronización de varios servidores |
| **Datos / cripto / fiscal** | Backups antes en SQLite plano; ahora snapshot privado, AES-256-GCM, clave separada, autenticación y `quick_check` al descifrar. Facturas emitidas no se reescriben; firma/snapshots previos preservados. Libro fiscal append-only/idempotente y FX→CUP | SQLite activa sin cifrado propio; requiere BitLocker/LUKS. Hash interno puede recalcularse o truncarse por administrador. No hay sellado temporal independiente, WORM, auditoría de identidad individual ni NCIF integral |
| **Malware / abuso / endpoints** | No se añadieron ejecutores remotos, cargas de binarios de usuario ni descargas silenciosas al panel. Fuentes/licencias/drivers se documentan; claves no van por URL/argumentos | No se pasó AV/EDR al equipo del usuario; no afirmar «libre de malware». Verificar SO/Defender/EDR, binarios, drivers, periféricos y paquetes. Un endpoint comprometido puede capturar contraseña/firma aun con TLS |
| **Cadena de suministro / CI** | Lockfile + npm ci; audit sin avisos; acciones GitHub fijadas a SHA; Dependabot añadido; checksum Caddy y aprobación de cambio; ZIP allowlist/manifest con rechazo de symlink/marcadores de secretos; job SBOM y Windows | Audit solo detecta avisos conocidos, no malware/0-days. CI Linux/Windows aprobada con fixtures en GitHub (véase ampliación técnica); el entorno del usuario sigue pendiente. Tags Docker aun sin digest/escaneo; checksum del mismo proveedor no protege contra compromiso de ese proveedor. Revisar secretos incrustados manualmente en fuentes/docs |

## 4. Hallazgos con severidad, evidencia/reproducción, impacto y remediación

**Criterio:** severidad de riesgo propio (técnico + negocio/jurídico), no rating de un certificador. CVSS **v3.1 provisional** solo para escenarios técnicos delimitados; no se puntúa una obligación legal, ausencia de certificación o infraestructura que no se ha examinado. Las reproducciones se limitan al repositorio/fixtures, nunca datos reales ni terceros.

### NEXO-01 — Transporte HTTP y exposición no restringida

- **Alta. CVSS estimado 7.3:** `CVSS:3.1/AV:A/AC:L/PR:N/UI:R/S:U/C:H/I:H/A:N`, escenario de adversario en red local no confiable/posición de interceptación mientras el usuario usa HTTP. No es puntuación de un endpoint público escaneado.
- **Evidencia baseline:** `git show d43c537:server/index.ts`: `http.createServer`, escucha 0.0.0.0; no comprobación de TLS. Cookie Secure dependía de `req.secure` pero no se exigía HTTPS.
- **Reproducción segura:** fixture local HTTP y revisión de transporte; las nuevas pruebas rechazan login HTTP bajo modo TLS, protocolos ≤TLS1.1 y certificados no confiables/nombre incorrecto. `tests/security.test.ts`, `tests/tls.test.ts`.
- **Impacto:** lectura/alteración de datos/credencial en tránsito; afecta salvaguardas Ley 149/Res. 58. No se afirma un incidente ocurrido.
- **Remediación:** configuración estricta, TLS directo/proxy, HSTS y panel Caddy; puerto interno loopback, orígenes explícitos. **Código mitigado y TLS local probado; despliegue público pendiente.**

### NEXO-02 — Bandera de demo no ligada a procedencia de la BD

- **Crítica condicional. CVSS estimado 9.1:** `CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:N`, únicamente si se publicaba `ALLOW_PUBLIC_DEMO=true`, sin contraseña, con una BD privada existente. No era el modo productivo protegido por defecto.
- **Evidencia baseline:** `server/index.ts` permitía omitir contraseña mediante esa bandera; `createApp()` aceptaba todas las sesiones sin password y no cruzaba `getWorkspaceInfo().demo`.
- **Reproducción:** fixture privada + bandera de demo. `tests/control-startup.test.ts` ahora verifica rechazo antes de escuchar; nunca convierte ni elimina la base.
- **Impacto:** acceso/alteración de datos por error operativo, privacidad y evidencia fiscal.
- **Remediación:** exigir BD marcada demo cuando se habilita la excepción y rechazar espacio privado sin auth incluso en desarrollo. **Corregido y probado en fixtures.** La marca demo no clasifica automáticamente el contenido: no introduzcas datos reales en una base de demostración aunque conserve esa marca.

### NEXO-03 — Copias históricas en claro / recuperación no ensayada

- **Alta según acceso al medio; CVSS no asignado** sin modelo físico/permisos del destino.
- **Evidencia:** baseline `scripts/backup.ts` generaba `.sqlite` en claro; no existía descifrado autenticado/restore verificable. Pruebas nuevas validan snapshot WAL, confidencialidad del ciphertext, clave errónea, tag/truncación y destino exclusivo.
- **Impacto:** una copia extraviada expone contratos, identidades y firmas; pérdida de respaldo no recuperable compromete disponibilidad/obligaciones.
- **Remediación:** AES-256-GCM, scratch privado, clave separada y restauración a nuevo archivo con verificación SQLite. **Probado técnicamente**; inventariar copias antiguas en claro, custodia/cifrado/retención de estas, copia offline, programación y simulacro real aún pendientes. No se borraron históricos automáticamente.

### NEXO-04 — Autenticación compartida, sin MFA ni autorización individual

- **Alta residual para Internet o varios operadores; CVSS no asignado** a una capacidad pendiente.
- **Evidencia:** `installSessions` identifica `workspace-admin`; toda sesión del espacio accede a sus clientes/facturas. No hay tenants ni roles individuales.
- **Reproducción:** dos sesiones autorizadas ven el mismo negocio y cambios; esto es el diseño actual, no una prueba de aislamiento entre clientes.
- **Impacto:** contraseña filtrada permite todo el espacio; no hay atribución individual/menor privilegio por empleado o Cliente Final.
- **Remediación inmediata:** uso por un Suministrador, acceso administrativo restringido, no compartir contraseña con clientes; firma asistida. **Pendiente:** identidad individual, MFA, roles, enlaces de firma específicos con caducidad y pruebas negativas de autorización antes de portal multicliente.

### NEXO-05 — Cifrado de disco y residencia física no demostrados

- **Alta residual / gate jurídico; CVSS N/A.**
- **Evidencia:** `DatabaseSync` almacena SQLite normal; pantalla de seguridad lo declara. País/configuración son declaraciones, no prueba de ubicación/cifrado.
- **Reproducción:** en fixtures la BD restaurada es legible con SQLite; no se inspeccionó un disco real. Configuración productiva sin responsable/contacto o país/excepción se rechaza en pruebas.
- **Impacto:** robo de equipo/medio, réplicas no permitidas y derechos/confidencialidad; Res. 58 art. 7 no se cumple poniendo `CU`.
- **Remediación:** permisos y gates añadidos, pero **faltan** evidencia BitLocker/LUKS/recuperación, proveedor/hospedaje nacional/réplicas y excepción formal si procede. Bloqueo de uso real/publicación hasta aprobar.

### NEXO-06 — Defensa de navegador/sesión insuficientemente estratificada

- **Media; endurecimiento, CVSS no asignado:** no se demostró CSRF explotable. El baseline **ya** comprobaba Origin cuando venía y usaba SameSite=Strict.
- **Evidencia:** faltaban token CSRF, CSP/HSTS, límites globales de KDF y revocación comprobada del frontend. `tests/security.test.ts` prueba tokens ausentes/incorrectos, Host/Origin/Fetch-Metadata y logout/expiración; E2E ejercita write protegido.
- **Impacto:** menor defensa ante fallos de configuración, robo de sesión o abuso; compromiso del navegador sigue siendo posible.
- **Remediación:** scrypt-file, CSRF por sesión, cabeceras, origen/Host, sesión hashada en memoria, límites 10/peer/15 min + global 60/min/KDF concurrente 2, 30 min inactividad HTTP/8 h absoluto, logout probado y Clear-Site-Data. **Implementado/probado en escenarios descritos**, no ASVS completo.

### NEXO-07 — Agotamiento de recursos / operaciones concurrentes

- **Media residual; CVSS no asignado** sin pruebas de carga externas.
- **Evidencia:** PDF/Office en memoria y SQLite síncrono; un cliente autorizado puede consumir CPU/almacenamiento. Antes no había límites específicos de exportación ni SSE (nuevo).
- **Reproducción/evidencia:** rate de login y mapa acotado probados; caps de código: API 900/min/peer, export factura 20/min, fiscal 10/min, sesiones 256, SSE 100 global/12 peer y buffer 64 KiB; timeouts y caps de conexiones de Node. No se afirma haber hecho carga de todos esos límites.
- **Remediación:** límites y backpressure añadidos; panel serializa operaciones y valida procesos/instancia. **Pendiente:** tamaño real de negocio, monitorización, disco/UPS, cuotas/retención, pruebas de estrés y DoS/edge. Clientes/contratos/catálogo aún no tienen control general de versiones; evitar edición simultánea del mismo registro. Facturas usan control de versión en borrador, contenido emitido congelado y fiscal idempotente.

### NEXO-08 — Confusión de facturación comercial con caja/liquidación fiscal

- **Alta funcional/jurídica; CVSS N/A.**
- **Evidencia:** baseline tenía estado `pagada` sin libro efectivo de cobros; no módulo de declaración aplicable a 2026. No podía deducirse fecha de cobro, gasto admitido o cuota ONAT de los totales comerciales.
- **Reproducción:** reporte fiscal inicial de fixtures devuelve ingresos 0 aunque haya factura `pagada`; pruebas de cobro parcial/moneda/cross-year/reversión/idempotencia y diferencias de conciliación. Facturas emitidas ahora no pueden reescribirse ni volver a borrador; prueba específica incluso antes de firma.
- **Impacto:** ingresos/tasas/ejercicio equivocados o falsa apariencia de declaración aceptada.
- **Remediación:** libro separado/documentado, FX explícito, reversión append-only, bloqueo de edición de facturas emitidas y exportaciones auxiliares inequívocas. **Pendiente/gate:** vector, NCIF si procede, instructivo/modelos y cálculo final 2026/2027; DJ-08 oficial bloqueada, no «todos los modelos listos».

### NEXO-09 — Integridad interna sin sello independiente / firma no certificada

- **Media–alta residual para litigio/auditoría; CVSS N/A.**
- **Evidencia:** hashes/snapshots y cadena se guardan en la misma BD bajo control del administrador. Se corrigió también validación de campos de indexación del libro (`id`, fecha, idempotencia, reversión) para que no bastara alterar la selección del ejercicio sin cambiar el payload.
- **Reproducción:** modificar fecha indexada o payload en fixture hace fallar la cadena y bloquea append/export. Un administrador con acceso total puede recalcular hashes o truncar un prefijo; eso no es detectado por un sello externo porque no existe.
- **Remediación:** comprobación y bloqueo implementados, conservación/versionado y disclaimers; **pendiente:** sellado independiente/archivo inmutable y procedimiento probatorio e identificación/representación, si el riesgo lo exige. No se promete firma digital legalmente certificada.

### NEXO-10 — Dependencias/binarios/infra y malware no acreditados integralmente

- **Media residual; CVSS depende de un aviso/exploit concreto, no asignado a riesgo genérico.**
- **Evidencia:** `npm audit` actual 0 avisos conocidos; no antivirus o escáner Docker ejecutado. Descarga de runtimes PowerShell/Caddy en Arena quedó impedida; no se eludió la restricción ni se simula su ejecución.
- **Remediación:** lockfile/CI SHA/Dependabot, job SBOM, chequeo Caddy y hash local aprobado, ZIP sin datos/secrets convencionales y escáner básico de marcadores. **Pendiente:** Windows del usuario, retest supply-chain, digest/escaneo de imágenes, firma de distribución cuando proceda y verificación de endpoints/EDR. Marcadores/allowlist no detectan todo secreto o malware incrustado manualmente.

### NEXO-11 — Publicación, privacidad y continuidad pendientes de organización

- **Alta como gate de operación; CVSS N/A.**
- **Evidencia:** no dominio/hosting/vector aportados; solo pruebas sintéticas. No hay evidencia de declaración de base, atención de derechos, calendario aprobado, cumplimiento de términos/notificación ni recuperación del negocio del usuario.
- **Impacto:** fallos de confidencialidad, conservación, acceso o liquidación aun con controles técnicos correctos.
- **Remediación:** guías, avisos iniciales, gates y responsables definidos en plan; **pendiente de ejecución por titular/asesor/administrador**, no puede marcarlo el código como «cumple».

## 5. Plan inmediato / corto / medio, con responsables y criterio de cierre

### Inmediato: antes de datos reales o abrir Internet (0–48 h de trabajo inicial)

| Acción | Responsable | Evidencia/criterio de cierre |
|---|---|---|
| Preservar BD/históricos y clasificar demo/privado; no publicar datos reales en Arena/GitHub | Suministrador/administrador | Inventario y backup; origen demo comprobado; ningún secreto en ZIP/Git |
| Determinar residencia/réplicas y excepción solo si legalmente aplicable | Titular + asesor jurídico + proveedor | Documento de proveedor/ubicación y revisión; no solo variable CU |
| Completar responsable/aviso/derechos/calendario y gestiones de base | Titular + asesor | Aviso y procedimiento aprobados, contactos/plazos, registro de solicitudes y confidencialidad |
| Configurar hash, backup key separada, disco cifrado, SO soportado/EDR y mínimo privilegio | Administrador | Prueba de permisos/disco/recuperación de claves; no secretos por chat/URL/CLI |
| Ejecutar CI/prueba Windows con datos ficticios, confianza CA y HTTPS desde móvil/otra red | Administrador + probador | Parser real/ACL/start/status/restart/stop; backend no accesible; nombre/cadena válidos, sin bypass TLS |
| Confirmar inscripción/vector fiscal e inventario de modelos 2026 | Titular + asesor/ONAT | Documento de vector y obligación por concepto; seguir solo con auxiliares mientras falten reglas/modelos |

### Corto plazo: 1–4 semanas

- Configurar dominio/hospedaje nacional y TLS público, probar ACME/renovación/DNS/LAN/Internet y cierre del puerto interno. Escaneo externo autorizado y revisión de firewall. Responsable: administrador + proveedor.
- Mantener acceso administrativo restringido; priorizar MFA/identidad individual y roles antes de clientes/empleados remotos. No «resolver» acceso compartiendo contraseña general. Responsable: desarrollo + titular.
- Ejecutar restauración en entorno aislado, comparar último asiento/firma/num/saldo y medir recuperación. Objetivos **a aprobar y medir**, no garantizados: RPO inicial ≤24 h y RTO ≤4 h si el negocio lo acepta; ajustar frecuencia/infraestructura. Responsable: operación.
- Completar matriz ASVS y pentest independiente/retest; cuotas/monitorización de disco y carga; revisión de logs/alertas y rotación stdout; versiones para clientes/contratos/catálogo. Responsable: seguridad + desarrollo.
- Contrastar libro auxiliar con registros/soportes originales y modelo oficial aplicable sin habilitar presentación prematuramente. Responsable: asesor + titular.

### Medio plazo: 1–3 meses y continuidad

- Implantar perfil CSF actual/objetivo, inventario de riesgos/proveedores, formación, simulacro de incidente y derechos, conservación/supresión y revisión de copias antiguas.
- Sellado/almacenamiento inmutable y control de identidades si exige el valor probatorio; integración de firma digital real únicamente con canal, claves y autorización revisados.
- Evaluar contabilidad NCIF/activos/inventarios/nómina e integraciones oficiales según vector. Habilitar DJ-08/modelos solo tras reglas verificadas, casos de prueba independientes y aprobación fiscal.
- Parches/dependencias y revisión mensual; recuperación y revisión de accesos trimestrales. Certificación ISO solo por necesidad del negocio, después de evidencias operativas; no como sustituto de remediación.

**Prioridad no equivale a promesa de calendario:** depende de equipo/Windows, proveedor, dominio, conectividad, autoridades y asesoría; esos datos no fueron verificados aquí.

## 6. Balance ejecutivo: fallos, correcciones, pendientes y nivel resultante

**Corregido/verificado en el repositorio:** transporte directo TLS y validaciones previas; excepción demo ligada a procedencia; scrypt/CSRF/sesión/headers/límites; logout y PWA privada; SSE entre sesiones con revocación y resync; backup autenticado/restore exclusivo; libro fiscal y reconciliación, redondeo/idempotencia/reversiones/cadena; facturas emitidas congeladas; exportaciones auxiliares reales y bloqueo de falsa DJ-08; paquete revisable sin directorios privados. Las actividades oficiales, contrato/firma y formatos originales se conservan.

**Evidencia actual:** TypeScript y build correctos; **67 pruebas unitarias/API/seguridad/TLS/backup/fiscal/paquete/arranque**, sin fallos/omisiones; **9 E2E** de navegador en la comprobación final de entrega; npm audit sin avisos conocidos. Consultar [VERIFICACION](VERIFICACION.md) para recuento final y alcance exacto. Tree-sitter no es el parser/ejecutor Windows. Ningún resultado equivale a pentest público o certificación.

**Pendiente de forma explícita:** Windows/Caddy/CA del usuario y móviles físicos; DNS/certificado/puertos/renovación públicos; residencia/BitLocker/EDR; MFA/RBAC/identidad individual; sellado independiente; restauración operacional con RPO/RTO medidos; privacidad/derechos/conservación/gestiones formales; vector/plantillas/instructivos y otros modelos ONAT/cálculo final; NCIF si procede; pruebas externas independientes y Docker real.

**Nivel resultante defendible:** base de facturación **considerablemente endurecida y probada en laboratorio**, apropiada para evaluación controlada de un único negocio/administrador. **No se declara producción pública aprobada**, cumplimiento legal integral, certificación fiscal, independencia probatoria, ausencia de malware o invulnerabilidad. Para uso real, cerrar gates técnicos, operativos y jurídicos anteriores. «Top 1» no es una métrica verificable de seguridad y no se promete.
