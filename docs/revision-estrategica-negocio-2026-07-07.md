# Revisión estratégica de negocio — YTubViral
**Fecha:** 7 de julio de 2026 · **Autor:** Claude (a petición de Javier) · **Fuentes:** BD de producción (hoy), memoria del proyecto, reportes de agentes, historial de decisiones

---

## 1. Resumen ejecutivo

YTubViral tiene un **producto sobredimensionado respecto a su distribución**. Después de ~3 meses de construcción intensiva hay 14+ herramientas, extensión Chrome, sistema multi-agente, blog automático, estudio de datos propio y un stack técnico impecable — y **cero clientes de pago externos**. El único Business activo es el propio Javier. El problema no es producto, ni precio, ni activación (ya arreglada: 56-63%). Es que **casi nadie llega a la puerta**: ~17 visitas externas reales al mes.

La tesis de esta revisión: **congelar construcción de producto, concentrar el 100% del esfuerzo disponible en los 2-3 canales de distribución donde hay señal real, y aceptar que los canales automatizados (personas sociales, outreach masivo, SEO a corto) no van a traer los primeros 100 usuarios.** Los traerá la cara de Javier, el boca-oreja de prescriptores y la Chrome Web Store.

Señales positivas que conviene no perder de vista:
- Activación arreglada y validada (0% → 56-63% tras quitar "Saltar por ahora").
- **Primer usuario en trial de Pro hoy mismo** (el trial se lanzó ayer — verificar quién es).
- Primer lead cálido real del outreach (Active Krishna, 20K subs, pidió llamada).
- Negociación de afiliación abierta con Erika Goncalves (124K subs, ICP exacto).
- Data study propio (N=1.814) — activo enlazable único que nadie puede copiar.

---

## 2. Los números reales (BD de producción, hoy 07/07)

| Métrica | Valor | Lectura |
|---|---|---|
| Usuarios totales | 26 | Incluye ~6-8 cuentas de Javier/QA/bots identificados |
| Verificados | 20 | — |
| Registros últimos 30d | 14 | ~0,5/día |
| Registros últimos 7d | 5 | Ligera mejora |
| Suscripciones activas | 1 Business (Javier) + **1 Pro en TRIAL** | El trial de ayer ya tiene primer uso |
| Canceladas | 1 Business | — |
| Generaciones totales | 120 | 36 en los últimos 30d |
| Usuarios que han generado | 15 de 26 (58%) | La activación funciona |
| Canales YouTube conectados | 3 | El OAuth es fricción alta |
| **Waitlist Product Hunt** | **0 emails** | Bloqueante del lanzamiento PH |
| Tráfico externo real | ~17 visitas/mes | **EL cuello de botella** |
| Páginas indexadas Google | 12 de 111+ (plano desde el 11/06) | Cuello = autoridad, no técnica |
| MRR externo | **0 €** | La métrica que importa |

**La cadena del funnel hoy:** ~17 visitas externas/mes → ~5 registros/semana (mayoría origen desconocido o dudoso) → 56-63% genera → 1 trial → 0 pagos externos. **Cada eslabón desde "registro" hacia abajo funciona razonablemente. El eslabón roto es el primero.**

---

## 3. Diagnóstico central

### 3.1 Lo que ya está demostrado (no re-litigar)
1. **On-page SEO agotado.** 12 indexadas planas durante 4 semanas con 111 URLs. Más páginas ≠ más indexación. Única palanca: backlinks editoriales + tiempo (meses).
2. **El outreach masivo/automatizado no funciona.** 141+ emails automatizados → 0. Lote fundador con asunto pitchy → 0/10. La ÚNICA respuesta positiva (Active Krishna) vino de outreach personalizado value-first.
3. **Las personas sociales generan engagement, no clientes.** 95 likes/26 replies en Bluesky en 7 días → 2-4 clics al sitio AL MES. Menciones al 3,8% vs objetivo 25%.
4. **La activación estaba rota y se arregló.** El fix del onboarding (01/07) subió la cohorte de 22% a 56-63%. El funnel medio ya no es el problema.
5. **Los directorios no mueven la aguja** (AlternativeTo, SaaSHub publicados; links de baja calidad).
6. **Product Hunt sin base = disparo quemado.** Decisión correcta de esperar. Pero la waitlist sigue en 0 — sin plan activo de llenado, "esperar" se convierte en "nunca".

### 3.2 El desequilibrio estructural
El proyecto invierte, a ojo, un 70% del esfuerzo total (humano + agentes) en **fabricar** (features, herramientas, contenido, infraestructura) y un 30% en **distribuir** — y dentro de ese 30%, la mayoría en canales automatizados ya demostrados como estériles. En la fase 0→100 usuarios de un SaaS bootstrapped sin audiencia, la proporción sana es la inversa.

