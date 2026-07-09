# Data study de títulos — Explotación v2 (páginas por nicho + ola 2 de outreach)

Spec 6 de la ventana Fable 5 (2026-07-09). **Corrección de alcance:** la página `/youtube-title-study` está LIVE desde el 27/06 y la ola 1 de outreach está agotada (3 emails + follow-ups el 07/07 con 0 respuestas; acordado como último toque — NO recontactar a esos 3). Lo que queda por explotar del activo es esto.

## Estado real verificado (09/07)

- Página live: `app/youtube-title-study/{page,layout,StudyClient}.tsx`, bilingüe, JSON-LD Article+Dataset, en sitemap.
- Scripts de recogida: `local-agent/title-study-collect.js` (~30 unidades de cuota) y `title-study-niches.js` (~1.600 unidades, usa search.list).
- **Los datasets JSON del 27/06 YA NO EXISTEN** — `reports/` se purga a los 7 días. Los agregados sobreviven hardcodeados en la página, pero cualquier corte nuevo (por nicho) exige re-ejecutar los colectores.
- Ola 1: Alan Spicer, TunePocket, TopicTree (email, sin respuesta, cerrados); 4 formularios pendientes de Javier (humbleandbrag, 10xcreator, teleprompter, influenceflow) — siguen siendo la acción manual más barata disponible.
- El follow-up del 07/07 ofrecía "tabla per-niche lista para usar" — la Parte A de este spec es también cumplir esa promesa si alguien contesta tarde.

## Parte A — Páginas por nicho (16 activos enlazables nuevos desde el mismo dataset)

**Idea:** `/youtube-title-study` compite por "youtube title study" (genérico); 16 sub-páginas `/youtube-title-study/{nicho}` compiten por el long-tail donde sí hay hueco sin autoridad: "youtube title length gaming", "títulos youtube cocina", etc. Mismo dataset, 16 puertas de entrada más, y cada una es citable por blogs de SU nicho (multiplica los objetivos de outreach de la Parte B).

**Pasos:**
1. **Re-recogida con persistencia correcta:** ejecutar ambos colectores y guardar la salida como **fichero de datos versionado en el repo** (p. ej. `data/title-study-2026-07.json`), NO en `reports/` (se purga). La página y las sub-páginas leen de ahí en build — contenido estático, cero coste runtime. Cuota: ~1.630 unidades, un solo día, dentro del presupuesto (coordinar con cualquier otra tarea intensiva de cuota ese día).
2. **Sub-página por nicho:** métricas del nicho vs benchmark global (las 8 de la tabla madre), 2-3 hallazgos redactados específicos del nicho (generables con IA EN BUILD a partir de los números — revisados una vez, no runtime), distribución de longitud, "qué significa para TUS títulos de {nicho}", CTA a `/title-analyzer` + `/seo-score`, bloque metodología+cómo citar heredado, JSON-LD Dataset por página. Bilingüe con el mismo patrón `useLang` de la madre.
3. **Cableado SEO (los 3 puntos que ya mordieron el 27/06):** añadir al sitemap, añadir el patrón de ruta a la config de cache de `next.config` (sin eso → max-age=0 y no indexa), y `gsc-index-urls.js` tras el deploy.
4. La página madre gana un índice de nichos (16 links internos — también ayuda al crawl).
5. **Regla de honestidad para N pequeños:** algunos nichos tendrán N<50 — mostrar el N siempre y marcar "muestra pequeña" bajo umbral (N<30: considerar fusionar o excluir el nicho antes que publicar datos débiles).

## Parte B — Outreach ola 2 (lista nueva, ~30 objetivos)

La ola 1 fueron solo 3 emails: el activo está sin explotar, no quemado. Reglas: NUNCA recontactar a los 3 de la ola 1; máximo 1 follow-up por contacto (a los 7-10 días); from "Javier from YTubViral <hello@ytubviral.com>" (el único buzón verificado en Resend); registrar todo en `outreach-tracker.json` (infra existente).

**Construcción de la lista (ejecutable por otro modelo con web search):**
- Segmento 1 — *autores de artículos que ya rankean* por "youtube title length", "best youtube title", "cuántos caracteres título youtube" (top 20 resultados EN + ES): su artículo mejora citando datos primarios. Ángulo: "dato original que resuelve el debate 40-70 vs 70-100 que tu artículo menciona".
- Segmento 2 — *newsletters/blogs de creator economy* (EN y ES): ángulo hallazgo contraintuitivo ("los vídeos virales NO optimizan títulos; los top de nicho sí").
- Segmento 3 — *blogs/canales del nicho concreto* usando la sub-página de SU nicho (requiere Parte A live): el pitch más fuerte porque es hiperrelevante — "datos de títulos SOLO de canales de cocina".
- Cualificación mínima por objetivo: dominio con blog activo (post <90 días), autor identificable, email o formulario localizable. Priorizar ES: menos competencia por la cita y es la cuña estratégica.
- **Meta: 30 objetivos cualificados, 10/semana durante 3 semanas** (sostenible para revisión manual de Javier antes de envío — los emails a terceros siempre pasan por su OK, regla permanente).

**Plantillas:** 3 (una por segmento), cortas (<120 palabras), personalizadas con el artículo/post concreto del destinatario, ofreciendo la tabla/gráfico listo para incrustar + link de atribución. Sin pedir "backlink" explícitamente — se ofrece el dato, el link es la consecuencia. Redactarlas al ejecutar partiendo de las de `reports/study-outreach-pitches-2026-06-27.md` si aún existe (verificar; si se purgó, redactar de cero con estos ángulos).

## Parte C — Refresco trimestral (convierte el activo en serie)

Cada ~90 días: re-ejecutar colectores → nuevo `data/title-study-{YYYY-MM}.json` → la página gana bloque "Qué ha cambiado desde {trimestre anterior}" con 2-3 deltas reales. Cada refresco = gancho nuevo de outreach ("actualizamos el estudio: X subió de 41% a Y%") y señal de frescura para Google. Automatizable como cron trimestral del local-agent que deja el JSON listo y avisa para revisión — pero v1 manual está bien.

## Orden y dependencias

1. Parte A pasos 1-3 (re-recogida + sub-páginas + cableado) — desbloquea el segmento 3 de outreach.
2. Parte B lista + plantillas (segmentos 1-2 pueden arrancar ANTES de que A esté live).
3. Parte C: primer refresco ~octubre 2026.

## Criterios de aceptación

- `data/title-study-*.json` commiteado; las 16 sub-páginas renderizan estáticas con datos correctos y N visible; ninguna publica nicho con N<30 sin marca de muestra pequeña.
- Cada sub-página: 200, en sitemap, con patrón de cache correcto (verificar header `Cache-Control` ≠ max-age=0), JSON-LD válido, y enviada a Indexing API.
- Lista de outreach: 30 objetivos con URL del contenido relevante de cada uno, canal de contacto y segmento; 0 solapes con la ola 1.
- Todo envío registrado en `outreach-tracker.json` y con OK previo de Javier.
