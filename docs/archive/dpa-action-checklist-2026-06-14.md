# Checklist de DPAs (Acuerdos de Encargado, RGPD Art. 28) — YTubViral

**Para: Javier. Versión 2026-06-14.** Acción que cierra el §6.1 del [RAT](rgpd-rat-art30-2026-06-14.md).
Enlaces verificados el 14/06/2026. Cada fila dice **qué tienes que hacer**: la mayoría de DPAs se
incorporan solos al aceptar los términos comerciales (no hay que firmar nada), pero conviene
**descargar y archivar una copia** (PDF) por si la AEPD la pide. Guárdalas todas en una carpeta
`docs/dpa/` o en Drive.

---

## Resumen ejecutivo

| Encargado | Estado del DPA | Tu acción | Esfuerzo |
|-----------|----------------|-----------|----------|
| **Anthropic** | Se incorpora al aceptar los **Commercial Terms** (API/de pago). NO aplica a Free/Pro consumer. | Confirmar que tu cuenta API está bajo *Commercial Terms* + archivar copia del DPA. | 10 min |
| **Vercel** | DPA self-serve, incorporado a los términos. | Descargar PDF y archivar. | 2 min |
| **Neon** | DPA incorporado; además **descargable y firmable** aparte. | Descargar (y firmar si quieres copia ejecutada). | 5 min |
| **Resend** | DPA incorporado a los términos. | Descargar y archivar. | 2 min |
| **Stripe** | DPA forma parte del Services Agreement (automático). | Descargar y archivar. | 2 min |
| **Google / YouTube** | Cloud DPA (CDPA) + Google API Services User Data Policy. | Revisar/aceptar CDPA; confirmar cumplimiento de la User Data Policy. | 15 min |
| **Cloudflare** | DPA incluido en el Self-Serve Subscription Agreement. | Descargar PDF y archivar. | 2 min |
| **Ideogram** | ⚠️ **NO ofrece DPA y se declara *responsable* (controller), no encargado.** | Decisión (ver abajo) — es el único gap real. | 20 min |

---

## Detalle y enlaces directos

### 1. Anthropic (Claude — el encargado más crítico)
- **Cómo funciona**: Anthropic NO te hace firmar un PDF aparte. El DPA (con SCC, art. 28) se
  **incorpora automáticamente cuando aceptas los Commercial Terms of Service** — y los aceptas al
  usar la **API de pago** o Claude for Work. **NO** cubre los productos consumer (Claude Free/Pro
  personales).
- **Tu acción**: como YTubViral consume la **API** (de pago), ya estás bajo Commercial Terms → el
  DPA aplica. Solo tienes que (a) confirmarlo en tu cuenta de la consola y (b) **descargar/guardar
  una copia** del DPA para el archivo.
- **Enlace**: artículo oficial "How do I view and sign your DPA" → https://privacy.claude.com/en/articles/7996862-how-do-i-view-and-sign-your-data-processing-addendum-dpa
- **Nota**: verifica que la cuenta de facturación de la API sea la de la empresa (no una personal),
  para que el DPA quede a nombre del responsable correcto.

### 2. Vercel (hosting)
- DPA self-serve, ya incorporado. **Descarga el PDF**: https://vercel.com/legal/dpa
- Usa SCC de la UE + UK Addendum para transferencias fuera del EEE.

### 3. Neon (base de datos PostgreSQL)
- DPA embebido en los términos **y** descargable/firmable por separado: https://neon.com/dpa
- Usa Data Privacy Framework + SCC (Módulo 2 controller / Módulo 3 processor).
- **Acción**: descarga el PDF; opcionalmente fírmalo para tener copia ejecutada.

### 4. Resend (email)
- DPA incorporado a los términos: https://resend.com/legal/dpa
- SCC UE (Decisión 2021/914). **Acción**: descarga y archiva.

### 5. Stripe (pagos)
- DPA forma parte del Stripe Services Agreement (automático al tener cuenta): https://stripe.com/legal/dpa
- FAQs: https://stripe.com/legal/dpa/faqs · SCC + UK IDTA incluidos. **Acción**: descarga y archiva.

### 6. Google / YouTube (OAuth + YouTube Data API)
- Cloud Data Processing Addendum (CDPA): https://cloud.google.com/terms/data-processing-addendum
- **OJO**: el uso de la **YouTube Data API** se rige además por la *Google API Services User Data
  Policy* (la que ya citas en tu Privacy Policy). El CDPA aplica a Google como encargado; revisa
  con el abogado si para YouTube API basta con la aceptación estándar de los términos de la API o
  hace falta aceptar el CDPA explícitamente en la consola de Google Cloud.
- **Acción**: revisar/aceptar CDPA en la consola + confirmar que sigues cumpliendo la User Data
  Policy (disclosure + scopes mínimos — ya cubierto en D2/D3).

### 7. Cloudflare (DNS + Email Routing)
- DPA incluido en el Self-Serve Subscription Agreement: https://www.cloudflare.com/cloudflare-customer-dpa/
- Customer = controller, Cloudflare = processor. **Acción**: descarga el PDF y archiva.

### 8. Ideogram (miniaturas) — ⚠️ ÚNICO GAP REAL
- **Hallazgo (14/06)**: la Privacy Policy de Ideogram **no menciona DPA ni términos de encargado
  del art. 28**, y se declara expresamente **data controller**, no procesador por cuenta tuya.
- **Implicación**: ahora mismo NO tienes una base art. 28 con Ideogram. El riesgo real es BAJO
  porque las miniaturas se generan desde *prompts de texto* (el usuario describe la imagen) y no
  envías datos personales identificativos de tus usuarios a Ideogram. Pero formalmente queda
  fuera de cobertura.
- **Opciones** (decisión de Javier, no la tomo yo):
  1. **Escribir a Ideogram** pidiendo su DPA / términos de encargado (contacto en su Privacy Policy).
  2. **Documentar el análisis de "sin datos personales"**: dejar por escrito que a Ideogram solo
     se le envían prompts no identificativos → no hay tratamiento de datos personales de usuarios
     → no se requiere DPA. (Probablemente lo más realista a esta escala; que lo valide el abogado.)
  3. **Evaluar alternativa** con DPA claro si en el futuro se enviaran datos sensibles.

---

## Lo que NO puedo hacer yo (requiere tu cuenta)
- Iniciar sesión y aceptar/descargar cada DPA (son tus credenciales).
- Firmar (Neon, si quieres copia ejecutada).
- Escribir a Ideogram desde tu email corporativo.
- Decidir la opción de Ideogram (línea de negocio/legal).

## Lo que ya está hecho
- Enlaces verificados y la mecánica de cada proveedor (este documento).
- RAT actualizado: la fila de Ideogram en §2 y el §6 reflejan el hallazgo de hoy.
