# I5 — Estrategia de contenido para la cuenta de marca en Reddit (u/YTubViral)

Diseño de estrategia para `brand-reddit`. Preguntas del brief: ¿debería crear posts propios?
¿en qué subreddits? ¿con qué frecuencia? ¿qué tipo de contenido?

---

## Estado real (no es "solo upvotes" — está dormido)

- **Posteo ROTO desde ~1 junio**: `outreach-post.js` publica desde `outreach-community-posts.json`,
  pero los 11 posts están en `status: failed` por **selectores de Puppeteer** contra el nuevo
  Reddit ("still on submit page", "Body input not found", "Failed to load submit page"). Como
  `runOutreachPost` solo procesa `pending`, hoy **no postea nada**.
- **Contenido en cola = promo directa** ("I built a free YouTube SEO analyzer", "Free tool: …").
  Aunque los selectores funcionaran, eso en r/NewTubers/r/youtubers lo **elimina el mod** (regla
  anti-autopromo) y hunde la cuenta.
- **No comenta**: brand-reddit NO está cableado en `reddit.js` (las personas Alex/Ferran/Ana/Mayra
  sí; la marca no). No aporta nada genuino.
- **Cuenta de marca + karma bajo** = máximo riesgo de shadowban si lo primero que hace es soltar
  links. Reddit penaliza cuentas nuevas que solo se autopromocionan.

Veredicto: el problema no es "¿debería postear?" — ya hay infra, pero está rota Y la estrategia
(cuenta de marca soltando promo) es la que Reddit más castiga.

---

## Principio rector: la regla 9:1 de Reddit

Por cada post/comentario promocional, ~9 interacciones genuinas. Una cuenta de marca que no
respeta esto se quema. Por eso la estrategia es **valor primero, karma primero, promo al final y
con cuentagotas**.

---

## Estrategia (por fases)

### FASE 0 — Construir karma comentando (AHORA, lo más urgente y seguro)
- brand-reddit pasa de dormido a **comentar con voz de fundador** (honesto, agradecido, sin vender)
  en hilos donde puede aportar: dudas de SEO, "por qué no crezco", feedback de canales.
- Esto es lo que YA debería existir y no existe. Es la base de todo lo demás (sin karma, los posts
  se eliminan/ocultan).
- Mención de ytubviral **solo si alguien pregunta directamente** por herramientas, y en plan "yo
  monté esto, por si te sirve" — nunca link en frío.
- Meta: ~100+ karma antes de empezar a postear en serio.

### FASE 1 — Posts de VALOR (cuando haya karma)
Tres tipos, ninguno es "mira mi herramienta":

1. **Data / case-study** (el más fuerte — usa datos REALES del analizador SEO):
   - "Analicé el SEO de 200 vídeos de canales pequeños — los 5 errores que comete el 80%"
   - "Miré 50 títulos que rankean vs 50 que no: la diferencia no es la que crees"
   - Valor puro en el cuerpo. La herramienta, como mucho, una línea al final ("saqué esto con una
     cosa que estoy montando") o NADA (link en comentario solo si lo piden).

2. **Tutoriales / guías accionables**:
   - "Cómo estructurar una descripción de YouTube que YouTube entienda (plantilla)"
   - "Title testing para canales pequeños sin gastar un duro"
   - Cero promo. Construye autoridad de marca.

3. **Build-in-public / transparencia de fundador**:
   - "Bootstrapping una herramienta para YouTubers — lo que aprendí en 1 mes y 12 usuarios"
   - Honesto, sin métricas infladas (coherente con la biblia de marca).

### FASE 2 — Posts de herramienta / feedback (solo donde se permite)
- "Construí un analizador SEO gratis para YouTube, ¿feedback?" — SOLO en subs que lo permiten.

---

## Mapa de subreddits (dónde encaja cada cosa)

| Subreddit | Data/Tutorial | Build-in-public | Tool/feedback (link OK) |
|-----------|:---:|:---:|:---:|
| r/NewTubers, r/SmallYTChannel, r/youtubers | ✅ (sin link en cuerpo) | ⚠️ a veces | ❌ lo eliminan |
| r/PartneredYoutube, r/YouTubeGrowth | ✅ | ❌ | ❌ |
| r/SideProject, r/alphaandbetausers, r/roastmystartup | — | ✅ | ✅ |
| r/SaaS, r/InternetIsBeautiful | — | ✅ | ✅ (con criterio) |
| r/Entrepreneur, r/indiehackers | — | ✅ | ❌ |

Regla de oro: en los subs de YouTubers, **el valor va en el cuerpo y el link NO** (o en un
comentario si alguien lo pide). En los subs de makers, la promo honesta sí se acepta.

---

## Frecuencia

- **Comentarios (Fase 0)**: 3-6/día repartidos, genuinos. Es el grueso de la actividad (lado "9").
- **Posts (Fase 1+)**: **1-2 por semana en TODA la red**, nunca el mismo post cross-posteado a la
  vez (patrón spam). Rotar tipo y subreddit. Es el lado "1".
- Nunca más de 1 post/semana por subreddit concreto.

---

## Bloqueadores a resolver (sin esto, la estrategia no se ejecuta)

1. **Selectores de posteo rotos** (`outreach-post.js`): el nuevo Reddit usa `faceplate-*`
   components inestables. Opciones: (a) arreglar selectores y verificar en vivo; (b) para una
   cuenta de karma bajo, **postear a mano** los primeros (más seguro, menos huella de bot) y
   automatizar solo cuando haya karma. Recomiendo (b) al principio.
2. **Reescribir la cola** `outreach-community-posts.json`: los 11 posts actuales son promo y están
   en `failed`. Sustituir por posts de VALOR (data/tutorial) y resetear a `pending` los que vayan
   a subs donde encajan.
3. **Cablear brand-reddit para comentar** (Fase 0): hoy no comenta. Es el paso de mayor ROI y el
   más seguro.

---

## Respuesta directa al brief
- **¿Debería crear posts propios?** Sí, pero NO todavía como prioridad — primero karma vía
  comentarios (Fase 0). Posts de valor cuando tenga autoridad; promo solo en subs de makers.
- **¿En qué subreddits?** Ver mapa. Valor → subs de YouTubers (sin link). Promo/feedback → subs de
  makers (r/SideProject, r/alphaandbetausers, r/SaaS).
- **¿Con qué frecuencia?** Comentarios diarios (3-6); posts 1-2/semana en toda la red, máx
  1/semana/subreddit.
- **¿Qué tipo de contenido?** Por orden de valor: (1) data/case-studies con datos reales del
  analizador, (2) tutoriales accionables, (3) build-in-public de fundador, (4) tool/feedback solo
  donde se permite. Nunca promo en frío en subs de creadores.

---

## Próximos pasos implementables (si Javier da OK)
1. Cablear brand-reddit a comentar con voz de fundador (Fase 0) — reusar `generateFollowupReply`/
   persona brand ya existente, con la regla "no vender, mención solo si preguntan".
2. Reescribir `outreach-community-posts.json` con 4-5 posts de valor (data/tutorial) bilingües.
3. Decidir posteo: arreglar selectores de `outreach-post.js` vs postear a mano la primera tanda.