### 3.3 La paradoja de la autenticidad
Hay una tensión estratégica sin resolver que conviene nombrar: la marca se está construyendo sobre **autenticidad radical** (regla de cero datos inventados, landing sin social proof falso, estudio con datos reales, narrativa "técnico industrial construyendo en público")... mientras el motor social son **4 personas ficticias** con historias inventadas. Hoy el riesgo es bajo (poca visibilidad), pero es una mina enterrada en el camino: si el proyecto crece y alguien lo destapa (y en la era de la IA, se destapa), el daño a una marca cuyo diferenciador ES la honestidad sería desproporcionado. No exijo decisión hoy, pero el documento quedaría cojo sin señalarlo: **cuanto más éxito tenga la estrategia de "Javier auténtico", más pasivo tóxico se vuelven las personas.**

---

## 4. Revisión por ángulos

### 4.1 Producto
**Estado:** Fases 1-7 completas (14 tools), extensión v2.5.0 codificada (pendiente prueba y subida a CWS), thumbnail editor con IA, trial Pro implementado ayer.

**Veredicto: STOP de construcción.** El roadmap Fase 8 (10 features más para "superar a todos los competidores") debe permanecer congelado — la propia memoria del roadmap ya lo dice ("NO implementar hasta tener usuarios reales"). Cada hora de feature nueva es una hora robada a distribución, y añade superficie de mantenimiento.

**Excepciones (únicas construcciones justificadas):**
- Terminar lo empezado con retorno inmediato: probar y publicar extensión v2.5.0 (es canal de adquisición, no feature).
- Micro-mejoras que pida un usuario de pago real con nombre y apellido.
- Infra de afiliación SI Erika (u otro prescriptor) firma — cupón Stripe + tracking ref ya existe a medias.

**Deuda de coherencia menor:** "14 herramientas" hardcodeado sigue en legal/terms/launch (decisión pendiente); Free dice 10 gen/mes en web vs 3/día en otro doc — unificar mensaje.

### 4.2 Pricing y monetización
**Estado:** Free / Pro 9,99€ / Business 29,99€. Trial Pro 7 días con tarjeta, live desde ayer y con primer uso ya. Cupón LAUNCH50 preparado. Garantía 30 días anunciada pero NO respaldada en Terms (pendiente D2 — riesgo legal menor pero real).

**Veredicto: el pricing NO es el problema y no hay que tocarlo.** Con 17 visitas/mes, cualquier experimento de precio es ruido estadístico. Decisiones ya tomadas correctamente: no competir en precio contra OutlierKit ($3) ni TubeBuddy ($1 promo); no segmentar; no pay-per-use. Mantener.

**Cambios específicos:**
1. Verificación real del trial (registro limpio + tarjeta + cancelación) — pendiente de la spec de ayer, ahora urgente porque YA hay un trial real en curso.
2. Activar "Trial ending reminder" en Stripe Dashboard (1 clic, evita churn por sorpresa de cobro y disputas).
3. Respaldar la garantía de 30 días en los Terms o quitarla de la web — incoherencia legal abierta desde junio.
4. Cuando haya 5+ pagos: empujar anual (99,99€) en el momento de conversión, no antes.

### 4.3 Adquisición — canal por canal

**a) SEO orgánico.** Modo mantenimiento. Blog automático sigue (coste ~0), no construir más tools/páginas, gsc-index puntual. La única jugada activa que queda es el **data study como imán de backlinks**: los 3 pitches enviados el 27/06 necesitan follow-up (ya han pasado 10 días) y quedan 4 pendientes por formulario (tarea Javier, 30 min). Horizonte de retorno: 3-6 meses. No esperar nada antes.

**b) Canal de YouTube propio de Javier. LA APUESTA CENTRAL.** El vídeo 1 lleva listo desde el 01/07 (guion, metadatos, miniatura, checklist) y sin grabar. Este canal es el único activo que: (1) llega al ICP exacto donde vive, (2) compone con el tiempo, (3) es coherente al 100% con la narrativa de marca, (4) alimenta la waitlist de PH, (5) genera los backlinks/menciones que el SEO necesita, y (6) demuestra el producto usándolo en público. **Grabar el vídeo 1 esta semana es la acción individual de más impacto de todo este documento.** Cadencia objetivo: 1 vídeo/semana, 10 semanas seguidas antes de evaluar.

**c) Chrome Web Store.** Infravalorada como canal: es el único "marketplace" con tráfico orgánico propio donde estar listado es gratis. 5 installs actuales porque el listing compite sin reviews. v2.5.0 (con soporte Shorts — hueco real de VidIQ) está codificada esperando 20 minutos de prueba manual de Javier + subida. El prompt de reseña in-extension (lever ASO nº1) ya está implementado. **Publicar esta semana.**

