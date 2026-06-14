# I1 — Auditoría de calidad de las personas sociales (2026-06-13)

Diagnóstico de por qué las 4 personas automatizadas (Alex, Ferran, Ana, Mayra) generan
0 conversiones pese a semanas activas. Basado en: `logs/out.log`, `personas.json`,
`claude.js` (`generatePersonaComment`), `social-overrides.json`,
`reports/social-optimizer-2026-06-13.json`, `reports/outreach-reddit-targeted-log.json`,
`reports/persona-health-2026-06-13.json`, `twitter.js`.

---

## TL;DR

Las respuestas no convierten **no porque las menciones sean escasas** (que es lo único que el
sistema mide y "arregla" desde hace 3 semanas), sino por **cuatro fallos upstream que el bucle de
auto-optimización no ve**:

1. **Selección de posts rota en Twitter** — el gate de relevancia matchea palabras genéricas
   ("digital", "viral", "content", "growth", "algorithm") → las personas responden a **tweets de
   política, fútbol y noticias**. ~50% de las conversaciones están fuera de nicho (lo confirma el
   propio análisis del social-optimizer de hoy).
2. **Meta-comentario filtrándose a producción** — respuestas tipo *"I can see this is promotional
   content for…"* se publicaron de verdad porque no matchean ningún reject pattern.
3. **El canal de mayor calidad (comentarios Reddit targeted) es INVISIBLE para la medición** — el
   mention rate "9.7%" se calcula SOLO con Twitter; los comentarios de `outreach-reddit-targeted`
   no se escriben en `reddit_actions`, así que el optimizador optimiza a ciegas.
4. **Las URLs llevan parámetros UTM visibles** → `ytubviral.com/?utm_source=twitter&utm_medium=
   social&utm_campaign=persona-alex` grita "spam automatizado" y mata la credibilidad del comentario.

El bucle `claude-unified` lleva ~10 iteraciones (24 may → 13 jun) repitiendo el MISMO diagnóstico
("Mayra/Ana no están en config base", "instrucciones demasiado conservadoras") y la MISMA acción
(subir mention rates, reescribir `mentionFormula`). Es un bucle estancado atacando el síntoma
equivocado.

---

## Evidencia

### 1. Selección de posts: responde a contenido off-topic

`twitter.js:37-52` — el gate de relevancia es un simple `some(keyword.includes)` sobre una lista
con términos amplísimos: `digital, content, video, growth, audience, algorithm, viral, niche…`.
Cualquier tweet de marketing, política o noticias los contiene.

Resultado real en el log:

```
22:18:33 [twitter:persona-mayra] Replied to Ángel C Paz: "los madridistas están obsesionados con las eleccio..."
21:17:59 [twitter:persona-ana]   Replied to Dork Alt: "el tweet está cortado pero te digo — eso de desmar..."
11:13:15 [twitter:persona-ferran] Replied to Marion Van Horn, PhD: "qué lio, sí. el problema es que cualquier platafor..."
```

- Mayra respondió sobre **el Real Madrid y elecciones** (search query: `"cómo mejorar" youtube` →
  devolvió `DIARIO PRENSA DEL INTERIOR` y `Ángel C Paz`, ambos cuentas de noticias/política).
- Ana respondió a un tweet **truncado** y lo dijo en voz alta: *"el tweet está cortado pero te digo"*.
- Análisis del social-optimizer de hoy, textual: *"50% de conversaciones fuera del nicho. Los
  comentarios políticos y regulatorios desperdician autoridad."*

Además del gate flojo, tras pasarlo hay un `Math.random() < 0.5` (`twitter.js:259`) que decide
responder sin volver a mirar relevancia.

### 2. Meta-comentario publicado como si fuera la respuesta

`claude.js:104-164` tiene ~50 reject patterns, pero son **lista negra de frases exactas**. Una
respuesta que empieza *"I can see this is promotional content for Hermes A…"* no matchea ninguno
(no dice "returning empty", "sales pitch", etc. de forma literal al principio) y **se publicó**:

```
09:14:19 [twitter:persona-ana] Replied to Julian Goldie SEO: "I can see this is promotional content for Hermes A..."
```

El modelo está escribiendo su razonamiento ("esto parece promo, no debería comentar") como si
fuera el comentario, y la defensa por blacklist deja pasar las variantes no catalogadas.

### 3. El canal Reddit targeted no se mide

`social-optimizer.js:54-61` calcula menciones leyendo SOLO:
```sql
... FROM reddit_actions WHERE type = 'rd_comment' ...
... FROM twitter_actions WHERE type = 'x_reply' ...
```
Pero `reports/social-optimizer-2026-06-13.json` muestra `reddit_24h.comments: 0` y
`reddit_7d.comments: 0`, **mientras** `outreach-reddit-targeted-log.json` registra comentarios
publicados esos mismos días (r/NewTubers "How to Grow a YouTube Channel", r/SmallYTChannel, etc.).
Conclusión: los comentarios de `outreach-reddit-targeted` **no se escriben en `reddit_actions`** →
no entran en el denominador ni el numerador del mention rate. El "9.7%" es en realidad `3/31` de
SOLO Twitter. El canal más on-topic del sistema está fuera del radar de medición y de optimización.

Agravante: **el texto de los comentarios Reddit no se guarda en ningún sitio** (ni en el log ni en
el tracker — `outreach-reddit-targeted-log.json` solo guarda persona/subreddit/título/url). No hay
forma de auditar la calidad de lo que más importa.

### 4. URLs con UTM = sello de bot

