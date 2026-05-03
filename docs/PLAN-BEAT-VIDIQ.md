# Plan de Batalla: YTubViral vs VidIQ

> Objetivo: No igualar a VidIQ — superarlo. Cada feature debe ser más inteligente, más rápida o más útil que la de VidIQ.

---

## Análisis de VidIQ: Fortalezas y Debilidades

### Lo que VidIQ hace bien
- Scorecard overlay en vídeos YouTube con gráficas de views (24h/7d/28d/All)
- Channel Stats sidebar con progreso hacia monetización
- AI Chat con 4 modos (Create/Analyze/Optimize/Research) + 3 tiers de AI
- Display Options configurable (qué métricas ver)
- Channel Audit con Health Score 0-100 + Quick Wins accionables
- Optimize video con tabs (Título/SEO/Revisión/Vista previa) que GUARDA directo en YouTube
- Logros/Achievements con certificados compartibles
- "Lo más visto" (trending explorer con filtros avanzados)

### Debilidades de VidIQ (donde ganar)
1. **UI anticuada** — Diseño funcional pero genérico, sin personalidad. Nuestra UI dark + roja ya es más premium.
2. **AI genérica** — Su AI no conoce TU canal profundamente. Da consejos genéricos. Nosotros tenemos datos reales del canal en el prompt.
3. **Pricing abusivo** — $16.58/mes Boost, $49.92/mes Pro, $415/mes Max. Nosotros: 9.99€/mes TODO incluido.
4. **Sin calendario integrado** — No tiene content calendar. Nosotros sí.
5. **Sin predicción real** — No predicen rendimiento de vídeos. Nosotros sí (Predictor).
6. **Achievements vacíos** — Solo gamification superficial, no ayudan a mejorar.
7. **Extensión pesada** — Muchos elementos en pantalla, UI saturada.
8. **"Lo más visto" básico** — Solo lista trending, no conecta con tu canal ni sugiere acción.

---

## FASE 1: Paridad Crítica (lo que nos falta y es indispensable)

### E1. Scorecard Overlay en Vídeos YouTube (Extensión)
**VidIQ tiene:** Overlay en cada vídeo con views/hour, engagement rate, SEO score, tags, likes ratio.
**Nosotros tenemos:** Panel lateral con "Analizar canal" + "Generar títulos".
**Plan para superarlo:**
- Scorecard compacto (no panel lateral) que aparece SOBRE el vídeo, estilo pill flotante
- Métricas: Views/Hour, Engagement %, SEO Score (ya tenemos el endpoint), edad del vídeo
- Click expande a panel completo con: tags del vídeo, competidores del nicho, sugerencias AI
- **Ventaja:** Nuestro SEO Score ya es más detallado (15 puntos vs ~5 de VidIQ)
- **Prioridad:** ALTA
- **Esfuerzo:** 2-3 sesiones

### E2. Channel Stats en Sidebar YouTube (Extensión)
**VidIQ tiene:** Panel con subs actuales, views recientes, progreso monetización, sparklines 48h/7d.
**Plan para superarlo:**
- Widget compacto en sidebar de YouTube Studio
- Métricas reales via YouTube Analytics API (ya tenemos): watch time, subs, views
- Sparkline de growth (ya tenemos ChannelSnapshot data)
- Progreso hacia monetización (1000 subs + 4000h watch time) con ETA estimado
- **Ventaja:** ETA estimado basado en velocidad real de crecimiento (VidIQ no lo hace)
- **Prioridad:** ALTA
- **Esfuerzo:** 1-2 sesiones

### E3. Tags de Vídeos (Web + Extensión)
**VidIQ tiene:** Muestra tags de cualquier vídeo + sugiere tags.
**Plan para superarlo:**
- Mostrar tags de vídeos competidores (Data API los expone)
- AI sugiere tags basados en: vídeo actual + tags de top 10 vídeos del nicho
- Score por tag: volumen de búsqueda estimado + competencia
- **Prioridad:** ALTA
- **Esfuerzo:** 1 sesión

