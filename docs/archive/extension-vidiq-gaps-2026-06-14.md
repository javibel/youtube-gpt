# C3 — Features de vidIQ que faltan y su viabilidad (2026-06-14)

Evaluación de los 3 candidatos del brief (VPH mejorado, Studio upload page, overlay de keywords en
búsqueda) + otros gaps reales. Con el estado ACTUAL de la extensión verificado en código.

---

## Encuadre (importante)

La extensión YA tiene más features que el free de vidIQ (SEO score, badges VPH, Studio editor,
keyword panel en búsqueda, competidor, comentarios, AI). El cuello de botella NO es features —
es adopción (lo arregló C2: valor sin login + desbloqueo OAuth). Así que C3 prioriza pocas cosas
de alto valor, no una lista larga.

---

## Los 3 candidatos del brief

### 1. "VPH mejorado" — gap REAL, pero es trabajo de BACKEND (valor medio)
- **Estado actual**: el VPH se calcula en el backend (`/api/extension/video-batch`) como
  vistas ÷ antigüedad = velocidad MEDIA DE VIDA. La extensión solo muestra `d.vph`.
- **El gap vs vidIQ**: vidIQ muestra velocidad RECIENTE (vistas ganadas en las últimas horas/días),
  no la media histórica. Un vídeo viejo con muchas vistas puede tener VPH-medio alto pero estar
  muerto AHORA; vidIQ lo refleja, nosotros no.
- **Viabilidad**: media-alta. Requiere snapshots de viewCount en el tiempo (guardar viewCount por
  videoId cada X horas y calcular el delta). Ya existe infraestructura de snapshots (ChannelSnapshot,
  VideoSeoScore). NO es client-side — es backend + un job. Esfuerzo medio.
- **Recomendación**: SÍ, pero fase 2. Empezar por marcar el VPH actual como "media" y, si hay
  tracción, añadir velocidad reciente con snapshots.

### 2. Studio UPLOAD page — gap REAL, ALTO VALOR, el ganador
- **Estado actual**: `content.js` detecta `/videos` (lista) y `/video/{id}/edit` (editor) pero
  NO el flujo de subida (cuando creas un vídeo nuevo). El momento de MÁXIMA intención SEO (estás
  decidiendo título/descripción/tags de un vídeo nuevo) no tiene asistencia.
- **El gap vs vidIQ**: vidIQ asiste durante la subida. Nosotros solo en vídeos ya publicados.
- **Viabilidad**: media. El diálogo de subida de Studio es un modal con DOM propio (no una URL
  distinta) — hay que detectar el diálogo e inyectar el panel de SEO en vivo + sugerencia de tags,
  reutilizando lo que YA existe en el editor (`injectStudioEditor`, `SEO_LIVE`, tag suggestions).
  El grueso de la lógica ya está hecho; el trabajo es detectar el modal y enganchar los campos.
- **Recomendación**: SÍ — es el de mayor ROI. Reutiliza ~80% del código del editor. Capturar al
  creador en el momento de subir (antes de publicar) es donde el SEO score cambia decisiones.

### 3. Overlay de keywords en búsqueda — YA EXISTE (gap marginal)
- **Estado actual**: `injectSearchPanel` ya muestra un panel sobre los resultados con competición,
  Opportunity Score, total de resultados, vistas medias del top 5 y términos relacionados clicables.
- **El gap vs vidIQ**: vidIQ además pone un mini-score por CADA resultado de búsqueda (inline en cada
  vídeo), no solo un panel arriba. Diferencia menor.
- **Viabilidad**: alta pero BAJO valor incremental — ya cubrimos el caso de uso (saber si la keyword
  merece la pena). El per-resultado añade ruido visual por poco.
- **Recomendación**: NO prioritario. El panel ya resuelve el 90%.

---

## Otros gaps de vidIQ (bonus)

- **Tags del vídeo copiables en watch page**: YA EXISTE — el scorecard expandido muestra hasta 15
  tags reales del vídeo, clicables (buscar) + botón "Copiar todo" (`content.js` ~L400-420). No es gap.
- **Trending/Most-viewed del nicho en la extensión**: la web tiene /trends; la extensión no lo
  surfacea. Valor medio, esfuerzo medio. Fase 2.
- **Channel audit score on channel page**: tenemos competitor analysis; un "score de canal" visual
  estilo vidIQ sería pulido, no esencial.

---

## Recomendación priorizada

1. **Studio upload-page integration** (alto valor, reutiliza ~80% del editor) — HACER.
2. **VPH reciente con snapshots** (backend) — fase 2, tras validar tracción.
3. Overlay per-resultado en búsqueda, trending-en-extensión, channel audit score — NO prioritarios.

PERO antes de añadir features: las mejoras de adopción de C2 (valor sin login, OAuth) y publicar el
zip v2.2.0 mueven más la aguja que cualquier feature nueva. Features sin instalaciones no convierten.
Esta evaluación es para DESPUÉS de que C2 esté en manos de usuarios.
