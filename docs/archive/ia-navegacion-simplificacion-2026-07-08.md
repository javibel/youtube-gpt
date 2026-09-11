# Arquitectura de información — simplificar navegación antes de Fase 8

Spec 1/3 de la ventana Fable 5 (2026-07-08). Objetivo: definir cómo se agrupan las herramientas en el dashboard para que no se sienta abrumador, y encajar ahí las 10 features de Fase 8 en vez de limitarse a añadirlas al final de una lista plana.

## 1. Estado actual (verificado en código, no en memoria)

`components/Sidebar.tsx:22-76` — array `SECTIONS` estático, sin lógica de plan (Free/Pro/Business ven exactamente el mismo menú):

| Sección | Items | Nº |
|---|---|---|
| Principal | Dashboard, Analytics, AI Coach `PRO`, Logros | 4 |
| Crear | Generar, Bulk, Calendario, A/B Test | 4 |
| Investigar | Keywords, Tendencias, Competidores | 3 |
| Optimizar | SEO Score, Optimizar, Thumbnails, Retención | 4 |
| Canal | Suscriptores, Ingresos, Auditoría, Mejor hora, Predictor | 5 |
| Cuenta | Perfil, Equipo, Aprender | 3 |

23 entradas en 6 secciones (~20 herramientas propiamente dichas más Dashboard, Perfil y afines). Fuera del sidebar hay además: `/tools` (página pública de marketing, con su propio listado — ya inconsistente, ver §6), `/embed`, `/extension`, `/gear`, y 5 calculadoras SEO standalone.

**Cómo se gatean los planes hoy:** no en el nav — cada API/página aplica el límite (`lib/plans.ts`, 46 ficheros) y pinta un bloque de upsell "Función exclusiva Pro" in-page (`app/dashboard/page.tsx:~1485`). Solo Coach lleva badge visual en el menú; el resto de límites son invisibles hasta que el usuario ya está dentro. Esto es coherente con la marca (nada oculto, sin sorpresas) pero es la única señal — no hay badge en Auditoría, Predictor, Bulk, Equipo, aunque también tienen límites de plan.

**Recomendación contextual actual:** solo existe para generación de contenido — "Ideas para hoy" / "Tip del día" en el dashboard (`app/dashboard/page.tsx:~1504-1533`), alimentado por `/api/daily-ideas`. No hay ninguna señal que dirija al usuario hacia Retención, Auditoría, Competidores, etc. según su situación real.

## 2. El problema que resuelve este documento

Si Fase 8 (`project_roadmap_vidiq.md` §Fase 8) se añade tal cual a las secciones existentes por afinidad temática:

- **Investigar** pasaría de 3 a 6 (Keywords, Tendencias, Competidores, + Outlier Detector F8.1, Content Gap Finder F8.4, Niche Scanner F8.6)
- **Optimizar** pasaría de 4 a 5-6 (+ Bulk Optimizer F8.2, Thumbnail CTR Predictor F8.3)
- **Canal** ya tiene 5, la sección más cargada hoy

Total: de 20 a 30 items de herramienta, con dos secciones en 6+. Ese es exactamente el escenario de saturación que Javier quiere evitar — y es mucho más barato resolverlo ahora, en el papel, que reorganizar después de que 10 páginas nuevas ya tengan rutas, analytics y hábitos de usuario atados a ellas.

## 3. Principio de diseño

Se descarta un árbol jerárquico (categoría → subcategoría → herramienta): obliga al usuario a saber de antemano en qué rama vive su problema, que es la carga cognitiva que se quiere quitar, no añadir. Se descarta también el gating agresivo (ocultar herramientas Pro del todo): contradice la política de transparencia radical ya establecida en la marca.

Dos movimientos, en este orden de prioridad:

**A. No todo lo que está en el roadmap de Fase 8 merece una fila nueva en el sidebar.** Varias features son una *capacidad nueva dentro de una página que ya existe*, no una página nueva:

| Feature Fase 8 | Tratamiento propuesto | Por qué |
|---|---|---|
| F8.3 Thumbnail CTR Predictor | Fusionar en `/thumbnail-preview` (pestaña o sección nueva) | Ya existe una página de thumbnails; el usuario no debería tener que decidir entre dos |
| F8.5 Velocity Analytics | Fusionar en `/predictor` o `/analytics` | Es una vista temporal de datos que ya se muestran en esas páginas |
| F8.8 Script Hook Analyzer | Fusionar en el flujo de `/generate` (paso "revisar hook") | Complementa la generación, no es un destino en sí mismo |
| F8.2 Bulk Optimizer | Fusionar en `/optimize` (modo "seleccionar varios") | Ya existe "Optimizar"; bulk es un modo de esa misma tarea, no una tarea distinta |
| F8.10 Agency Lite | Extender `/team` (multi-canal + export PDF) | Ya existe la página de equipo |
| F8.9 Extension v1.4+ | Fuera de este doc | Es roadmap de extensión, no del sidebar web; lo grueso ya se entregó en v2.x, el resto va al spec de extensión v2.6 |

