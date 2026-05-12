# Troubleshooting General — Indice Maestro

ANTES de depurar cualquier problema, buscar primero en el troubleshoot parcial correspondiente.
Si el problema ya se resolvio antes, aplicar la solucion directamente sin perder tiempo depurando de nuevo.

---

## Troubleshootings por area

| Area | Archivo | Agentes que lo usan |
|------|---------|---------------------|
| Browser / Puppeteer / Chrome profiles | [troubleshoot-browser.md](troubleshoot-browser.md) | twitter.js, facebook.js, linkedin.js, reddit.js, browser.js, login-persona.js, persona-runner.js |
| Deploy / Vercel / Env vars | [troubleshoot-deploy.md](troubleshoot-deploy.md) | (app Next.js en Vercel) |
| Imagenes / Sharp | [troubleshoot-images.md](troubleshoot-images.md) | (procesamiento de imagenes de productos) |
| Infraestructura / Cloudflare / Legal | [troubleshoot-infra.md](troubleshoot-infra.md) | guardian.js, manager.js, watchdog.js |

---

## Reglas generales

1. **Consultar el parcial ANTES de depurar** — Si el problema ya tiene solucion documentada, aplicarla directamente.
2. **Anadir problemas nuevos** — Al resolver un problema nuevo, anadirlo al troubleshoot parcial correspondiente.
3. **Formato consistente** — Cada entrada: titulo del problema, descripcion breve, `**Solucion:**` con pasos concretos.
4. **Fechas en soluciones** — Incluir fecha cuando la solucion implica un cambio de codigo (ej. "Solucion (2026-05-12)").

---

## Resumen rapido de problemas criticos

- **Sesiones Twitter caen**: Ver troubleshoot-browser.md, seccion "Procedimiento completo para restaurar sesion Twitter"
- **Deploy falla en Vercel**: Ver troubleshoot-deploy.md
- **Web no carga en Espana**: Ver troubleshoot-infra.md, seccion "LaLiga bloquea IPs Cloudflare"
- **Webhook Stripe no funciona**: Ver troubleshoot-deploy.md, seccion "STRIPE_WEBHOOK_SECRET"