### W1. Optimize Video con Guardado Directo en YouTube (Web)
**VidIQ tiene:** Editar título/descripción/tags con score en tiempo real + guardar directo vía API.
**Nosotros tenemos:** SEO Score (read-only) + generador de títulos/descripciones (copy manual).
**Plan para superarlo:**
- Página /optimize: seleccionar vídeo → ver título/desc/tags actuales con score
- Editar inline con score que se actualiza en tiempo real
- AI suggestions para cada campo (ya tenemos la lógica)
- Botón "Guardar en YouTube" → YouTube Data API `videos.update()`
- Historial de cambios (qué cambiaste y cómo afectó el rendimiento)
- **Ventaja:** Historial de cambios + impacto. VidIQ no trackea si el cambio mejoró algo.
- **Prioridad:** CRÍTICA — es la feature más usada de VidIQ
- **Esfuerzo:** 2-3 sesiones

---

## FASE 2: Superar a VidIQ (features donde ser claramente mejores)

### W2. Channel Audit Inteligente (Web)
**VidIQ tiene:** Health Score + Quick Wins genéricas + "content to repeat".
**Plan para superarlo:**
- Health Score basado en datos REALES (no estimados): upload frequency, engagement trend, SEO avg, retention avg
- Quick Wins ACCIONABLES: cada una es un botón que te lleva a la acción (ej: "Tu último vídeo tiene SEO 45 → Optimizar" → abre /optimize)
- "Contenido que funciona": análisis de patrones en tus TOP vídeos (duración, formato, hora, tema)
- "Contenido que NO funciona": vídeos con peor rendimiento y POR QUÉ (AI analysis)
- Comparación mes a mes con gráficas
- **Ventaja:** Quick Wins accionables (no solo texto). VidIQ dice "mejora tu SEO" pero no te lleva a hacerlo.
- **Prioridad:** ALTA
- **Esfuerzo:** 2 sesiones

### W3. Trending Explorer Conectado (Web)
**VidIQ tiene:** "Lo más visto" con filtros (subs, tipo, VPH, views, categoría, país).
**Nosotros tenemos:** /trends con alertas diarias de trending.
**Plan para superarlo:**
- Mantener alertas diarias PERO añadir explorador interactivo
- Filtros: país, categoría, rango de subs del canal, VPH mínimo, período
- **Killer feature:** "Relevancia para TI" — cada trending topic tiene un score de qué tan viable es para tu canal basado en tu nicho, audiencia y contenido previo
- Botón "Crear vídeo sobre esto" → abre /generate pre-rellenado con el tema trending
- **Ventaja:** Conexión directa trending → creación. VidIQ muestra trending pero no conecta con tu canal.
- **Prioridad:** MEDIA-ALTA
- **Esfuerzo:** 2 sesiones

### W4. AI Coach Superior (Web)
**VidIQ tiene:** AI Chat con 4 modos + "Thought process" expandible + 3 tiers de AI.
**Nosotros tenemos:** AI Coach con datos reales del canal.
**Plan para superarlo:**
- Mantener ventaja de datos reales del canal en cada respuesta
- Añadir modos especializados como VidIQ: Crear / Analizar / Optimizar / Investigar
- Cada modo precarga contexto diferente (ej: "Analizar" carga últimos 10 vídeos, "Investigar" carga competitors)
- Suggested prompts contextuales por modo (como VidIQ pero con datos TU canal)
- "Thought process" expandible (mostrar qué datos usó el AI para responder)
- **NO hacer tiers de AI** — todos tienen el mejor modelo. Esto es ventaja competitiva vs VidIQ que cobra $415/mes por "MAX AI".
- **Ventaja:** Mismo nivel de AI para todos. VidIQ gatekeepa la mejor AI detrás de $415/mes.
- **Prioridad:** MEDIA
- **Esfuerzo:** 1-2 sesiones