**B. Lo que sí es genuinamente nuevo se agrupa en una sola entrada, no en cuatro.** F8.1 (Outlier Detector), F8.4 (Content Gap Finder), F8.6 (Niche Scanner) y F8.7 (Viral Ideas Database) son las únicas features de Fase 8 sin página existente donde encajar — pero las cuatro responden a la misma pregunta del usuario ("¿qué está funcionando que yo no estoy haciendo?"). Se agrupan en **una** página nueva `/discover` con 4 pestañas (Outliers / Gaps / Nicho / Ideas) en vez de 4 filas nuevas en el menú.

Resultado neto: Fase 8 completa añade **1 página nueva** al sidebar, no 10.

## 4. Taxonomía propuesta

| Sección | Items (nuevo en negrita) | Nº |
|---|---|---|
| Principal | Dashboard, Analytics, AI Coach `PRO`, Logros | 4 |
| Crear | Generar (+hook analyzer integrado), Bulk, Calendario, A/B Test | 4 |
| Investigar | Keywords, Tendencias, Competidores, **Descubrir** (`/discover`, F8.1+F8.4+F8.6+F8.7) | 4 |
| Optimizar | SEO Score, Optimizar (+modo bulk), Thumbnails (+CTR predictor), Retención | 4 |
| Canal | Suscriptores, Ingresos, Auditoría, Mejor hora, Predictor (+velocity) | 5 |
| Cuenta | Perfil, Equipo (+agency lite), Aprender | 3 |

24 entradas totales (23 actuales + 1 Descubrir con 4 subtools; el resto de Fase 8 son capacidades fusionadas en 5 páginas existentes), ninguna sección por encima de 5. Encaja sin romper el patrón mental que el usuario ya tiene (las secciones existentes son, de hecho, ya un flujo de trabajo: Investigar → Crear → Optimizar → Canal, aunque nunca se nombró así explícitamente).

## 5. Badges de plan — consistencia

Aplicar el mismo patrón que ya existe para Coach (`badge: 'PRO'` en `NavItem`) a **todo** item cuyo límite de plan sea 0 o muy bajo en Free, según `lib/plans.ts` — mínimamente: Bulk, Auditoría, Equipo, Predictor, y (nuevo) Descubrir si se lanza Pro-only. Coste de implementación: trivial (es un campo que ya existe en la interfaz `NavItem`, solo falta poblarlo consistentemente). No es parte del "congelar producto" en sentido estricto — es corregir una inconsistencia visual ya presente, se puede aplicar cuando se desee sin esperar a Fase 8.

## 6. Relacionado — arreglar antes de que crezca más

`/tools` (página pública, `components/ToolsContent.tsx`) mantiene su propio listado desconectado del sidebar real, y el copy "14 herramientas" está hardcodeado en `app/terms`, `app/legal`, `app/features/learning-hub/[slug]`, y varios artículos de blog (`lib/blog-data.ts`) — visto ya en `project_tools_page_discoverability.md` y `revision-estrategica-negocio-2026-07-07.md` como deuda pendiente. Con la taxonomía de este documento el número real deja de ser una cifra fija fácil de mantener (depende de cuánto se cuenta como "herramienta" independiente vs. capacidad dentro de otra). Recomendación: sustituir el número fijo por lenguaje que no dependa de contarlas ("todas las herramientas que necesitas", "todo en un plan") — decisión de copy, no técnica, pendiente de Javier.

## 7. Recomendación contextual generalizada (idea abierta, no bloqueante)

Generalizar el widget "Ideas para hoy" a un "Siguiente acción" que no se limite a generación de contenido, cruzando señales que la app ya calcula: retención cayendo → sugerir Retención; 30+ días sin Auditoría → sugerirla; SEO Score bajo en el último vídeo → sugerir Optimizar. No requiere modelo de datos nuevo, solo un orquestador que lea señales ya existentes (`/api/daily-ideas`, `/api/retention`, etc.) y elija una. Se deja como idea para spec aparte si Javier quiere profundizar — no es prerrequisito de lo anterior.

## 8. Alcance de implementación (para cuando se decida ejecutar)

Bajo coste: reestructurar el array `SECTIONS` (un fichero), crear 1 página nueva (`/discover`, con 3 pestañas reutilizando lógica ya escrita para F8.1/F8.4/F8.6 cuando se especifiquen), y añadir pestañas/secciones dentro de 4 páginas existentes en vez de crear rutas nuevas. Cero migración de datos, cero cambio de URLs existentes.

## 9. Decisiones (resueltas 08/07, delegadas por Javier)

- **Fusión de F8.2/F8.3/F8.5/F8.8/F8.10 en páginas existentes: SÍ.** Es la tesis del documento; el marketing puede seguir promocionando cada capacidad individualmente (una landing/blog post por capacidad no exige una ruta de dashboard propia).
- **Nombre de `/discover`: "Descubrir" / "Discover".** Verbo de acción, coherente con el tono del resto del menú.
- **"Siguiente acción" (§7): POSPUESTO.** No entra en la ventana de 3 días — las prioridades son el spec de Fase 8 y el de la extensión. Queda como candidato natural para la siguiente tanda de specs.
