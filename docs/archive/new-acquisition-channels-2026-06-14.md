# H3 — Nuevos canales de adquisición (2026-06-14)

Evaluación de YouTube propio, partnerships con creadores, programa de afiliados y embeds/widgets.
Filtro: el check de indexación (14/06) probó que el cuello es AUTORIDAD DE DOMINIO (backlinks) +
tráfico — así que se prioriza por cuánto construye autoridad × viabilidad para un solo fundador.

---

## Ranking (por ROI sobre el cuello real: autoridad/tráfico)

### 1. Embeds / widgets — EL MEJOR ROI (ya está construido, falta distribuir)
- **Estado**: YA EXISTE `/embed/seo-score` — un analizador SEO embebible "con una línea de HTML"
  (iframe, sin API key). Es decir: la infra está hecha.
- **Por qué es el #1**: cada web que lo embebe es un **backlink** + tráfico de marca — exactamente
  la señal de autoridad que falta para que Google indexe (el check 14/06: descubrimiento sube,
  indexación plana por falta de autoridad). Un widget útil y gratuito es una máquina de backlinks
  virales.
- **El gap es DISTRIBUCIÓN**: nadie sabe que existe. Acciones: promocionar `/embed` (blogs de
  creadores, foros, directorios de widgets), añadir un botón "Embed this" en /seo-score, y un
  backlink discreto "Powered by YTubViral" dentro del iframe (cada embed → un enlace).
- Esfuerzo: BAJO (promo + un par de mejoras al widget). Impacto en autoridad: ALTO.

### 2. Partnerships con creadores — alto valor, reutiliza infra de outreach
- **Por qué**: un creador de educación-YouTube que te menciona/reseña = backlink + acceso directo
  a tu audiencia objetivo. Doble win (autoridad + adquisición targeted).
- **Reutiliza**: el sistema de outreach por email (J1-J3) ya contacta creadores — ampliar el ask de
  "prueba Pro gratis" a "¿lo reseñas / lo mencionas?" para los que respondan bien. La cuenta
  personal de Javier en comunidades de makers también.
- Esfuerzo: MEDIO (relación, no escala sola). Impacto: ALTO y directo.

### 3. Canal de YouTube propio — alto valor, pero limitado por tiempo de Javier
- **Estado**: los guiones del Learning Hub YA existen (memoria: vídeo 1 "SEO Basics", guion 10min
  listo, pendiente grabar). Un canal que enseña SEO de YouTube = content marketing + autoridad +
  dogfooding (demostramos que sabemos de lo que vendemos).
- **El freno**: requiere que JAVIER grabe/produzca (on-camera, tiempo). No lo puede hacer Claude.
- Esfuerzo: ALTO (producción de vídeo). Impacto: ALTO pero lento. Recomendación: empezar con 1
  vídeo (el guion ya está) y medir; no es bloqueante para los canales 1 y 2.

### 4. Programa de afiliados (comisiones) — PREMATURO a esta escala
- **Estado**: hay scaffold de REFERIDOS en el schema (`User.referralCode`/`referredBy`) — refer-a-
  friend, no un programa de comisiones. /gear usa Amazon Associates (nosotros somos el afiliado).
- **Por qué prematuro**: con 1 suscriptor de pago y Pro a 9,99€, la comisión por referido es
  minúscula → incentivo débil para que alguien promueva. Un programa de afiliados brilla con
  VOLUMEN (cuando hay base de usuarios y LTV probado). Montar tracking + payouts ahora es coste sin
  retorno.
- Recomendación: NO ahora. Activar el referral GRATIS existente (referralCode → "trae un creador,
  ambos +X días de Pro") es más barato y encaja mejor a esta escala que comisiones en dinero.

---

## Recomendación priorizada
1. **Embeds/widgets**: promocionar `/embed` + "Powered by YTubViral" en el iframe + botón "Embed"
   en /seo-score. Máquina de backlinks, ya construida. HACER primero.
2. **Partnerships**: ampliar el outreach a un ask de reseña/mención para creadores receptivos.
3. **YouTube propio**: Javier graba el vídeo 1 (guion listo) — siembra, mide.
4. **Afiliados de comisión**: NO ahora; si acaso, activar el referral gratis (referralCode) primero.

Todos atacan el cuello correcto (autoridad/backlinks/tráfico), a diferencia de optimizar el embudo
sin gente dentro. El #1 (widget) es el único que es además código ya hecho → solo distribución.

## Quick wins implementables (sin tocar pricing)
- **"Powered by YTubViral" + botón "Embed this"**: convierte el widget existente en generador de
  backlinks. Bajo esfuerzo, ataca directamente la autoridad.
- **Activar el referral gratis** (referralCode ya en schema): mecánica "trae un creador" sin
  comisiones monetarias (días de Pro) — decisión de oferta, consultar a Javier.
