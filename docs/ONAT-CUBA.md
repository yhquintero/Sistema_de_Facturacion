# Cuba · TCP/persona natural · Ingresos del ejercicio 2026

**Resultado implementado:** preparación documental y conciliación, **no** una liquidación certificada, declaración presentada ni contabilidad completa bajo NCIF. No se re-pregunta figura/año: el objetivo confirmado es **TCP y ejercicio 2026**.

## 1. Distinción temporal obligatoria

La Ley 181/2025 (Presupuesto 2026), art. 52, describe campaña de declaración/pago del 5 de enero al 30 de abril de **2026 para ingresos de 2025**. No autoriza trasladar sus casillas, escala o bonificaciones sin comprobar las reglas para ingresos 2026/presentación correspondiente. Texto oficial leído: [MFP, Gaceta 99/2025](https://www.mfp.gob.cu/ficheros/publicaciones/P-GOC%5B139-2025%5D.pdf).

No se logró verificar la plantilla/instructivo oficial aplicable a ingresos 2026/campaña 2027. El acceso a descargas ONAT falló desde el entorno y la búsqueda no acreditó una plantilla de esa campaña. **No significa que ONAT no la publique o no exista**: significa que esta integración no dispone de evidencia suficiente. No se usa un Excel histórico ni se inventan casillas/rangos. `/api/fiscal/export/dj08` devuelve **409**; la interfaz lo informa sin un botón de presentación engañoso.

## 2. Qué hay que contrastar con ONAT/asesor

- NIT e inscripción del titular, actividad autorizada/código, provincia/municipio y **vector fiscal vigente**; fecha de alta/suspensiones/bajas.
- Régimen, obligaciones concretas, cuantías/porcentajes aplicables y bonificaciones/exenciones documentadas; no se aplica un impuesto de servicios del 10% a todos por defecto.
- Criterio de registro fiscal, ingresos adicionales, operaciones en especie, anticipos/devoluciones, retenciones, pagos a cuenta, gastos admitidos y soporte, activos/inventarios/amortización y tratamiento cambiario oficial que corresponda.
- Si se exige contabilidad completa NCIF, registro oficial de ingresos/gastos, otras obligaciones laborales, seguridad social, tributos territoriales/documentos u obligaciones adicionales. El sistema no deduce aplicabilidad solo por el nombre de una actividad.
- Plantilla oficial de cada modelo, versión/campaña, instructivo, reglas de cálculo, firma/admisión y canal de presentación. No se pide ni almacena contraseña/certificado privado del portal ONAT.

La Ley 113 concordada de enero 2026, arts. 50–58, trata ingresos adicionales, deducciones, pagos anticipados, registros y sistema contable. Art. 57 remite a los registros establecidos por ONAT: **un Excel propio no se convierte por ello en el registro oficial**. Consultar [Gaceta ES1/2026](https://www.gacetaoficial.gob.cu/sites/default/files/goc-2026-es1.pdf), sus reformas posteriores y el presupuesto/instructivo aplicable.

La Res. 272/2024 figura en el [catálogo oficial](https://www.gacetaoficial.gob.cu/es/resolucion-272-de-2024-de-ministerio-de-finanzas-y-precios) sobre actualización contable. El MFP describe contabilidad NCIF por encima de 500 000 CUP y registro/documentación por debajo [3](https://www.mfp.gob.cu/noticia/887). **El texto operativo completo, el supuesto exactamente igual al umbral y su aplicación actual requieren contraste**; no se programó ese umbral como decisión automática ni una certificación de contabilidad simplificada.

## 3. Flujo de trabajo en la web

1. **Mi negocio:** datos reales del Suministrador y actividad autorizada. Los dos textos proporcionados de actividades se conservan íntegros en `shared/types.ts`; ello no acredita autorización administrativa por sí solo.
2. **Cliente → Contrato → Factura:** identificación, alcance, moneda, desglose, equipo/SO/programas/drivers, fechas y condiciones. Solo emitir tras revisión: el contenido emitido ya no se reescribe, incluso antes de firma; las rectificaciones/anulaciones deben documentarse sin reutilizar números. No reutilizar número emitido ni borrar una factura emitida: anular preservando trazabilidad. Factura firmada congela contenido/partes. La firma dibujada requiere consentimiento de conformidad y **no es certificado digital ONAT** ni prueba infalible de identidad.
3. **Fiscal · Cuba / ONAT → Perfil fiscal:** inscripción/vector/municipio y confirmación del operador, nunca una certificación del sistema.
4. **Registrar movimiento:** fecha efectiva de Cuba (no futura), ingreso cobrado/gasto/tributo/seguridad social/retención informativa, importe original, moneda, comprobante y situación documental. Pago de tributo exige código/concepto del vector.
5. **Monedas:** libro original + tipo de cambio, fuente y fecha documentados, equivalente CUP mediante Decimal y redondeo HALF_UP a dos decimales. No se mezclan USD y CUP sin conversión declarada ni se asume una tasa de mercado/aplicación extranjera. Un dato de cambio introducido no acredita su validez fiscal.
6. **Gastos:** pendientes/deducibles según operador/no deducibles. Marcar deducible exige soporte y fundamento; no calcula por sí solo deducción legal, límite o cuota.
7. **Conciliar:** cobros vinculados a factura emitida/no anulada y misma moneda; no se permite superar su total. Estado comercial `pagada` **no inventa un cobro, fecha o comprobante**. Se incluyen facturas de años anteriores cobradas en el ejercicio y anuladas con movimientos para revisión. Una factura con movimientos vinculados no se puede reescribir.
8. **Corregir:** asiento compensatorio, motivo, fecha no anterior/futura y mismo ejercicio. No se edita ni elimina un asiento. Cambios entre ejercicios, devoluciones y rectificaciones requieren criterio del asesor; el sistema no genera automáticamente notas fiscales oficiales.
9. Revisa mes a mes, soportes pendientes y diferencias; exporta **auxiliares** al asesor por canal protegido. Los archivos descargados no están cifrados automáticamente. No los presentes como declaraciones oficiales.

Cada alta/reversión usa clave de idempotencia para no duplicar un envío al reintentar. La cadena SHA-256 verifica payload y campos de indexación. Una discrepancia bloquea nuevas altas/exportación. **Un administrador de la BD puede recalcular o truncar una cadena**: sin sello externo no es prueba independiente de inalterabilidad.

## 4. Informes disponibles y pendientes

| Necesidad | Entrega actual | Límite/gate |
|---|---|---|
| Facturas bajo contrato y conformidad | PDF/DOCX/XLSX auténticos, 10 tamaños × 2 orientaciones, snapshots y huella de firma | Revisión del expediente/numeración/validez fiscal por el titular/asesor; no aceptación ONAT garantizada |
| Registro de ingresos/gastos | Libro de movimientos con fecha, moneda, CUP, comprobante, soporte y reversiones | Auxiliar, no plantilla oficial de registro ni NCIF completa |
| Control de tributos/pagos a cuenta | Movimientos `tax_payment`, código de vector y resumen mensual | No liquida obligación ni decide código/plazo; separar conceptos con asesor |
| Seguridad social | Movimientos y resumen | No decide base, tipo, exención ni sustituye planilla oficial |
| Retenciones soportadas | Registro informativo separado | No automatiza declaración como agente de retención ni deducciones |
| DJ-08 por ingresos 2026 | Hoja de preparación **NO OFICIAL**, desglose y advertencias | Modelo final, cálculo y presentación bloqueados hasta validar plantilla/instructivo/campaña/vector |
| Otras declaraciones ONAT | Evidencias reutilizables de cobros/gastos/tributos | Inventario de modelos obligatorios pendiente del vector; no se afirma «todos los modelos» |
| Contabilidad NCIF, activos, inventarios, nómina | No implementados como sistema contable integral | Evaluar necesidad/uso de aplicación contable autorizada; integración posterior con especificación verificada |
| Presentación electrónica | No implementada | Canal/admisión/certificado digital y autorización explícita; jamás compartir clave privada/contraseña del portal |

### Archivos auxiliares

- `/api/fiscal/export/xlsx?year=2026`: cinco hojas (mensual CUP, movimientos, conciliación, preparación DJ-08 no oficial, controles/procedencia). No macros/formulas construidas con textos del usuario.
- `/api/fiscal/export/csv?year=2026`: UTF-8 BOM, separador `;`, defensa ante fórmulas de hoja de cálculo.
- `/api/fiscal/export/zip?year=2026`: XLSX + CSV + JSON + advertencias + manifiesto SHA-256. No firmado por ONAT ni cifrado por contraseña.
- Todos los archivos incluyen: **BORRADOR AUXILIAR. No es un modelo oficial ONAT ni una declaración presentada.** Demo permanece identificada.

## 5. Criterio para habilitar un modelo oficial en una futura entrega

Registrar URL/archivo oficial y SHA-256, versión/campaña, instructivo y normativa vigente; verificar vector/reglas/tasas/exenciones/tipo de cambio con asesor/ONAT; mapear campos con evidencia; contrastar casos de prueba independientes (sin ingresos, gastos documentados/limitados, pagos a cuenta, retenciones, pérdidas/arrastres cuando apliquen, otros ingresos, altas/bajas, cambios de moneda/ejercicio, bonificaciones y redondeo); verificar archivo aceptado sin macros añadidas; aprobación del contribuyente y evidencia de presentación por canal autorizado. **No se habilita una declaración por quitar una advertencia de la interfaz.**
