# G3 — Preparación del lanzamiento en Product Hunt (2026-06-14)

Revisión de assets, copy, estrategia de upvotes día 1 y timing. Con un filtro de realidad tras
los hallazgos de esta sesión (Reddit muerto, personas no pueden promocionar, waitlist ~vacía).

---

## TL;DR — NO lanzar todavía

Todo lo PRODUCIBLE está listo (copy, cupón, emails, assets). Pero falta lo único que decide un
lanzamiento de PH: **una audiencia día-1**. La waitlist está casi vacía y dos de los canales que
el plan asumía (Reddit, personas) ya NO están disponibles. Lanzar a una lista vacía en PH = hundirse
(PH premia la velocidad de upvotes en las primeras horas; sin empuje inicial, no rankeas). El
prerequisito sigue siendo el de siempre: **llenar la waitlist primero.**

---

## 1. Assets — LISTO (con 1 verificación)

- Tagline, descripción corta, topics, pricing, maker first-comment: completos y buenos
  (`local-agent/ph-listing-copy.md`). Gancho correcto: SEO Score, no "14 tools".
- `public/ph-assets/`: `gallery-hero.png` (gauge SEO) + `logo-240.png` presentes. OG `og-seo-score.webp`.
- ⚠️ VERIFICAR: el listing-copy aún dice "Thumbnail NEEDS RECREATION — current says 14 AI TOOLS",
  pero la memoria (2026-06-05) dice que se reemplazó. Confirmar que el hero/thumbnail final NO dice
  "14 tools" antes de subir. Los 6 screenshots de galería: confirmar que existen (solo veo
  gallery-hero + logo en public/ph-assets; revisar dónde están los 01-06).

## 2. Copy del launch post — LISTO

Tagline ≤60 ✓, maker comment con historia personal + LAUNCH50 ✓. Sólido. Único retoque sugerido:
el maker-comment dice "It checks 12 factors" — verificar que el SEO Score real audita 12 (coherencia).

## 3. Mecanismo de lanzamiento — LISTO

- `/api/waitlist/send-launch` (admin-only): manda el email bilingüe de lanzamiento (link PH + cupón
  + urgencia 48h) a toda la waitlist. `launchDayEmail()` listo.
- Cupón `LAUNCH50` (promo_1TV552JuYL0KSOoKDMGsW2PO): 50% off 12 meses, activo. Poner `expires_at`
  48h el día del lanzamiento.

## 4. Estrategia de upvotes día 1 — REPLANTEADA (canales muertos)

El plan anterior listaba "Reddit (update replies), HN, IH, Twitter personas". Realidad 2026-06-14:
- ❌ **Reddit**: cuentas shadowbaneadas/suspendidas. CERO alcance. Fuera.
- ❌ **Personas (Twitter)**: son freelancers que USAN ytubviral, no trabajan para la marca —
   promocionar "nuestro lanzamiento" rompe el personaje. Fuera como canal de launch.
- ✅ **Waitlist** (email blast): el lever #1 — pero está casi vacía. SIN ESTO NO HAY LANZAMIENTO.
- ✅ **Red personal de Javier**: su Twitter @ytubviral + contactos directos + cualquier creador
   con el que ya haya hablado. El empuje más fiable día 1.
- ✅ **Creadores del outreach por email**: a los que respondieron / probaron — pedirles apoyo el día.
- ✅ **Comunidades de makers** (IndieHackers, BetaList, maker Twitter): contenido válido ahí, con la
   cuenta PERSONAL de Javier (no las personas, no la cuenta de marca quemada).
- ✅ **Hacker News Show HN**: en paralelo, gancho "free YouTube SEO tool, no signup".
- **Hunter**: idealmente que lo "hunte" alguien con seguidores en PH (más alcance que auto-hunt).
  Conseguir un hunter conocido del nicho creator-tools si es posible.

## 5. Timing óptimo

- **Día**: martes–jueves (evitar lunes/finde — menos tráfico/competencia variable).
- **Hora**: 00:01 PST (09:01 España) — maximiza la ventana de 24h del ranking de PH.
- **Presencia**: Javier disponible TODO el día para responder cada comentario en <1h (señal de
  engagement que PH valora).
- **Pre-lanzamiento**: la semana previa, empujar fuerte la captación de waitlist (blog + banner +
  outreach ya activos) y avisar a la red personal de la fecha.

---

## El cuello de botella real (honesto)

El producto, copy, assets y mecánica están listos desde hace semanas. Lo que NO está es la
**audiencia día-1**, y este es el bucle: la waitlist se llena con tráfico, y el tráfico depende
del SEO (0% indexado) + los canales sociales (Reddit muerto, personas limitadas a Twitter sin
promocionar la marca). 

**Recomendación**: no fijar fecha de PH hasta tener ~100 emails reales en la waitlist. Para
llegar: (a) los captadores ya desplegados (blog + banner + outreach P.D.), (b) resolver indexación
SEO (el grifo de tráfico), (c) Javier activando su red personal directamente. Lanzar antes de eso
quema el "one shot" de Product Hunt.

### Checklist pre-lanzamiento (cuando haya audiencia)
- [ ] Waitlist ≥100 emails reales
- [ ] Confirmar thumbnail/hero final (sin "14 tools")
- [ ] Confirmar los 6 screenshots de galería subidos
- [ ] Hunter con alcance conseguido (o auto-hunt asumido)
- [ ] Fecha martes–jueves fijada, Javier libre todo el día
- [ ] `expires_at` 48h en LAUNCH50 puesto la mañana del lanzamiento
- [ ] Disparar `/api/waitlist/send-launch { phUrl, couponCode: "LAUNCH50" }` a las 09:01
- [ ] Red personal + creadores del outreach avisados
- [ ] Show HN + post en IndieHackers (cuenta personal de Javier) preparados
