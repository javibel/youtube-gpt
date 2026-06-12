# Auditoría de uso de YouTube Data API — 2026-06-12 (Tarea D3)

Auditoría completa del uso de YouTube API Services en YTubViral, contrastada contra las
[YouTube API Services Developer Policies](https://developers.google.com/youtube/terms/developer-policies)
(verificadas en la fuente el 2026-06-12).

## 1. Inventario de uso

**32 llamadas únicas** a YouTube Data API v3 + YouTube Analytics API v2:

| Categoría | Nº | Autenticación | Escrituras |
|-----------|----|---------------|------------|
| Canal del usuario (datos privados) | 18 | OAuth Bearer (scopes: youtube.readonly, youtube.force-ssl, yt-analytics.readonly, yt-analytics-monetary.readonly) | 2 |
| Datos públicos (trending, competidores, análisis de URL) | 11 | API key | 0 |
| OAuth/refresh de tokens | 3 | OAuth2 | 0 |

### Endpoints de lectura (principales)
- `youtube/v3/channels` (snippet, statistics) — canal propio y competidores
- `youtube/v3/videos` (snippet, statistics, contentDetails, status) — análisis SEO, audit, optimize, trending (`chart=mostPopular`, 12 regiones)
- `youtube/v3/search` — vídeos recientes propios (forMine), vídeos de competidores, keywords
- `youtube/v3/captions` (snippet) — presencia de subtítulos
- `youtube/v3/commentThreads` — top 100 comentarios (extensión, sentiment)
- `youtubeanalytics/v2/reports` — views, watch time, retención (audienceWatchRatio), demografía (ageGroup, gender, country), tráfico, suscriptores, estimatedRevenue (si monetizado)

### Escrituras (2 + 1 agente)
1. **A/B testing** (`PUT youtube/v3/videos` snippet): rota títulos automáticamente según el calendario que configura el usuario. `app/api/youtube/ab-test/route.ts` + `lib/ab-test-processor.ts`.
2. **Optimize** (`PUT youtube/v3/videos` snippet): aplica título/descripción/tags que el usuario edita y confirma. `app/api/youtube/optimize/route.ts`.
3. **Auto-reply a comentarios** (`POST youtube/v3/comments`): `lib/agent/youtube-agent.ts` con `GOOGLE_REFRESH_TOKEN` de entorno (canal de marca). Según memoria de marketing: DESACTIVADO.

### Persistencia de datos de la API

| Modelo Prisma | Datos | Retención actual |
|---------------|-------|------------------|
| YoutubeToken | tokens cifrados + stats del canal | Mientras la conexión está activa; DELETE al desconectar ✓ |
| ChannelSnapshot / CompetitorSnapshot | **solo estadísticas** (subs, views, videoCount) | Histórico indefinido |
| VideoSeoScore | título, thumbnail, views, score | Indefinida (upsert al re-analizar) |
| BestTimeAnalysis | heatmap derivado | Sobrescrito al refrescar |
| TrendAlert | títulos trending + stats | **14 días (limpieza en cron/trends)** ✓ |
| YoutubeCache | búsquedas keywords | TTL 24h lógico, **sin borrado físico** |
| AbTest / OptimizeHistory | títulos old/new, views | Indefinida |

### Datos de la API enviados a Anthropic (Claude)
12 rutas envían datos de YouTube como contexto de prompts (audit, best-time, ab-test, optimize, seo-score, revenue, subscribers, retention, competitor-intel, trends, agente). Solo nombre de canal como identificador; sin PII adicional. Cubierto en Privacy Policy §5 y §7 (actualizada en D2).

## 2. Contraste con las Developer Policies

| Política | Qué exige | Estado YTubViral | Veredicto |
|----------|-----------|------------------|-----------|
| **III.E.4.b** | Datos de Analytics API y **estadísticas** (views, subs) pueden almacenarse sin límite de 30 días | Snapshots históricos almacenan SOLO estadísticas | ✅ CONFORME (los snapshots son legales) |
| **III.E.4.c/d** | Resto de datos (títulos, thumbnails, descripciones): refrescar o borrar a los 30 días | VideoSeoScore, YoutubeCache, AbTest/OptimizeHistory guardan títulos sin limpieza | ⚠️ INCUMPLIMIENTO TÉCNICO MENOR → propuesta #2 |
| **III.E.4.h** | Métricas derivadas de API Data prohibidas **salvo disclosure claro de que "no son de YouTube"** | SEO Score, VPH, revenue estimado, predictor, outlier multiplier, hook score, opportunity score — **sin disclosure** | 🔴 RIESGO PRINCIPAL → fix #1 (aplicado parcialmente hoy) |
| **III.E.3.b** | Authorized Data visible solo para el usuario que autoriza | Analytics solo se sirve al dueño del canal autenticado ✓. Envío a Anthropic = procesador para prestar la feature, disclosed en Privacy | ✅ razonable / gris aceptado |
| **III.I.2 + III.E.3.4** | Acciones automatizadas solo con consentimiento específico y expreso previo | A/B test: el usuario configura variantes y rotación explícitamente ✓. Optimize: confirma cada edición ✓. Auto-reply comentarios: consentimiento del dueño del canal de marca (Javier), pero es contenido generado por IA publicado sin revisión | ✅ A/B y Optimize · ⚠️ auto-reply (desactivado; si se reactiva → revisión humana o eliminarlo) |
| Requisitos de disclosure (ToS/Privacy links de Google) | Links a YouTube ToS + Google Privacy + revocación | Terms §7 + Privacy §2 (añadido en D2) | ✅ CONFORME |
| "Análisis de viralidad puede violar ToS" (preocupación del brief) | — | Es una métrica derivada más (VPH/outlier) → legal CON disclosure | ✅ con fix #1 |

## 3. Cambios aplicados hoy (fix #1 parcial)

1. **Terms §7**: añadida cláusula de que los scores y estimaciones son cálculos propios de YTubViral, no datos oficiales de YouTube.
2. **SEO Score (herramienta insignia)**: disclaimer visible "El SEO Score es una métrica propia de YTubViral, no un dato oficial de YouTube".

## 4. Propuestas pendientes (requieren decisión de Javier)

1. **[ALTA] Extender el disclaimer "métrica propia, no de YouTube"** al resto de superficies: revenue estimator, predictor, extensión Chrome (scorecard), competitor intel (VPH), retention (hook score). Es texto de una línea por UI.
2. **[MEDIA] Job de limpieza de datos no-estadísticos >30 días**: borrar filas de YoutubeCache expiradas, VideoSeoScore con `analyzedAt` >30d (o re-fetch al mostrar), y valorar TTL para AbTest/OptimizeHistory completados. NO implementado — borra datos de producción, necesita OK explícito.
3. **[MEDIA] Auto-reply de comentarios**: mantener desactivado, o reactivar solo con cola de revisión humana. Riesgo de spam policy de YouTube además de API policy.
4. **[BAJA] Documentar en el ToS del producto** (sección YouTube) que el A/B testing modifica títulos automáticamente según la programación configurada — el consentimiento ya es expreso en la UI, esto solo lo blinda.

## 5. Conclusión

No hay violaciones graves. El uso de OAuth, scopes, escrituras consentidas y snapshots de estadísticas es conforme. Los dos gaps reales son **(a)** la falta de disclosure en métricas derivadas (riesgo principal, fix iniciado hoy) y **(b)** retención >30 días de datos no-estadísticos (menor, propuesta #2). La preocupación original del brief ("el análisis de viralidad puede violar ToS") queda resuelta: es legal con el disclosure de III.E.4.h.
