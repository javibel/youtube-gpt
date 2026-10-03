# Parche local de dependencias — 03/10/2026

La copia independiente fija Next.js 16.3.6 y el override Undici 6.28.1.
Son las primeras versiones corregidas de estas ramas para
[GHSA-vcvr-r3jv-pc5j](https://github.com/vercel/next.js/security/advisories/GHSA-vcvr-r3jv-pc5j)
y [GHSA-3wwx-pv8p-q78v](https://github.com/nodejs/undici/security/advisories/GHSA-3wwx-pv8p-q78v).
La resolución se obtuvo del registro público con configuración npm vacía,
entorno heredado eliminado, scripts de instalación, audit y fund desactivados.
No se ejecutó npm audit fix, ningún proveedor ni un despliegue.

El lockfile mantiene las versiones restantes. Next actualiza sus ocho paquetes
SWC y @next/env junto al framework. Su rango opcional sharp pasa a ^0.35.4;
la versión existente satisface ese rango. npm también materializa seis entradas
inBundle opcionales bajo @tailwindcss/oxide-wasm32-wasi; no actualiza Tailwind.
Se conservan los hashes de integridad obtenidos del registro.

Antes de admitir el compilador nuevo en compile-policy.json se compararon
dist/build/index.js, dist/cli/next-build.js y dist/bin/next con los archivos
16.3.3 guardados fuera del repositorio. Las diferencias de estos tres archivos
son únicamente literales de versión. Los modos compile/generate y el retorno
antes de generación siguen iguales. La política fija ahora los hashes de esos
tres archivos además de instrumentación y configuración; no se relaja la guarda.
Los 14 casos nuevos prueban rechazo de versiones no revisadas, alteraciones,
overrides de modo y salida redirigida, sin ejecutar el compilador.

Esta preparación no acredita todos los advisories, versiones integradas en Node,
exposición concreta a ImageResponse/SVG o WebSocket, ni ausencia de explotación.
No modifica el despliegue activo y no cierra las alertas de producción. Una
aplicación operativa requiere autorización separada y verificación posterior.