### W5. Achievements que Importan (Web)
**VidIQ tiene:** Logros genéricos (100 subs, 1000 views, etc.) + certificados compartibles.
**Plan para superarlo:**
- Logros basados en MEJORA real: "Mejoraste tu SEO promedio un 20%", "3 vídeos seguidos con engagement >5%"
- Streaks: "5 semanas subiendo contenido sin fallar"
- Logros de aprendizaje: "Usaste todas las herramientas", "Optimizaste 10 vídeos"
- Certificados compartibles en redes sociales (imagen generada con stats reales)
- Monthly report: resumen del mes con logros desbloqueados
- **Ventaja:** Logros sobre MEJORA, no vanity metrics. VidIQ celebra "1000 views" sin contexto.
- **Prioridad:** BAJA (nice to have, no crítico)
- **Esfuerzo:** 2 sesiones

---

## FASE 3: Innovación (features que VidIQ NO tiene)

### I1. Thumbnail A/B Testing con Preview Real (Web + Extensión)
**VidIQ NO tiene esto.** Solo tiene "Thumbnail Preview" estático.
**Nosotros tenemos:** A/B test de títulos.
**Plan:**
- Extender A/B test a thumbnails (no solo títulos)
- Preview: cómo se ve tu thumbnail al lado de competidores reales en resultados de búsqueda
- CTR estimado basado en: contraste, texto legible, rostros detectados, colores dominantes
- **Prioridad:** MEDIA
- **Esfuerzo:** 2-3 sesiones

### I2. Content Calendar con AI Scheduling (Web)
**VidIQ NO tiene calendario.**
**Nosotros tenemos:** /calendar con CRUD básico.
**Plan para hacerlo killer:**
- AI sugiere cuándo publicar cada vídeo basado en Best Time data + trending topics + competidores
- Drag & drop para reorganizar
- Vista semanal + mensual
- Integración con YouTube: publicar/programar directamente desde el calendario
- Recordatorios por email
- **Prioridad:** MEDIA
- **Esfuerzo:** 2 sesiones

### I3. Competitor Intelligence Avanzado (Web)
**VidIQ tiene:** Comparación básica de canales + filtro por VPH.
**Nosotros tenemos:** /competitors con tracking básico.
**Plan para superarlo:**
- Alert cuando un competidor sube vídeo viral (>2x su promedio de views)
- Análisis de qué temas les funcionan vs cuáles no
- "Oportunidades perdidas": temas que tus competidores cubren y tú no
- "Ventanas de oportunidad": temas donde tú tienes mejor engagement que ellos
- Timeline comparativo: tu growth vs competidores en el mismo período
- **Prioridad:** MEDIA-ALTA
- **Esfuerzo:** 2-3 sesiones

### I4. Retention Optimizer con Timestamps (Web)
**VidIQ NO tiene esto.**
**Nosotros tenemos:** /retention con curvas básicas.
**Plan:**
- Overlay de retention curve sobre el timeline del vídeo
- AI identifica timestamps exactos de drop-off y sugiere por qué (intro larga, sección aburrida, etc.)
- "Hook Score": puntuación de los primeros 30 segundos
- Comparación de retention curves entre tus vídeos
- Templates de estructura basados en tus mejores retenciones
- **Prioridad:** ALTA (data única que VidIQ no ofrece)
- **Esfuerzo:** 1-2 sesiones

### I5. Revenue Estimator (Web)
**VidIQ NO tiene esto** (solo progreso hacia monetización).
**Plan:**
- Estimación de ingresos por vídeo basada en: views, duración, nicho CPM, país de audiencia
- Proyección de ingresos mensuales basada en trending de views
- "Cuánto dejas de ganar": estimación si optimizaras SEO/thumbnails/títulos
- **Prioridad:** BAJA
- **Esfuerzo:** 1 sesión

---

## FASE 4: Extensión Chrome — Roadmap Específico

### Estado actual extensión (v1.2.0)
- Panel lateral en vídeos: "Analizar canal" + "Generar títulos"
- Panel en búsqueda: competition + keywords
- Botón en canales: "Analizar este canal"
- detect.js para ytubviral.com

