# J2 — Estrategia de waitlist para Product Hunt (2026-06-14)

Objetivo: 100+ emails antes del lanzamiento en Product Hunt. ¿De dónde vienen? ¿Qué ofrecemos?
¿Cómo los captamos?

---

## Estado real: el mecanismo YA existe, falta DISTRIBUCIÓN

El sistema de captura está completo y funcional (no hay que construirlo):
- Modelo `LaunchWaitlist` (tabla `launch_waitlist`: email único, source, referrer, lang).
- `/api/waitlist` (POST captura + dedupe + email de bienvenida transaccional + devuelve posición; GET cuenta).
- Página `/launch` con su formulario (`LaunchClient.tsx`), enlazada desde un botón del header de la landing.
- Componente `WaitlistInline.tsx` — un widget de captura embebible… **que no está montado en NINGUNA página** (código muerto).

**El problema no es el mecanismo, es que solo se captura en `/launch`**, una página a la que casi
nadie llega. Las páginas con tráfico e intención real (las herramientas gratis, el blog) no piden
el email. Por eso la lista está vacía. El funnel-optimizer lleva semanas reportando "waitlist
vacío" — la causa es esta.

---

## Encuadre: producto VIVO → el waitlist es "lista de lanzamiento PH"

El producto ya es usable (cualquiera se registra hoy). Así que el waitlist no es "apúntate para
acceder" — es **"sé de los primeros el día del lanzamiento en Product Hunt + early-bird"**. El
gancho es el evento + el incentivo (cupón LAUNCH50, ya existente), no el acceso.

---

## 1. ¿De dónde vienen los 100 emails? (por orden de ROI)

1. **Usuarios de las herramientas gratis** (SEO Score + Trends) — el mejor público: están en el
   sitio, con intención alta, sin registro. Hoy se van sin que les pidamos nada. ESTE es el grifo.
2. **Lectores del blog** — 26 artículos, tráfico SEO en construcción. CTA al final de cada post.
3. **Outreach por email** (ya activo, J1/J3) — añadir una línea de waitlist a la secuencia.
4. **Audiencia de las personas en Twitter** (canal vivo tras abandonar Reddit) — tweets con link
   a /launch.
5. **Los ~12 usuarios actuales** — ya son fans; pedirles que se apunten y compartan.
6. **Directorios/comunidades de makers** (r/SideProject manual, IndieHackers, BetaList) — el
   lanzamiento PH es contenido válido ahí.

## 2. ¿Qué ofrecemos a cambio?

- **Aviso el día del lanzamiento** para apoyar en Product Hunt (mobilización de upvotes).
- **Cupón early-bird LAUNCH50** reservado para la lista (descuento ya existente — NO inventar uno
  nuevo; usar el aprobado).
- **Posición en la lista + share para subir** (ya implementado: el endpoint devuelve posición).
- Honesto y coherente con la marca: "somos pequeños, tu apoyo el día 1 mueve la aguja".

## 3. ¿Cómo los captamos? (implementación)

Surface el widget donde está el tráfico, no escondido en /launch:
- **SEO Score** (tras mostrar el resultado — momento de máxima intención). ← prioridad 1
- **Trends** (tras mostrar tendencias). ← prioridad 1
- **Blog** (CTA al final de los posts / índice). ← prioridad 2
- **Banner dismissible** en la landing para visitantes que no van a /launch. ← prioridad 3
- **Outreach email + tweets de personas** con link a /launch?ref=... para atribuir origen. ← prio 2

---

## Plan de implementación

HECHO en esta tarea (técnico, sin tocar comms/oferta):
- `WaitlistInline.tsx` hecho REUTILIZABLE: prop `source` configurable (antes hardcodeaba
  'homepage-cta' y no estaba montado en ninguna parte) + captura referrer/UTM para atribución.
  Queda listo para colocar en cualquier página con una línea.

NO HECHO — requiere decisión de Javier (líneas rojas: ofertas / comunicación con clientes):
- ⚠️ TENSIÓN CLAVE: SEO Score y Trends YA tienen `ExitIntentPopup` que empuja a **/signup**. Meter
  un waitlist ahí compite con la conversión principal (registro). Hay que decidir qué prioriza la
  herramienta gratis: ¿signup, waitlist, o ambos en momentos distintos? NO lo decido yo.
- ¿Copy del widget menciona el descuento concreto (LAUNCH50) o se queda genérico ("aviso el día
  del lanzamiento")?
- CTA de waitlist en la secuencia de outreach email (copy de comms).
- Banner dismissible en la landing (cambio visible de la home).
- Tweets de personas promocionando /launch (calendario social).

RECOMENDACIÓN: dado que el producto está vivo, **priorizar SIGNUP en las herramientas** (es
conversión directa a usuario) y captar waitlist en sitios que NO compiten: blog (lectores no
listos para registrarse), un banner secundario, y el outreach. El waitlist tiene sentido sobre
todo en la semana previa al lanzamiento PH; antes, el signup directo vale más.

---

## Medición
- `source` por canal (seo-score, trends, blog, homepage, outreach, twitter) → saber qué grifo
  llena la lista.
- GET `/api/waitlist` para el conteo; el funnel-optimizer ya lo lee.
- Meta operativa: con el tráfico de las herramientas gratis surfaceando el CTA, 100 emails es
  cuestión de semanas si hay algo de tráfico; si no llega, el cuello es tráfico (SEO), no captura.
