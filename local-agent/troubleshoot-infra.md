# Troubleshooting: Infraestructura (Cloudflare, DNS, Legal)

Consultar este archivo ANTES de depurar problemas de red, DNS, o configuracion de servicios externos.

---

## LaLiga bloquea IPs Cloudflare en ISPs espanoles
Durante partidos de futbol, el proxy de Cloudflare causa bloqueos porque LaLiga bloquea rangos de IPs de Cloudflare a nivel de ISP espanol.
**Solucion:** DNS-only permanente (sin proxy naranja) en Cloudflare. NUNCA activar el proxy naranja.

## NIF no publicado
Javier no esta dado de alta como autonomo. No publicar NIF en la web (footer, legal, etc.) hasta que se registre.
**Estado:** Pendiente de alta.