### Roadmap extensión

**v1.3.0 — Scorecard + Tags**
- [ ] Scorecard overlay en vídeos (E1)
- [ ] Tags visibles de cualquier vídeo (E3)
- [ ] SEO Score inline (ya tenemos endpoint, solo UI)

**v1.4.0 — Channel Stats + Studio**
- [ ] Channel Stats widget en sidebar (E2)
- [ ] YouTube Studio integration: SEO score en cada vídeo del dashboard
- [ ] Botón "Optimize" en Studio que abre ytubviral.com/optimize?v=VIDEO_ID

**v1.5.0 — AI Inline**
- [ ] AI suggestions inline al editar título/descripción en YouTube Studio
- [ ] Keyboard shortcut (Ctrl+Shift+Y) para abrir AI panel
- [ ] Quick actions: "Improve this title", "Generate tags", "Check SEO"

**v1.6.0 — Polish**
- [ ] Display Options configurable (qué métricas mostrar)
- [ ] Tema claro/oscuro según YouTube
- [ ] Performance: lazy load panels, cache agresivo

---

## Priorización Final (orden de implementación)

| # | Feature | Tipo | Impacto | Esfuerzo | Fase |
|---|---------|------|---------|----------|------|
| 1 | W1. Optimize con guardado YouTube | Web | CRÍTICO | 2-3 ses | F1 |
| 2 | E1. Scorecard overlay | Ext | ALTO | 2-3 ses | F1 |
| 3 | E3. Tags de vídeos | Web+Ext | ALTO | 1 ses | F1 |
| 4 | W2. Channel Audit | Web | ALTO | 2 ses | F2 |
| 5 | I4. Retention Optimizer v2 | Web | ALTO | 1-2 ses | F3 |
| 6 | I3. Competitor Intelligence v2 | Web | MEDIO-ALTO | 2-3 ses | F3 |
| 7 | W3. Trending Explorer | Web | MEDIO-ALTO | 2 ses | F2 |
| 8 | E2. Channel Stats sidebar | Ext | ALTO | 1-2 ses | F1 |
| 9 | W4. AI Coach modos | Web | MEDIO | 1-2 ses | F2 |
| 10 | I2. Calendar AI scheduling | Web | MEDIO | 2 ses | F3 |
| 11 | I1. Thumbnail A/B test | Web+Ext | MEDIO | 2-3 ses | F3 |
| 12 | W5. Achievements | Web | BAJO | 2 ses | F2 |
| 13 | I5. Revenue Estimator | Web | BAJO | 1 ses | F3 |

---

## Ventajas Competitivas Clave (nuestro pitch)

1. **Precio imbatible**: 9.99€/mes vs $16-$415/mes de VidIQ. TODO incluido.
2. **AI sin restricciones**: Todos los usuarios Pro tienen acceso al mejor modelo AI. VidIQ cobra $415/mes por "MAX AI".
3. **Datos reales**: Nuestro AI Coach usa datos REALES de tu canal (videos, retention, analytics). VidIQ da consejos genéricos.
4. **Acciones, no solo datos**: Cada insight tiene un botón de acción. VidIQ muestra datos y te deja solo.
5. **Content Calendar**: VidIQ no tiene. Nosotros sí, con AI scheduling.
6. **Predictor**: VidIQ no predice rendimiento. Nosotros sí.
7. **Retention Analysis**: VidIQ no analiza retention curves. Nosotros sí.
8. **Bilingüe nativo**: ES + EN desde el día 1. VidIQ es solo EN (traducción parcial).

---

## Siguiente Paso Inmediato

Empezar por **W1: Optimize Video con Guardado en YouTube** — es la feature más usada de VidIQ y la que más valor da al usuario. Requiere:
1. YouTube Data API `videos.update()` (ya tenemos OAuth tokens)
2. UI de edición inline con score en tiempo real
3. Historial de cambios con tracking de impacto