**d) Outreach.** Cambiar de "campaña" a "hábito": 5 contactos/semana, manuales, value-first, con el playbook que generó la única respuesta real (analizar SU canal, dar valor concreto, cero mención a VidIQ/precio en el asunto). Cerrar el loop con Active Krishna (borrador listo desde el 03/07 — **lleva 4 días esperando**, un lead cálido se enfría por días, no por semanas).

**e) Afiliación / prescriptores.** La propuesta a Erika (30% recurrente 12m) se envió el 01/07 — a 7-8/07 toca el follow-up suave único acordado y luego dar por frío. Independientemente de Erika: **el modelo prescriptor-con-afiliación merece convertirse en programa**, no en negociación única. Los "YouTube coaches" ES con 10-100K subs viven de recomendar herramientas; 30% recurrente es mejor oferta que la de VidIQ. Preparar una página /affiliates simple y ofrecérsela a cada creador del outreach que responda.

**f) Personas sociales (Bluesky).** ROI en clientes ≈ 0 (2-4 clics/mes). Valor real restante: que los perfiles parezcan vivos si alguien los mira. Recomendación: **degradar a mantenimiento mínimo** (bajar volumen, no invertir más en optimizar menciones/targeting — cada ciclo de mejora del Social Optimizer consume atención y API por un canal que no convierte) y NO ampliar menciones de producto desde cuentas ficticias (agrava el riesgo 3.3). La cuenta brand + X Coach manual de Javier sí se mantienen: son auténticas.

**g) Product Hunt.** Sigue siendo amplificador, no encendedor. Trigger inalterado: 100+ emails en waitlist + 3-5 testimonios reales. El plan de llenado ahora tiene motor: cada vídeo del canal y cada herramienta gratis empujan a waitlist. Sin canal propio activo, la waitlist no se llena sola — razón adicional para (b).

**h) Instagram/marketing automatizado.** Roto 9 días por el token (arreglado hoy). Mantener porque el coste marginal es ~0, pero es branding pasivo, no adquisición. No invertir más.

### 4.4 Activación, retención y feedback
- Onboarding validado (56-63%). Vigilar el segundo leak: usuarios en step 0 (bounce inmediato) — pero con este volumen, no optimizar más; volver cuando haya 50+ registros/mes.
- **Hueco real: no hay loop de feedback sistemático.** Los 2 emails de feedback del 03/07 fueron manuales. Con tan pocos usuarios, cada uno que genera 3+ veces merece un email personal de Javier. Automatizar el trigger (aviso al detectar usuario activo), mantener humano el mensaje.
- Retención aún no medible (no hay masa). No construir features de retención todavía.
- Los 3 usuarios con canal conectado son oro: son los únicos que ven el valor completo. Contactarlos uno a uno.

### 4.5 Competencia
- **TubeBuddy $1/mes**: promo de entrada, no plan permanente. Respuesta ya dada (trial 7d). Suficiente. No perseguir.
- **OutlierKit desde $3**: ataca por precio en un segmento distinto (research puro). La respuesta correcta sigue siendo posicionamiento de pipeline completo, no guerra de precios.
- **VidIQ/los grandes**: irrelevantes a esta escala — no compiten por nuestros primeros 100 usuarios; los perdemos contra "no usar nada", no contra VidIQ.
- Conclusión: **la competencia real ahora mismo es la indiferencia.** Scout semanal es suficiente vigilancia; no reaccionar a cada movimiento.

### 4.6 Riesgos
| Riesgo | Gravedad | Mitigación |
|---|---|---|
| Personas ficticias vs marca de autenticidad (3.3) | Alta a futuro | Decisión de Javier: sunset gradual o contención estricta (sin menciones de producto). Documentar plan de salida |
| Fragilidad operativa de tokens/sesiones (IG 9 días caído sin escalar) | Media | El Manager debe escalar como CRÍTICO cualquier fallo repetido 3+ días del mismo componente. Cron de auto-refresh del token IG (pendiente App Secret) |
| Coste API del Free si llega tráfico | Media | Ya analizado (H1): free generoso en datos, tacaño en IA. Vigilar cuando pase de 50 usuarios/mes |
| Dependencia total de un solo fundador con empleo | Estructural | Es la realidad; la mitigación es el foco: pocas apuestas, no muchas |
| Garantía 30d sin respaldo legal en Terms | Baja | Redactar cláusula (1h) |
| Bus factor de la infra local (PM2, local-agent en un PC de casa) | Baja hoy | Aceptable a esta escala; revisar al llegar a 100 usuarios |