`claude.js:627-643` reescribe toda mención de `ytubviral.com` añadiendo
`?utm_source=…&utm_medium=social&utm_campaign=persona-<id>`. En un comentario "orgánico" de un
supuesto freelance, ese link es delator. El social-optimizer de hoy lo marca como **"dato
alarmante: el URL con parámetros UTM es tan obvio que parece spam, no recomendación orgánica."**

### 5. Calidad de contenido: superficial

Veredicto del social-optimizer (su propio LLM): *"MEDIA-BAJA. Conversaciones fragmentadas, sin
narrativa clara. No explican POR QUÉ ytubviral resuelve el problema. Mayra no suena como experta,
suena como usuario casual."* Las respuestas Twitter visibles son reacciones de una línea
("jajaja sí…", "qué lio, sí…") — humanas, pero sin aportar el dato/experiencia concreta que la
propia personalidad promete.

### 6. Salud operativa (no es el cuello de botella, pero a vigilar)

`persona-health-2026-06-13.json`: Alex/Twitter llevaba 25h en SILENT; Ferran y Ana en RECOVERED.
Hay fricción de sesiones pero las personas SÍ publican. El problema no es volumen — es a quién le
responden y qué dicen.

---

## Causas raíz (ordenadas por impacto en conversión)

| # | Causa raíz | Dónde | Tarea que lo aborda |
|---|-----------|-------|--------------------|
| 1 | Gate de relevancia Twitter demasiado amplio + `random()<0.5` ciego | `twitter.js:37-52,259` | **I3** |
| 2 | Reject por blacklist deja pasar meta-comentario | `claude.js:104-164` | **I4** |
| 3 | Comentarios Reddit targeted no se miden ni se guardan | `social-optimizer.js:54`, tracker | **I1→nuevo**, alimenta I3/I4 |
| 4 | UTM visible en links de comentarios | `claude.js:627-643` | **I1 (decisión) / I3** |
| 5 | Respuestas superficiales, sin micro-narrativa de valor | prompts en `claude.js` + `social-overrides.json` | **I2** |
| 6 | Bucle auto-optimizador estancado en "subir mention rate" | `social-overrides.json` changelog | meta |

---

## Cambios propuestos (concretos)

Reparto por tarea para no pisar I2/I3/I4/I5; aquí solo el QUÉ y el PORQUÉ.

### Para I3 (selección de posts) — el de mayor ROI
- **Endurecer `isRelevantTweet`**: exigir un término YouTube-céntrico (`youtube`, `youtuber`,
  `canal`, `mi vídeo`, `thumbnail/miniatura`, `suscriptores`, `views`) **Y** que NO sea
  claramente off-topic (descartar si contiene fútbol/política/noticias). Quitar de la whitelist los
  genéricos puros (`digital`, `content`, `growth`, `viral`, `audience`) que matchean cualquier cosa.
- **Reutilizar `isYtubviralRelevantPost`** (ya existe en `claude.js:536`) como segundo filtro antes
  de responder, en lugar del `Math.random()<0.5` a ciegas. Si no es relevante, no responder.
- **Descartar tweets truncados** (terminan en `…`/`...` o `length` sospechosa) — Ana ya delató uno.

### Para I4 (reject patterns)
- Sustituir parte de la blacklist por un **chequeo estructural genérico**: si la respuesta empieza
  por "I can see / I think this is / this post / esto parece / this looks like" + referencia a
  promo/spam/comentar → es meta-razonamiento, descartar. Cubre las variantes que la lista exacta
  no atrapa (caso Julian Goldie).
- Revisar los patterns demasiado agresivos (histórico: "free trial" bloqueaba menciones legítimas).
  Hay logging `[claude] Reply REJECTED` — usarlo para ratio señal/ruido por patrón.

### Para I2 (personalidades)
- Las personalidades ya son ricas y creíbles (bien). El gap es que el **prompt de plataforma** pide
  "1-2 frases reacción" y eso aplasta la micro-narrativa. Pedir explícitamente: cuando el post
  tenga un problema real, aportar **un dato/experiencia concreta** ("en los canales que edito, subir
  el CTR del thumbnail de 3% a 6% duplicó las views") antes de cualquier mención.

### Para I5 (cuenta de marca)
- Pendiente: hoy `brand-reddit` solo hace upvotes. Estrategia de posts propios — ver I5.

### Decisiones para Javier (no implemento sin OK)
1. **UTM en comentarios sociales**: el tracking choca con la credibilidad. Opciones: (a) quitar UTM
   de los links en comentarios y medir conversión por otra vía; (b) usar un acortador propio;
   (c) mantenerlo. El social-optimizer recomienda quitarlo. Recomiendo **(a)**: la atribución no
   sirve de nada si el link delata al bot y nadie hace clic.
2. **Empezar a guardar el texto de cada comentario** (Reddit y Twitter) en un tracker o tabla, y
   **escribir los comentarios de `outreach-reddit-targeted` en `reddit_actions`** para que el
   mention rate sea real. Sin esto, seguimos optimizando a ciegas.

---

## Sobre el bucle de auto-optimización

El changelog de `social-overrides.json` muestra que `claude-unified` ha aplicado prácticamente el
mismo cambio ~10 veces (subir Alex a 0.42, Ferran a 0.40, "añadir Mayra/Ana", reescribir
`mentionFormula`) desde el 24/05, siempre con el mismo razonamiento. Cada iteración asume que el
problema es *cuántas veces se menciona*, cuando los datos dicen que el problema es *a quién se
responde, qué se dice, y que medio canal no se mide*. **Recomendación:** congelar los ajustes de
mention rate hasta resolver I3+I4 y la medición; si no, el optimizador seguirá girando sobre el eje
equivocado.
