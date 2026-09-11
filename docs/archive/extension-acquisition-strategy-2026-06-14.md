# G2 — Estrategia de adquisición orgánica de la extensión (2026-06-14)

Cómo llegar a 100 → 1.000 → 10.000 instalaciones. ASO para Chrome Web Store + canales. Estado
actual: ~5 instalaciones. ID CWS: gkjecjfhdmfbhhcemcjdkjkcdbljkcfh.

---

## El cuello de botella (leer primero)

El crecimiento orgánico de instalaciones depende de dos motores que HOY no funcionan:
1. **Búsqueda orgánica de CWS** — rankea por rating + nº de reviews + velocidad de instalación.
   Con ~5 usuarios y casi sin reviews, no rankeamos. Es un chicken-and-egg.
2. **Tráfico web → store** — depende del SEO del sitio, que está 0% indexado.

Por eso la **fase 1 (0→100) tiene que salir de canales PROPIOS** (CTAs en el sitio, usuarios
actuales, email, red de Javier), no de descubrimiento orgánico. El orgánico se enciende en fase 2-3
cuando ya hay reviews y algo de base instalada.

---

## ASO (Chrome Web Store) — palancas por impacto

1. **Título** (factor #1 del buscador de CWS): ya optimizado en C1 con keywords
   ("YTubViral: YouTube SEO, Analytics & AI Tools"). ✓
2. **Reviews & rating** (la palanca temprana MÁS importante y la que falta): CWS pondera mucho el
   nº de reseñas y la nota. Tenemos ~5 instalaciones y casi ninguna review. SIN reviews falsas
   (regla de marca). → Necesitamos un **flujo de recogida de reviews genuinas**: prompt suave
   dentro de la extensión tras N usos exitosos (ej: tras abrir el scorecard 5 veces) que enlace a
   la página de reseña de CWS, o email a usuarios activos. ESTE es el quick win de ASO #1.
3. **Velocidad de instalación + baja desinstalación**: CWS premia crecimiento + retención. Las
   mejoras de C2/C3 (valor sin login, upload page, VPH reciente) reducen desinstalaciones. ✓
4. **Descripción con keywords** (C1/C3): cubre "youtube seo / analytics / tools". ✓
5. **Screenshots** (5 piezas, plan de C1): subir al actualizar.
6. **Categoría + locale ES** (C1): verificar categoría correcta + listing ES.

---

## Canales por fase

### Fase 1 — 0 → 100 (canales PROPIOS, sin motor orgánico aún)
- **CTA "Add to Chrome" en las páginas de ALTA INTENCIÓN** ← el mayor gap actual. Hoy el CTA solo
  está en el dashboard (logueado) y en `/extension`. Falta en:
  - `/seo-score` (tras mostrar el resultado: "consigue esto en CADA vídeo de YouTube, gratis")
  - `/trends`, landing (hero/sección), y al final de los posts del blog.
  Un visitante que usa el SEO Score gratis es el candidato PERFECTO para instalar — y no se le pide.
- **Email a usuarios actuales (~12) + waitlist** → instalar.
- **Hacer `/extension` descubrible**: link en nav/footer (hoy existe pero no se enlaza prominente).
- **Red personal de Javier + comunidades de makers** (IndieHackers, su cuenta) — "built a free
  YouTube SEO extension".
- **Quora** (ya activo): respuestas que enlacen a `/extension`.

### Fase 2 — 100 → 1.000 (flywheel de reviews + momentum)
- **Flywheel de reviews**: con 100 usuarios, el prompt de review genera nº de reseñas → sube el
  ranking de CWS → descubrimiento orgánico en la store. Es el punto de inflexión.
- **Product Hunt**: la extensión como héroe del lanzamiento (assets listos, ver G3).
- **Contenido SEO comparativo** ("vidiq alternative free", "youtube seo chrome extension",
  "free youtube seo tool") → landing `/extension`. OJO: requiere resolver indexación (SEO 0%).
- **Posts comparativos del blog** (ya existen tubebuddy-vs-vidiq, vidiq-alternative).

### Fase 3 — 1.000 → 10.000 (orgánico compuesto)
- **Dominio en búsqueda de CWS** para queries de alto volumen ("youtube seo", "youtube tools") —
  requiere el rating + base instalada de las fases 1-2.
- **Partnerships con micro-creadores** del nicho educación-YouTube (reseñas, menciones).
- **Motor de contenido sostenido**: blog + canal de YouTube propio (Learning Hub).
- **Boca a boca**: el producto tiene que ser pegajoso — C2/C3 ayudan (valor inmediato).

---

## Quick wins implementables (los 2 de mayor ROI)

1. **CTA "Add to Chrome" en las free tools públicas** (`/seo-score`, `/trends`) + landing + blog —
   captura al visitante de alta intención donde HOY no se le pide. Detecta si ya está instalada
   (ExtensionDetector existe) para no mostrarlo a quien ya la tiene.
2. **Flujo de recogida de reviews genuinas** (in-extension, tras N usos): el lever de ASO #1.
   Sin reviews no hay ranking orgánico. Sin falsas (regla de marca).

Ambos son baratos y atacan directamente el chicken-and-egg. El resto (PH, SEO, partnerships) es
fase 2-3 y depende de resolver el tráfico (indexación) primero.

---

## Métrica y meta
- Instrumentar `utm_source=extension-cta` en los links de instalación por página → saber qué
  página convierte a instalación.
- Meta fase 1: 100 instalaciones reales vía canales propios en 4-6 semanas. Si no se llega, el
  cuello es tráfico (SEO) — mismo bottleneck que la waitlist (J2).