### 4.7 Operaciones y sistema de agentes
El sistema multi-agente es sólido pero optimiza canales muertos. Cambios:
1. **Social Optimizer**: dejar de perseguir el objetivo de 25% de menciones (ya no aplica si las personas pasan a mantenimiento). Reconfigurar o silenciar sus alertas de mención.
2. **Manager**: añadir regla de escalado por persistencia (mismo error 3+ días = URGENTE, no "REVISAR") — el caso Instagram lo demuestra.
3. **SEO Optimizer**: su auto-fix está deshabilitado por fallos repetidos; sus 2 issues perennes (indexación) no son accionables por un agente. Bajar frecuencia o silenciar hasta fase de backlinks.
4. Presupuesto API de agentes: sano (1-2%/día). Sin cambios.

---

## 5. Plan de acción priorizado

### Esta semana (7-13 julio)
| # | Acción | Dueño | Por qué ahora |
|---|---|---|---|
| 1 | **Grabar y publicar vídeo 1** (pack listo en docs/) | Javier | La palanca #1; todo lo demás se apoya en ella |
| 2 | **Responder a Active Krishna** (borrador listo) | Javier (enviar) | Lead cálido enfriándose desde el 01/07 |
| 3 | **Probar extensión v2.5.0 y subir a CWS** (20 min + subida) | Javier | Canal de adquisición gratuito parado por un paso manual |
| 4 | Follow-up único a Erika; si no responde, cerrar y pasar al programa de afiliados genérico | Claude redacta, Javier aprueba | Acordado el 01/07 |
| 5 | Verificar trial real en curso (quién es, estado en Stripe) + activar Trial Ending Reminder | Claude + Javier | Ya hay dinero potencial en juego |
| 6 | Follow-up de los 3 pitches del data study + los 4 formularios pendientes | Claude + Javier |10 días sin respuesta = momento estándar de follow-up |

### Próximos 30 días
- Cadencia: 1 vídeo/semana + 5 outreach manuales/semana (playbook value-first).
- Email personal de Javier a cada usuario que genere 3+ veces (Claude avisa, Javier envía).
- Página /affiliates sencilla (30% recurrente 12m) y ofrecerla a todo creador que responda.
- Personas Bluesky a modo mantenimiento; decidir su futuro (4.6, riesgo 1).
- Terms: cláusula de garantía 30 días.
- Cerrar cabos técnicos: App Secret Meta correcto + cron auto-refresh token IG; regla de escalado del Manager.
- **Meta 30d:** vídeo×4, waitlist >25, 10+ installs extensión, 20 outreach enviados, 1er pago externo (trial→pago).

### 60-90 días
- Si waitlist ≥100 + 3-5 testimonios reales → **lanzar Product Hunt** (todo el material está listo).
- Revisar SEO (¿backlinks del estudio/roundups movieron la indexación?).
- Evaluar canal YouTube con 10 vídeos: qué formato funcionó, doblar ahí.
- **Meta 90d:** 5 clientes de pago externos, 100+ usuarios registrados reales, 1 prescriptor con afiliación activa.

### Lo que explícitamente NO hacer
- ❌ Fase 8 / features nuevas / más herramientas gratis / más páginas SEO.
- ❌ Tocar precios, crear tiers, descuentos fuera de LAUNCH50.
- ❌ Más inversión en optimizar personas sociales (targeting, menciones, nuevos canales).
- ❌ Lanzar PH sin waitlist.
- ❌ Outreach masivo/automatizado de nuevo.
- ❌ Reaccionar a movimientos de precios de competidores.

---

## 6. KPIs a vigilar (y cuáles ignorar)

**Los que importan (revisar semanal):**
1. MRR externo (hoy: 0€)
2. Registros externos verificados/semana con origen conocido
3. Emails en waitlist
4. Vídeos publicados en el canal (input controlable #1)
5. Outreach enviados + tasa de respuesta (input controlable #2)
6. Installs y reviews de la extensión

**Los que hay que ignorar (ruido a esta escala):**
- Likes/replies de Bluesky, impresiones GSC, pageviews totales, posición de keywords, número de páginas indexadas semana a semana, número de features vs competidores.

---

## 7. Nota final

El proyecto ha superado con nota la fase que dependía de las manos: el producto existe, funciona, y es objetivamente competitivo en features y precio. La fase actual no se gana con más código — se gana con repetición aburrida de 3 cosas: **publicar vídeos, hablar con creadores uno a uno, y cerrar prescriptores.** El sistema de agentes ya libera el tiempo operativo; la pregunta de los próximos 90 días es si ese tiempo liberado se invierte en la cámara y el correo, o en la tentación de construir la feature 15.
