# Auditoría del listing en Chrome Web Store — Tarea C1 (2026-06-12)

Listing actual: https://chromewebstore.google.com/detail/ytubviral-para-youtube/gkjecjfhdmfbhhcemcjdkjkcdbljkcfh
Estado: **5 usuarios**. Comparado contra vidIQ (3.000.000 usuarios) y TubeBuddy (1.000.000), fetcheados en vivo.

## 1. Diagnóstico

| Elemento | YTubViral (antes) | vidIQ | TubeBuddy | Veredicto |
|---|---|---|---|---|
| Título | "YTubViral para YouTube" — 0 keywords | "vidIQ Vision for YouTube" | "TubeBuddy for YouTube™" | Ellos viven de marca; nosotros sin marca necesitamos keywords en el título (factor #1 del search de CWS) |
| Descripción corta | Correcta pero sin "free/tools/analytics" | Gancho emocional | Beneficio + "Solo to Enterprise" | Mejorable |
| Descripción larga | Buena estructura y casos de uso, pero la apertura no martillea las búsquedas objetivo | "YouTube" en cada frase, "optimization/tools/views" constante | "YouTube SEO" en el primer H2 | La primera línea pesa más: optimizar apertura |
| Idiomas | Solo EN (con título en ES, incoherente) | Multi | Multi | Mercado objetivo hispanohablante SIN listing ES |
| Email soporte | ytbeviral@gmail.com (typo, gratuito) | — | — | Cambiar a hello@ytubviral.com |
| Otros | Referencia obsoleta "new in v1.4.0" | — | — | Eliminada |

## 2. Cambios implementados (listos en el paquete v2.1.0)

1. **Manifest localizado** (`_locales/en` + `_locales/es`, `default_locale: en`):
   - Título EN: **"YTubViral: YouTube SEO, Analytics & AI Tools"** (44 chars — cubre las 3 búsquedas objetivo: youtube seo, youtube analytics, youtube tools)
   - Título ES: **"YTubViral: SEO, Analytics y IA para YouTube"**
   - Descripción corta EN: "Free YouTube SEO tools: SEO Score on every video, keyword research, competitor analytics & AI titles — inside YouTube & Studio."
   - Descripción corta ES: "Herramientas SEO gratis para YouTube: SEO Score en cada vídeo, keyword research, análisis de competidores y títulos con IA."
2. **Descripción larga EN** (`chrome-extension-description.txt`): apertura reescrita con densidad de keywords ("Free YouTube SEO tools and YouTube analytics" en la primera frase, "YouTube optimization", diferenciador Claude vs GPT), email corregido, referencia v1.4.0 eliminada.
3. **Descripción larga ES** (`chrome-extension-description-es.txt`): NUEVA, traducción completa adaptada.
4. **Paquete regenerado**: `C:/Users/jimen/youtube-gpt/ytubviral-extension.zip` (v2.1.0, 13 archivos, _locales incluidos).

## 3. Pasos manuales para Javier (dashboard de CWS — yo no tengo acceso)

1. Subir el zip v2.1.0 en https://chrome.google.com/webstore/devconsole (el título/descr. localizados vienen del paquete).
2. En la ficha del listing, añadir idioma **Español** y pegar `chrome-extension-description-es.txt`; actualizar la descripción EN con `chrome-extension-description.txt`.
3. Cambiar el email de soporte del listing a hello@ytubviral.com.
4. **Screenshots** (lo que más convierte tras el título — recomendación, 1280×800, 5 piezas):
   - 1. Scorecard SEO sobre un vídeo real (con el anillo 0-100 y el badge OUTLIER visible)
   - 2. Panel de keyword research sobre resultados de búsqueda (competencia + opportunity)
   - 3. Badges de SEO Score en la lista de vídeos de YouTube Studio
   - 4. Análisis de canal competidor (keywords extraídas visibles)
   - 5. Generación de títulos con IA (los 5 títulos visibles)
   Cada una con caption corta ES/EN sobre fondo de marca. Las actuales no se pudieron auditar via scraping — revisar que cumplan esto.
5. Categoría recomendada: "Herramientas para desarrolladores" NO — usar **Productividad / Herramientas sociales** según disponible.

## 4. Búsquedas objetivo y dónde quedan cubiertas

| Búsqueda | Título | Desc. corta | Desc. larga (apertura) |
|---|---|---|---|
| youtube seo | ✓ | ✓ | ✓ (×3 en primeros 2 párrafos) |
| youtube analytics | ✓ ("Analytics") | ✓ ("competitor analytics") | ✓ |
| youtube tools | ✓ ("AI Tools") | ✓ | ✓ |
| keyword research | — | ✓ | ✓ |
| seo score | parcial | ✓ | ✓ |

Nota: CWS no tiene campo de keywords — el ranking sale de título + descripciones + reviews + instalaciones. Con 5 usuarios, el volumen manda: el listing optimizado es condición necesaria, no suficiente (la adquisición es G2).
