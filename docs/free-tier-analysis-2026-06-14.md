# H1 — ¿Tier gratuito más generoso (estilo OutlierKit) o free limitado? (2026-06-14)

Análisis con números. NO es una decisión de pricing (línea roja — la decide Javier); es el análisis
para tomarla.

---

## Datos actuales (de funnel-optimizer + código)

- Usuarios: **15 total**, +3 esta semana, +6 este mes. Activación 60% (9/15).
- Suscriptores de pago: **1 activo** (0 nuevos, 0 bajas esta semana). Revenue ≈ **10 €/mes**.
- Conversión free→pago: **~7%** (1/15) — muestra MINÚSCULA, baja confianza.
- Retención: 1 activo esta semana (de 3 la previa). Waitlist: 0. Rating: 5.0 (12 reseñas).
- Free actual: límite DIARIO de generaciones (brief: 3/día) + tools de datos (SEO Score, Trends)
  gratis SIN registro. Pro 9,99 €/mes, Business 29,99 €/mes.
- Coste de generación IA: `claude-sonnet-4-6`, 2048/8192 tokens → **~$0.02–0.05 por generación**
  (con prompt caching activo). Las tools de DATOS (SEO Score, keywords, trends, competidor) usan
  YouTube API → coste casi nulo.

---

## El insight decisivo: nuestro free NO es como el de OutlierKit

OutlierKit puede permitirse un free generoso porque su valor es **research/datos** (YouTube API +
su BD) — barato de servir. **Nuestro valor central es generación con IA (Claude), que cuesta dinero
por uso.** Un free generoso EN GENERACIÓN = coste de API ilimitado sin ingreso, sobre un negocio
bootstrapped que hace ~10 €/mes. No es la misma ecuación.

→ La pregunta correcta NO es "free generoso sí/no", sino **"generoso ¿en qué?"**: generoso en lo
BARATO (datos), limitado en lo CARO (generación IA).

---

## Escenarios con números (asunciones explícitas, baja confianza por muestra pequeña)

Asumimos: coste medio gen ≈ $0.03; Pro 9,99 €/mes (~$10.7); LTV Pro a ~6 meses retención ≈ ~60 €.

### Escenario A — Free LIMITADO (actual)
- Top-of-funnel: menor (fricción del límite). ~6 signups/mes hoy.
- Conversión: mayor presión (topas el límite → upgrade). ~7–11%.
- Coste por free activo: acotado. Tope 3/día×30 = 90 gen/mes × $0.03 = **$2.7/mes** si lo exprime
  (la mayoría no — realista ~10-20 gen/mes = $0.3–0.6/mes).
- Riesgo: la fricción tapa el embudo arriba (pero el embudo HOY está tapado por falta de tráfico,
  no por el límite).

### Escenario B — Free GENEROSO en generación (estilo plan gratis de OutlierKit)
- Top-of-funnel: mayor (menos fricción) — PERO solo ayuda si hay tráfico que convertir (no lo hay).
- Conversión: MENOR (el free satisface, menos presión de upgrade).
- Coste: **ILIMITADO en API**. 100 free × ~$1–3/mes = **$100–300/mes** de Claude con $0 de ingreso.
  A 7% conversión: 100 free → 7 pago = ~70 €/mes vs $100–300 de coste = **NETO NEGATIVO** salvo
  retención/LTV altísimos. No sostenible bootstrapped.

### Escenario C — Híbrido (RECOMENDADO para analizar): generoso en datos, limitado en IA
- Datos (SEO Score, keywords, trends, competidor): **ilimitado y sin registro** (ya casi lo es) —
  coste ~0, máximo gancho de adquisición, iguala la accesibilidad de OutlierKit donde es barato.
- Generación IA: **limitada** (diaria) en free; ilimitada/alta en Pro. Protege el margen.
- Es lo que YA hacemos en gran parte. El ajuste sería comunicarlo mejor ("herramientas de datos
  gratis ilimitadas") y, si acaso, subir un poco el límite diario de IA (1→3→5) midiendo coste.

---

## CAC y LTV — la verdad incómoda

- **CAC**: hoy ~0 marginal (orgánico/outreach, sin ads) PERO la adquisición orgánica está rota
  (SEO 0% convertido a indexación útil, social Reddit muerto). Un free más generoso **no baja el
  CAC si no hay tráfico** que entre. El cuello no es el tier, es el TRÁFICO (mismo bottleneck que
  J2/G2/SEO).
- **LTV**: 1 solo pagador → no se puede calcular retención con fiabilidad. Pro 9,99 €/mes; si
  retiene ~6 meses, LTV ~60 €. Dato a vigilar, no a apostar todavía.

---

## Recomendación (para decisión de Javier — no implemento pricing)

1. **NO** un free generoso EN GENERACIÓN: quemaría API sin ingreso, insostenible bootstrapped.
2. **SÍ** mantener/comunicar el free generoso EN DATOS (ya lo es) — gancho de adquisición barato
   que iguala a OutlierKit donde no nos cuesta.
3. El problema NO es la generosidad del tier — es el **tráfico**. Cambiar el tier antes de arreglar
   la adquisición es optimizar el embudo sin gente dentro.
4. Si se quiere experimentar: subir el límite DIARIO de IA gratis de 3→5 y medir 4 semanas
   (coste API vs nuevos signups/conversión). Reversible y acotado. Decisión de pricing → Javier.
5. NO replicar el modelo de OutlierKit por miedo competitivo — su estructura de coste es distinta.

## Lo que NO hacer
- NO bajar precios ni crear un free ilimitado reactivo (insostenible + decisión de Javier).
- NO asumir que un free generoso resuelve la adquisición — el dato dice que el cuello es tráfico.
