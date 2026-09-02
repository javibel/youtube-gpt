# Auditoría de posts MANUALES del blog — cifras fabricadas y atribuciones falsas

Fecha: 2026-09-02
Fichero auditado: `lib/blog-data.ts` (UTF-8; acentos y `\'` son bytes reales)
Método: lectura completa del cuerpo ES **y** EN de cada post de la lista. NO se ha editado `lib/blog-data.ts`. Este documento es solo propuesta; un humano revisa antes de aplicar.

Criterios (heredados de `project_blog_fabricated_stats_audit.md`):
1. Número/%/multiplicador presentado como hallazgo de investigación sin fuente verificable.
2. Afirmación atribuida a una fuente con nombre (Backlinko, Briggsby, "datos de YouTube", "un estudio de X") que no se puede confirmar.
3. Investigación / "datos internos" / "pruebas internas" / "canales que analizamos" propios de YTubViral (NO existen; el único dataset real es el estudio de títulos N≈1.814/1.723).
4. Casos de estudio con nombre y cifras concretas que parecen inventados.
5. Precios / planes de competidores expresados como dato actual.

---

## Tabla resumen (post × nº de incidencias)

| Post | ES | EN | Total | Peor categoría |
|---|---:|---:|---:|---|
| herramientas-ia-para-youtubers-2026 | 1 | 1 | 2 | 5 |
| como-escribir-titulos-virales-youtube | 2 | 0 (limpio) | 2 | 2/1 |
| descripciones-seo-youtube-guia | 3 | 3 | 6 | 2 |
| cuanto-gana-un-youtuber-en-espana | 1 (baja) | 1 (baja) | 2 | 1 |
| setup-youtube-menos-500-euros | 0 | 0 | 0 | — LIMPIO |
| keyword-research-youtube-guia | 1 | 1 | 2 | 1 |
| ab-testing-youtube-titulos-guia | 2 | 2 | 4 | 5 |
| como-conseguir-suscriptores-youtube-2026 | 2 | 2 | 4 | 2/3 |
| como-analizar-competencia-youtube | 2 | 2 | 4 | 1/5 |
| thumbnails-youtube-guia-ctr | 6 | 6 | 12 | 1 |
| como-crear-scripts-youtube-con-ia | 1 | 1 | 2 | 2/1 |
| como-monetizar-youtube-2026-guia | 2 | 2 | 4 | 4 |
| youtube-neurodivergencia-guia | 1 | 1 | 2 | 2 |
| auditoria-canal-youtube-guia | 2 | 2 | 4 | 1 |
| tour-completo-ytubviral-14-herramientas | 1 | 1 | 2 | 3 |
| ideas-videos-youtube-no-se-que-subir | 0 | 0 | 0 | — LIMPIO |
| youtube-trending-videos-free-tool | 1 | 1 | 2 | 1 |
| **TOTAL** | **31** | **23** | **~54** | |

Incidencias únicas (contando ES+EN de la misma frase como 1): **~28**.
Posts limpios: `setup-youtube-menos-500-euros`, `ideas-videos-youtube-no-se-que-subir`. `como-escribir-titulos-virales-youtube` está limpio **solo en EN** (ya se corrigió en el barrido anterior); el ES quedó sin tocar.

---

## Detalle por incidencia

### thumbnails-youtube-guia-ctr  (PEOR OFENSOR — 6 por idioma)

**T1 · ES · categoría 1 (alta)**
Frase actual: `{ type: 'p', t: 'Esto no es opinión. El 90% de los vídeos con mejor rendimiento en YouTube usan miniaturas personalizadas. En 2026, YouTube mide lo que llaman "Quality CTR" — ya no basta con que hagan clic; si la gente hace clic y se va en los primeros 30 segundos, el algoritmo te penaliza. Tu miniatura tiene que atraer al espectador correcto, no a cualquiera.' }`
Propuesta: `{ type: 'p', t: 'Esto no es opinión. Casi todos los vídeos que rinden bien en YouTube usan miniatura personalizada, no un fotograma automático. En 2026, YouTube mide lo que llaman "Quality CTR" — ya no basta con que hagan clic; si la gente hace clic y se va en los primeros 30 segundos, el algoritmo te penaliza. Tu miniatura tiene que atraer al espectador correcto, no a cualquiera.' }`
Confianza: alta. (Es exactamente el mismo "90% según datos de YouTube" ya marcado en el post del generador `youtube-thumbnail-tips-beginners-guide`.)

**T2 · EN · categoría 1 (alta)**
Frase actual: `{ type: 'p', t: 'This isn\'t opinion. 90% of top-performing YouTube videos use custom thumbnails. In 2026, YouTube measures what they call "Quality CTR" — it\'s no longer enough to get clicks; if people click and leave within the first 30 seconds, the algorithm penalizes you. Your thumbnail needs to attract the right viewer, not just any viewer.' }`
Propuesta: `{ type: 'p', t: 'This isn\'t opinion. Almost every video that performs well on YouTube uses a custom thumbnail rather than an auto-generated frame. In 2026, YouTube measures what they call "Quality CTR" — it\'s no longer enough to get clicks; if people click and leave within the first 30 seconds, the algorithm penalizes you. Your thumbnail needs to attract the right viewer, not just any viewer.' }`
Confianza: alta.

**T3 · ES · categoría 1 (media-alta)**
Frase actual: `{ type: 'p', t: 'Pero ojo: el CTR varía por nicho. Gaming tiene un CTR medio del 8.5% porque la audiencia consume contenido de forma compulsiva. Educación ronda el 4.5% porque la gente busca algo específico y es más selectiva. No te compares con un nicho que no es el tuyo.' }`
Propuesta: `{ type: 'p', t: 'Pero ojo: el CTR varía mucho por nicho. En nichos de consumo compulsivo como gaming o entretenimiento, el CTR medio tiende a ser más alto; en nichos de búsqueda como educación o tutoriales, donde la gente ya sabe lo que quiere, suele ser más bajo. No te compares con un nicho que no es el tuyo.' }`
Confianza: media-alta.

**T4 · EN · categoría 1 (media-alta)**
Frase actual: `{ type: 'p', t: 'But here\'s the thing: CTR varies by niche. Gaming averages 8.5% because the audience consumes content compulsively. Education hovers around 4.5% because viewers are searching for something specific and are more selective. Don\'t compare yourself to a niche that isn\'t yours.' }`
Propuesta: `{ type: 'p', t: 'But here\'s the thing: CTR varies a lot by niche. In compulsive-consumption niches like gaming or entertainment the average CTR tends to run higher; in search-driven niches like education or tutorials, where viewers already know what they want, it tends to run lower. Don\'t compare yourself to a niche that isn\'t yours.' }`
Confianza: media-alta.

**T5 · ES · categoría 1 (alta)**
Frase actual: `{ type: 'p', t: 'Los datos son contundentes: las miniaturas con caras expresivas generan entre un 20% y un 42% más de clicks que las que no tienen rostros o usan expresiones neutras. El cerebro humano está programado para buscar caras — es instinto, no elección.' }`
Propuesta: `{ type: 'p', t: 'Las miniaturas con caras expresivas tienden a generar bastantes más clics que las que no tienen rostros o usan expresiones neutras. El cerebro humano está programado para buscar caras — es instinto, no elección.' }`
Confianza: alta.

**T6 · EN · categoría 1 (alta)**
Frase actual: `{ type: 'p', t: 'The data is conclusive: thumbnails with expressive faces generate 20% to 42% more clicks than those without faces or with neutral expressions. The human brain is wired to seek faces — it\'s instinct, not choice.' }`
Propuesta: `{ type: 'p', t: 'Thumbnails with expressive faces tend to generate noticeably more clicks than those without faces or with neutral expressions. The human brain is wired to seek faces — it\'s instinct, not choice.' }`
Confianza: alta.

**T7 · ES · categoría 1 (alta)**
Frase actual: `{ type: 'p', t: 'El 63% de las visualizaciones de YouTube son en móvil. En una pantalla de 6 pulgadas, tu miniatura mide menos de 2 centímetros de alto. Si metes 7 palabras, nadie va a leer ninguna. Los datos muestran que el 73% de los vídeos con mejor rendimiento usan entre 2 y 3 palabras en la miniatura.' }`
Propuesta: `{ type: 'p', t: 'La mayor parte de las visualizaciones de YouTube son en móvil. En una pantalla de 6 pulgadas, tu miniatura mide menos de 2 centímetros de alto. Si metes 7 palabras, nadie va a leer ninguna. Las miniaturas que mejor funcionan casi siempre usan dos o tres palabras como mucho.' }`
Confianza: alta (el "73%" es precisión inventada; el "63% móvil" es dato de dominio público pero conviene suavizar por coherencia).

**T8 · EN · categoría 1 (alta)**
Frase actual: `{ type: 'p', t: '63% of YouTube views happen on mobile. On a 6-inch screen, your thumbnail is less than an inch tall. If you cram 7 words in there, nobody will read any of them. Data shows that 73% of top-performing videos use between 2 and 3 words on their thumbnail.' }`
Propuesta: `{ type: 'p', t: 'Most YouTube views happen on mobile. On a 6-inch screen, your thumbnail is less than an inch tall. If you cram 7 words in there, nobody will read any of them. The thumbnails that perform best almost always use two or three words at most.' }`
Confianza: alta.

**T9 · ES · categoría 1 (alta)**
Frase actual: `{ type: 'p', t: 'Los datos sugieren que el rojo genera un 23% más de CTR que el azul, probablemente porque activa una sensación de urgencia. Pero el color importa menos que el contraste — un amarillo vibrante sobre negro funciona mejor que un rojo apagado sobre marrón.' }`
Propuesta: `{ type: 'p', t: 'Los colores cálidos y saturados como el rojo o el naranja suelen llamar más la atención que los fríos, probablemente porque activan una sensación de urgencia. Pero el color importa menos que el contraste — un amarillo vibrante sobre negro funciona mejor que un rojo apagado sobre marrón.' }`
Confianza: alta.

**T10 · EN · categoría 1 (alta)**
Frase actual: `{ type: 'p', t: 'Data suggests red generates 23% more CTR than blue, likely because it triggers a sense of urgency. But color matters less than contrast — a vibrant yellow on black works better than a muted red on brown.' }`
Propuesta: `{ type: 'p', t: 'Warm, saturated colors like red or orange tend to draw more attention than cool ones, likely because they trigger a sense of urgency. But color matters less than contrast — a vibrant yellow on black works better than a muted red on brown.' }`
Confianza: alta.

**T11 · ES · categoría 1 (media-alta)**
Frase actual: `{ type: 'p', t: 'Esto es un cambio radical. Antes tenías que adivinar qué miniatura funcionaba mejor. Ahora puedes probarlo con datos reales. Los creadores que hacen A/B testing consistentemente reportan mejoras de CTR del 15-30% en 3 meses.' }`
Propuesta: `{ type: 'p', t: 'Esto es un cambio radical. Antes tenías que adivinar qué miniatura funcionaba mejor. Ahora puedes probarlo con datos reales. Los creadores que hacen A/B testing de forma sistemática suelen mejorar su CTR de forma apreciable en pocos meses.' }`
Confianza: media-alta.

**T12 · EN · categoría 1 (media-alta)**
Frase actual: `{ type: 'p', t: 'This is a game changer. Before, you had to guess which thumbnail worked best. Now you can test it with real data. Creators who consistently A/B test report CTR improvements of 15-30% within 3 months.' }`
Propuesta: `{ type: 'p', t: 'This is a game changer. Before, you had to guess which thumbnail worked best. Now you can test it with real data. Creators who A/B test systematically usually see a meaningful CTR improvement within a few months.' }`
Confianza: media-alta.

Nota adicional (no contada, baja): en ambos idiomas la intro dice "respaldadas por datos" / "backed by data" sin fuente. Suavizar a "basadas en lo que funciona" si se toca el párrafo.

---

### descripciones-seo-youtube-guia

**D1 · ES · categoría 2 (alta)**
Frase actual: `{ type: 'p', t: 'Un estudio de Backlinko analizó más de un millón de vídeos de YouTube y descubrió que los vídeos con descripciones optimizadas tienen un 78% más de probabilidades de aparecer en la primera página de resultados.' }`
Problema: el estudio de Backlinko (1,3M de vídeos) existe, pero **NO** encontró ese "78%"; de hecho concluyó que la optimización de la descripción con keywords tiene poca correlación con el ranking (las señales que sí correlacionan son vistas, comentarios, likes, shares). Atribución falsa a fuente con nombre.
Propuesta: `{ type: 'p', t: 'Los grandes análisis de ranking en YouTube coinciden en que la descripción ayuda al algoritmo a entender de qué trata el vídeo y a mostrarlo en búsqueda y sugeridos, aunque pesa menos que las señales de engagement (vistas, comentarios, retención). Aun así, una descripción vacía es una oportunidad perdida de contexto y de SEO.' }`
Confianza: alta.

**D2 · EN · categoría 2 (alta)**
Frase actual: `{ type: 'p', t: 'A Backlinko study analyzed over one million YouTube videos and found that videos with optimized descriptions are 78% more likely to appear on the first page of results.' }`
Propuesta: `{ type: 'p', t: 'The large-scale YouTube ranking analyses agree that the description helps the algorithm understand what your video is about and surface it in search and suggested, even though it weighs less than engagement signals (views, comments, retention). Even so, an empty description is a missed opportunity for both context and SEO.' }`
Confianza: alta.

**D3 · ES · categoría 1 (media)**
Frase actual: `{ type: 'p', t: 'El 40% de los YouTubers principiantes publican sin descripción. Es un error gravísimo para el SEO que deja dinero encima de la mesa desde el primer día.' }`
Propuesta: `{ type: 'p', t: 'Muchísimos creadores principiantes publican sin descripción o con dos líneas genéricas. Es un error gravísimo para el SEO que deja dinero encima de la mesa desde el primer día.' }`
Confianza: media.

**D4 · EN · categoría 1 (media)**
Frase actual: `{ type: 'p', t: '40% of beginner YouTubers publish without a description. It\'s a massive SEO blunder that leaves money on the table from day one.' }`
Propuesta: `{ type: 'p', t: 'A huge share of beginner YouTubers publish with no description at all, or two generic lines. It\'s a massive SEO blunder that leaves money on the table from day one.' }`
Confianza: media.

**D5 · ES · categoría 1 (media-baja)**
Frase actual (lista "Las 10 Keywords más Buscadas en YouTube en Español"): `{ type: 'list', items: [ 'cómo monetizar youtube — 4.1K búsquedas/mes', 'shorts de youtube — 3.8K búsquedas/mes', 'cómo crecer en youtube — 3.2K búsquedas/mes', 'cómo ganar suscriptores — 2.8K búsquedas/mes', 'herramientas para youtubers — 2.4K búsquedas/mes', 'algoritmo de youtube — 1.5K búsquedas/mes', 'títulos para youtube — 1.2K búsquedas/mes', 'seo para youtube — 1.8K búsquedas/mes', 'descripciones para youtube — 800 búsquedas/mes', 'herramientas ia youtubers — 600 búsquedas/mes', ]}`
Problema: volúmenes de búsqueda concretos presentados como dato autoritativo sin fuente ni fecha.
Propuesta: quitar las cifras exactas y dejar el ranking cualitativo, o añadir "(volúmenes orientativos según nuestra herramienta de keyword research, {mes/año})". P. ej.: `'cómo monetizar youtube'`, `'shorts de youtube'`, `'cómo crecer en youtube'`... como lista simple ordenada por demanda.
Confianza: media-baja.

**D6 · EN · categoría 1 (media-baja)**
Frase actual (lista "Top 10 Most Searched Keywords on YouTube in English"): `{ type: 'list', items: [ 'how to monetize youtube — 33K searches/mo', 'youtube shorts — 27K searches/mo', 'how to grow on youtube — 18K searches/mo', 'how to get more subscribers — 14K searches/mo', 'best tools for youtubers — 9.9K searches/mo', 'youtube algorithm — 8.1K searches/mo', 'youtube title ideas — 6.6K searches/mo', 'youtube seo — 5.4K searches/mo', 'youtube description — 4.4K searches/mo', 'ai tools for youtube — 3.6K searches/mo', ]}`
Propuesta: igual que D5 — lista sin cifras exactas o con etiqueta de fuente/fecha.
Confianza: media-baja.

---

### como-escribir-titulos-virales-youtube  (ES sin corregir; EN ya limpio)

**TV1 · ES · categoría 2 + 1 (alta)**
Frase actual: `{ type: 'p', t: 'Según datos internos de YouTube, la diferencia entre un título mediocre y uno optimizado puede significar hasta un 300% más de visualizaciones con el mismo contenido.' }`
Problema: idéntico patrón al ya corregido en `7-frameworks-titulos-virales-youtube` EN ("According to YouTube's internal data… 300% more views"). "Datos internos de YouTube" + 300% inventado.
Propuesta: `{ type: 'p', t: 'La diferencia entre un título mediocre y uno bien trabajado puede transformar el rendimiento de un vídeo con exactamente el mismo contenido: mismo material, muchísimas más visualizaciones solo por cómo se presenta.' }`
Confianza: alta.
(Referencia: el EN de este mismo post ya se reescribió a `'A strong, specific title can dramatically outperform a vague one for the exact same video.'` — se puede espejar esa solución.)

**TV2 · ES · categoría 1 (media-alta)**
Frase actual (list item en "¿Por Qué el Título es tan Importante en YouTube?"): `'CTR (Click Through Rate): Un buen título puede multiplicar por 5 tus clics',`
Problema: multiplicador "x5" sin fuente. También ya corregido en el barrido anterior en otros posts ("multiply your clicks by 5x").
Propuesta: `'CTR (Click Through Rate): un buen título puede multiplicar tus clics respecto a uno genérico',`
Confianza: media-alta.

EN: **LIMPIO.** El párrafo equivalente dice `'A strong, specific title can dramatically outperform a vague one for the exact same video.'` y el list item `'CTR (Click Through Rate): a good title can lift your clicks substantially'`. Sin cifras inventadas.

---

### como-crear-scripts-youtube-con-ia

**S1 · ES · categoría 2 + 1 (alta)**
Frase actual: `{ type: 'callout', t: 'Los vídeos con estructura clara (hook → problema → contenido → CTA) tienen un 34% más de retención media que los que improvisan. No es opinión — es dato de YouTube Analytics.' }`
Problema: "34%" + atribución explícita a "YouTube Analytics". Doble ironía: el propio post dice más abajo "La IA inventa estadísticas con total confianza… Si no puedes encontrar la fuente, borra el número."
Propuesta: `{ type: 'callout', t: 'Los vídeos con estructura clara (hook → problema → contenido → CTA) retienen bastante mejor que los improvisados. La curva de retención de YouTube Analytics lo hace visible vídeo a vídeo: los que divagan al principio pierden audiencia justo ahí.' }`
Confianza: alta.

**S2 · EN · categoría 2 + 1 (alta)**
Frase actual: `{ type: 'callout', t: 'Videos with clear structure (hook → problem → content → CTA) have 34% higher average retention than improvised ones. That\'s not opinion — it\'s YouTube Analytics data.' }`
Propuesta: `{ type: 'callout', t: 'Videos with clear structure (hook → problem → content → CTA) retain noticeably better than improvised ones. YouTube Analytics\' retention curve makes it visible video by video: the ones that ramble up front lose the audience right there.' }`
Confianza: alta.

Nota (no contada): el ejemplo "73% of viewers prefer videos under 8 minutes" en el punto "No verificar datos" está bien — se usa deliberadamente como ejemplo de dato inventado que NO hay que poner.

---

### como-monetizar-youtube-2026-guia

**M1 · ES · categoría 4 (media-alta)**
Frase actual: `{ type: 'p', t: 'Ejemplo real: un canal dedicado exclusivamente a enseñar automatizaciones de IA para departamentos de recursos humanos. 8.000 suscriptores, RPM de anuncios de 12€ en España. Pero su verdadera monetización viene de consultoría (150€/hora), venta de plantillas (29€ cada una) y afiliación de software SaaS con comisiones recurrentes del 20-50% mensual. Con 5.000 visualizaciones al mes, factura más de 3.000€ mensuales.' }`
Problema: se etiqueta como "Ejemplo real" con cifras muy concretas (8.000 subs, 12€ RPM, 150€/h, 29€, 5.000 vistas/mes, +3.000€/mes) que leen como inventadas.
Propuesta: `{ type: 'p', t: 'Ejemplo ilustrativo: imagina un canal dedicado exclusivamente a enseñar automatizaciones de IA para departamentos de recursos humanos. Con unos pocos miles de suscriptores y un RPM de anuncios alto por el nicho, su verdadera monetización vendría de consultoría, venta de plantillas y afiliación de software SaaS con comisiones recurrentes. Aun con pocas visualizaciones al mes, la facturación puede superar con creces lo que da el AdSense de un canal de entretenimiento diez veces más grande.' }`
Confianza: media-alta.

**M2 · EN · categoría 4 (media-alta)**
Frase actual: `{ type: 'p', t: 'Real example: a channel dedicated exclusively to teaching AI automations for HR departments. 8,000 subscribers, ad RPM of €12 in Spain. But their real monetization comes from consulting (€150/hour), template sales (€29 each), and SaaS affiliate programs with 20-50% recurring monthly commissions. With 5,000 monthly views, they invoice over €3,000/month.' }`
Propuesta: `{ type: 'p', t: 'Illustrative example: picture a channel dedicated exclusively to teaching AI automations for HR departments. With a few thousand subscribers and a high ad RPM for the niche, its real monetization would come from consulting, template sales, and SaaS affiliate programs with recurring commissions. Even with modest monthly views, revenue can far exceed the AdSense of an entertainment channel ten times its size.' }`
Confianza: media-alta.

**M3 · ES · categoría 1 (media)**
Frase actual: `{ type: 'p', t: 'Todavía es pronto para tener datos definitivos sobre su impacto, pero los primeros indicadores muestran que los vídeos que entran en el ranking de Hype reciben entre un 30-50% más de impresiones que vídeos similares sin Hype. Si estás en España, actívalo y pide a tu comunidad que te impulse.' }`
Propuesta: `{ type: 'p', t: 'Todavía es pronto para tener datos definitivos sobre su impacto, pero la idea es precisamente darle a un vídeo una exposición algorítmica extra durante sus primeros días. Si estás en España, actívalo y pide a tu comunidad que te impulse.' }`
Confianza: media.

**M4 · EN · categoría 1 (media)**
Frase actual: `{ type: 'p', t: 'It\'s still early for definitive data on its impact, but initial indicators show that videos entering the Hype ranking receive 30-50% more impressions than similar videos without Hype. If you\'re in Spain, activate it and ask your community to boost you.' }`
Propuesta: `{ type: 'p', t: 'It\'s still early for definitive data on its impact, but the whole point is to give a video extra algorithmic exposure during its first days. If you\'re in Spain, activate it and ask your community to boost you.' }`
Confianza: media.

Nota (no contada, baja): la lista de programas de afiliados ("Amazon Associates: 1-10%… cookie de 24 horas", "Adobe Creative Cloud: hasta 85% del primer mes", "B&H Photo: 2-8%… cookie de 60 días") da términos de terceros como dato fijo. Amazon 1-10%/24h es correcto; los demás son plausibles pero caducan. Riesgo bajo; si se toca, añadir "(consulta condiciones actualizadas de cada programa)".

---

### ab-testing-youtube-titulos-guia

**AB1 · ES · categoría 1 (media)**
Frase actual: `{ type: 'p', t: 'La diferencia entre un título bueno y un título excelente puede ser un 30-50% más de CTR. En un vídeo con 100.000 impresiones, eso significa 3.000-5.000 clics extra. Y más clics significa más watch time, lo que hace que YouTube te recomiende más. Es un efecto compuesto.' }`
Propuesta: `{ type: 'p', t: 'La diferencia entre un título bueno y un título excelente puede suponer un salto grande de CTR. En un vídeo con 100.000 impresiones, unos pocos puntos de CTR son miles de clics extra. Y más clics significa más watch time, lo que hace que YouTube te recomiende más. Es un efecto compuesto.' }`
Confianza: media.

**AB2 · EN · categoría 1 (media)**
Frase actual: `{ type: 'p', t: 'The difference between a good title and a great title can be 30-50% more CTR. On a video with 100,000 impressions, that means 3,000-5,000 extra clicks. And more clicks means more watch time, which makes YouTube recommend you more. It\'s a compounding effect.' }`
Propuesta: `{ type: 'p', t: 'The difference between a good title and a great title can be a large jump in CTR. On a video with 100,000 impressions, a few points of CTR is thousands of extra clicks. And more clicks means more watch time, which makes YouTube recommend you more. It\'s a compounding effect.' }`
Confianza: media.

**AB3 · ES · categoría 5 (media)**
Frase actual: `{ type: 'p', t: 'La diferencia de precio es notable: TubeBuddy solo ofrece A/B testing en su plan Legend a $49/mes. YTubViral lo incluye en Pro a €9,99/mes.' }`
Problema: nombre de plan ("Legend") y precio ("$49/mes") de competidor como dato actual; caduca.
Propuesta: `{ type: 'p', t: 'La diferencia de precio es notable: en TubeBuddy el A/B testing está reservado a su plan de gama alta. YTubViral lo incluye en Pro a €9,99/mes.' }`
Confianza: media.

**AB4 · EN · categoría 5 (media)**
Frase actual: `{ type: 'p', t: 'The price difference is notable: TubeBuddy only offers A/B testing in their Legend plan at $49/month. YTubViral includes it in Pro at €9.99/month.' }`
Propuesta: `{ type: 'p', t: 'The price difference is notable: on TubeBuddy, A/B testing is reserved for its top-tier plan. YTubViral includes it in Pro at €9.99/month.' }`
Confianza: media.

Nota (no contada): "MrBeast ha dicho públicamente que cambia thumbnails… canal de 300M de suscriptores" — MrBeast sí lo ha dicho en público y la cifra de subs es aproximadamente correcta para 2026. No se marca.

---

### como-analizar-competencia-youtube

**C1 · ES · categoría 1 (media)**
Frase actual: `{ type: 'p', t: 'El 90% de los creadores pequeños nunca analizan a su competencia de forma sistemática. Publican lo que se les ocurre, eligen títulos "a ojo" y se frustran cuando un vídeo no despega. Mientras tanto, los canales que crecen rápido hacen exactamente lo contrario: estudian qué funciona antes de crear.' }`
Propuesta: `{ type: 'p', t: 'La gran mayoría de los creadores pequeños nunca analizan a su competencia de forma sistemática. Publican lo que se les ocurre, eligen títulos "a ojo" y se frustran cuando un vídeo no despega. Mientras tanto, los canales que crecen rápido hacen exactamente lo contrario: estudian qué funciona antes de crear.' }`
Confianza: media.

**C2 · EN · categoría 1 (media)**
Frase actual: `{ type: 'p', t: '90% of small creators never systematically analyze their competition. They publish whatever comes to mind, pick titles "by feel," and get frustrated when a video flops. Meanwhile, fast-growing channels do the exact opposite: they study what works before creating.' }`
Propuesta: `{ type: 'p', t: 'The vast majority of small creators never systematically analyze their competition. They publish whatever comes to mind, pick titles "by feel," and get frustrated when a video flops. Meanwhile, fast-growing channels do the exact opposite: they study what works before creating.' }`
Confianza: media.

**C3 · ES · categoría 5 (media)**
Frase actual: `{ type: 'h3', t: 'VidIQ / TubeBuddy (freemium, desde $7.50-$19/mes)' }` seguido de `{ type: 'p', t: 'Las herramientas más conocidas. Muestran tags de competidores, scores de SEO, y tendencias. El problema: las funciones realmente útiles están detrás de planes de pago caros, y muchos creadores pequeños no pueden justificar $19-49/mes.' }`
Problema: rangos de precio concretos de competidores como dato actual.
Propuesta: encabezado `{ type: 'h3', t: 'VidIQ / TubeBuddy (freemium con planes de pago)' }`; párrafo: `{ type: 'p', t: 'Las herramientas más conocidas. Muestran tags de competidores, scores de SEO, y tendencias. El problema: las funciones realmente útiles están detrás de planes de pago, y muchos creadores pequeños no pueden justificar la suscripción mensual.' }`
Confianza: media.

**C4 · EN · categoría 5 (media)**
Frase actual: `{ type: 'h3', t: 'VidIQ / TubeBuddy (freemium, from $7.50-$19/mo)' }` + `{ type: 'p', t: 'The most well-known tools. They show competitor tags, SEO scores, and trends. The problem: the truly useful features are behind expensive paid plans, and many small creators can\'t justify $19-49/month.' }`
Propuesta: encabezado `{ type: 'h3', t: 'VidIQ / TubeBuddy (freemium with paid plans)' }`; párrafo: `{ type: 'p', t: 'The most well-known tools. They show competitor tags, SEO scores, and trends. The problem: the truly useful features are behind paid plans, and many small creators can\'t justify the monthly subscription.' }`
Confianza: media.

---

### como-conseguir-suscriptores-youtube-2026

**SU1 · ES · categoría 2 (media-baja)**
Frase actual: `{ type: 'p', t: 'YouTube necesita datos para entender de qué va tu canal. Con 1-3 vídeos no tiene suficiente información. Con 10+, el algoritmo empieza a entender quién es tu audiencia y puede empezar a recomendarte. Paddy Galloway, consultor de canales con millones de suscriptores, lo ha dicho públicamente: los primeros 10 vídeos son tu fase de calibración, no de resultados.' }`
Problema: cita casi textual atribuida a una persona con nombre (Paddy Galloway) que no se puede confirmar palabra por palabra.
Propuesta: `{ type: 'p', t: 'YouTube necesita datos para entender de qué va tu canal. Con 1-3 vídeos no tiene suficiente información. Con 10+, el algoritmo empieza a entender quién es tu audiencia y puede empezar a recomendarte. Es una idea que repiten los estrategas de canales grandes: tus primeros vídeos son tu fase de calibración, no de resultados.' }`
Confianza: media-baja.

**SU2 · EN · categoría 2 (media-baja)**
Frase actual: `{ type: 'p', t: 'YouTube needs data to understand what your channel is about. With 1-3 videos, it doesn\'t have enough information. With 10+, the algorithm starts to understand who your audience is and can begin recommending you. Paddy Galloway, consultant for channels with millions of subscribers, has said publicly: your first 10 videos are your calibration phase, not your results phase.' }`
Propuesta: `{ type: 'p', t: 'YouTube needs data to understand what your channel is about. With 1-3 videos, it doesn\'t have enough information. With 10+, the algorithm starts to understand who your audience is and can begin recommending you. It\'s something strategists who work with large channels repeat: your first videos are your calibration phase, not your results phase.' }`
Confianza: media-baja.

**SU3 · ES · categoría 3 (media)**
Frase actual: `{ type: 'callout-mid', t: 'Genera títulos virales con IA', sub: 'YTubViral analiza millones de vídeos para sugerirte títulos con alto CTR para tu nicho.', cta: 'Probar gratis', href: '/features/ai-generator' }`
Problema: "analiza millones de vídeos" — afirmación de dataset propio que no existe (el único es el estudio de títulos N≈1.814).
Propuesta: `{ type: 'callout-mid', t: 'Genera títulos virales con IA', sub: 'YTubViral aplica los frameworks de titulación que mejor funcionan en YouTube para sugerirte títulos con alto CTR para tu nicho.', cta: 'Probar gratis', href: '/features/ai-generator' }`
Confianza: media.

**SU4 · EN · categoría 3 (media)**
Frase actual: `{ type: 'callout-mid', t: 'Generate viral titles with AI', sub: 'YTubViral analyzes millions of videos to suggest high-CTR titles for your niche.', cta: 'Try free', href: '/features/ai-generator' }`
Propuesta: `{ type: 'callout-mid', t: 'Generate viral titles with AI', sub: 'YTubViral applies the title frameworks that perform best on YouTube to suggest high-CTR titles for your niche.', cta: 'Try free', href: '/features/ai-generator' }`
Confianza: media.

Nota (no contada, baja): "YouTube ha confirmado que la consistencia en el horario de publicación ayuda al algoritmo" / "YouTube has confirmed that consistency in publishing schedule helps the algorithm" — atribución a "YouTube" de un mecanismo de algoritmo. YouTube/Creator Insider ha dicho más bien lo contrario (el horario fijo no es un factor de ranking). Recomiendo suavizar a "publicar de forma predecible ayuda a que tu audiencia sepa cuándo esperarte" si se hace otra pasada. Confianza media-baja; no incluido en el recuento principal.

---

### auditoria-canal-youtube-guia

**AU1 · ES · categoría 1 (media-alta)**
Frase actual: `{ type: 'p', t: 'Revisa tus últimos 10-15 vídeos y verifica lo siguiente para cada uno: ¿El título incluye la keyword principal? ¿Está en los primeros 60 caracteres? ¿La descripción tiene al menos 150 palabras con la keyword y sinónimos naturales? ¿Usas entre 5 y 10 tags relevantes (no 30 tags genéricos)? Una descripción bien escrita puede mejorar la visibilidad de un vídeo en un 40-60% sin cambiar ni un segundo del contenido.' }`
Propuesta: sustituir la última frase por: `... Una descripción bien escrita puede mejorar de forma apreciable la visibilidad de un vídeo en búsqueda y sugeridos sin cambiar ni un segundo del contenido.`
Confianza: media-alta.

**AU2 · EN · categoría 1 (media-alta)**
Frase actual: `{ type: 'p', t: 'Review your last 10-15 videos and verify the following for each: Does the title include the main keyword? Is it in the first 60 characters? Does the description have at least 150 words with the keyword and natural synonyms? Are you using 5-10 relevant tags (not 30 generic ones)? A well-written description can improve a video\'s visibility by 40-60% without changing a single second of the content.' }`
Propuesta: última frase → `... A well-written description can meaningfully improve a video\'s visibility in search and suggested without changing a single second of the content.`
Confianza: media-alta.

**AU3 · ES · categoría 1 (media)**
Frase actual: `{ type: 'p', t: 'Publicar sobre temas trending en el momento adecuado puede multiplicar las impresiones por 5x o 10x. La clave es la velocidad: el 80% del valor de un trending topic desaparece en las primeras 48-72 horas. Si detectas una tendencia en tu nicho pero tardas 2 semanas en publicar, llegas tarde. Incorporar un flujo de vigilancia de tendencias a tu rutina semanal es uno de los cambios con mayor retorno inmediato.' }`
Propuesta: `{ type: 'p', t: 'Publicar sobre temas trending en el momento adecuado puede disparar las impresiones de un vídeo muy por encima de tu media. La clave es la velocidad: la mayor parte del valor de un trending topic se concentra en los primeros dos o tres días. Si detectas una tendencia en tu nicho pero tardas 2 semanas en publicar, llegas tarde. Incorporar un flujo de vigilancia de tendencias a tu rutina semanal es uno de los cambios con mayor retorno inmediato.' }`
Confianza: media.

**AU4 · EN · categoría 1 (media)**
Frase actual: `{ type: 'p', t: 'Publishing about trending topics at the right moment can multiply impressions by 5x or 10x. The key is speed: 80% of a trending topic\'s value disappears in the first 48-72 hours. If you spot a trend in your niche but take 2 weeks to publish, you\'re too late. Incorporating a trend monitoring workflow into your weekly routine is one of the changes with the highest immediate return.' }`
Propuesta: `{ type: 'p', t: 'Publishing about trending topics at the right moment can push a video\'s impressions far above your usual average. The key is speed: most of a trending topic\'s value is concentrated in the first two or three days. If you spot a trend in your niche but take 2 weeks to publish, you\'re too late. Incorporating a trend monitoring workflow into your weekly routine is one of the changes with the highest immediate return.' }`
Confianza: media.

Notas (no contadas, baja): "Un canal sano convierte entre el 0,5% y el 2% de sus vistas únicas en suscriptores nuevos" / "between 0.5% and 2%" y "deberías tener al menos un 3-5% de likes sobre vistas totales" / "at least a 3-5% like-to-view ratio" son rangos-consejo presentados como dato. El 3-5% de likes es notablemente alto frente a lo habitual. Suavizar a "un porcentaje pequeño pero no residual" si se hace otra pasada.

---

### herramientas-ia-para-youtubers-2026

**H1 · ES · categoría 5 (media-baja)**
Problema: lista de precios de competidores expresados como dato actual, con precisión sospechosa. Ejemplos verbatim:
`{ type: 'p', t: 'Precio: Desde $16.58/mes. Principalmente en inglés, con soporte parcial en español. Ideal para creadores que quieren datos analíticos detallados.' }` (vidIQ)
`{ type: 'p', t: 'Precio: Desde $4.50/mes — Ideal para creadores que quieren optimizar su canal de forma sistemática.' }` (TubeBuddy)
más Descript "$24/mes", ElevenLabs "$5/mes", Canva "$12.99/mes", Opus Clip "$9/mes", ChatGPT Plus "$20/mes", Midjourney "$10/mes", Riverside "$15/mes", y la tabla comparativa que repite "$16.58/mes" y "$4.50/mes".
Propuesta: mantener el nombre de cada herramienta y para qué sirve; sustituir "Precio: Desde $X/mes" por "Precio: plan gratuito + planes de pago" o "Precio: de pago, con plan de entrada económico", y en la tabla comparativa quitar la columna de precio o marcarla como "orientativo, {año}". El "$16.58" en concreto es el que más canta.
Confianza: media-baja (son precios de terceros que caducan; varios son inexactos).

**H2 · EN · categoría 5 (media-baja)**
Mismo problema. Verbatim: `{ type: 'p', t: 'Price: From $16.58/month. Ideal for creators who want detailed analytics data.' }`, `{ type: 'p', t: 'Price: From $4.50/month — Ideal for creators who want to systematically optimize their channel.' }`, etc., y la lista "Tool Comparison" con `'vidIQ — $16.58/month | ...'` y `'TubeBuddy — $4.50/month | ...'`.
Propuesta: igual que H1 — describir el modelo ("free plan + paid tiers") en vez de un precio exacto; quitar precios de la tabla comparativa.
Confianza: media-baja.

---

### keyword-research-youtube-guia

**K1 · ES · categoría 1 (media-baja)**
Frase actual: `{ type: 'p', t: 'YouTube es el segundo buscador más grande del mundo después de Google. Cada minuto se realizan más de 700.000 búsquedas en YouTube. Cuando alguien escribe "cómo editar vídeos gratis", YouTube tiene que decidir qué 10 vídeos mostrar primero...' }`
Problema: "más de 700.000 búsquedas por minuto" es un dato concreto sin fuente verificable. "YouTube es el segundo buscador" sí es lugar común aceptado.
Propuesta: `{ type: 'p', t: 'YouTube es el segundo buscador más grande del mundo después de Google, con un volumen de búsquedas enorme cada día. Cuando alguien escribe "cómo editar vídeos gratis", YouTube tiene que decidir qué 10 vídeos mostrar primero...' }`
Confianza: media-baja.

**K2 · EN · categoría 1 (media-baja)**
Frase actual: `{ type: 'p', t: 'YouTube is the second largest search engine in the world after Google. Over 700,000 searches happen on YouTube every minute. When someone types "how to edit videos free," YouTube has to decide which 10 videos to show first...' }`
Propuesta: `{ type: 'p', t: 'YouTube is the second largest search engine in the world after Google, with an enormous volume of searches every day. When someone types "how to edit videos free," YouTube has to decide which 10 videos to show first...' }`
Confianza: media-baja.

Resto del post: limpio. Los ejemplos ("pan casero 50.000 búsquedas") están claramente marcados como hipotéticos ("puede tener").

---

### tour-completo-ytubviral-14-herramientas

**TO1 · ES · categoría 3 (media)**
Frase actual: `{ type: 'p', t: 'Compara dos opciones de título y la IA predice cuál tendrá mejor CTR basándose en patrones de rendimiento de millones de vídeos. No reemplaza el A/B testing nativo de YouTube, pero te permite pre-filtrar opciones antes de publicar y tener una estimación fundamentada de qué funcionará mejor.' }`
Problema: "patrones de rendimiento de millones de vídeos" — afirmación de dataset propio inexistente.
Propuesta: `{ type: 'p', t: 'Compara dos opciones de título y la IA predice cuál tendrá mejor CTR basándose en los patrones de titulación que mejor funcionan en YouTube. No reemplaza el A/B testing nativo de YouTube, pero te permite pre-filtrar opciones antes de publicar y tener una estimación fundamentada de qué funcionará mejor.' }`
Confianza: media.

**TO2 · EN · categoría 3 (media)**
Frase actual: `{ type: 'p', t: 'Compare two title options and the AI predicts which will have better CTR based on performance patterns from millions of videos. It doesn\'t replace YouTube\'s native A/B testing, but lets you pre-filter options before publishing with a data-backed estimate of what will perform better.' }`
Propuesta: `{ type: 'p', t: 'Compare two title options and the AI predicts which will have better CTR based on the title patterns that perform best on YouTube. It doesn\'t replace YouTube\'s native A/B testing, but lets you pre-filter options before publishing with a data-backed estimate of what will perform better.' }`
Confianza: media.

Nota aparte (fuera de estas 5 categorías, pero relevante): este post entero se titula y estructura sobre "las 14 herramientas". La memoria (`project_tools_page_discoverability`, `feedback_ph_strategy`) marca que el sitio ya NO debe apoyarse en el gancho "14 herramientas". No es una fabricación de datos; se señala solo por coherencia de marca.

---

### youtube-neurodivergencia-guia

**N1 · ES · categoría 2 (media)**
Frase actual: `{ type: 'callout', t: 'Según un estudio publicado en el Journal of Creative Behavior (2023), las personas con TDAH obtienen puntuaciones significativamente más altas en pensamiento divergente — la capacidad de generar ideas originales y conexiones inesperadas. Exactamente lo que necesitas para destacar en YouTube.' }`
Problema: cita a revista y año concretos. Existe investigación real que relaciona TDAH y pensamiento divergente (p. ej. trabajos de White & Shah, algunos en Journal of Creative Behavior), pero la cita exacta ("2023", el hallazgo tal cual) no se puede confirmar. Por prudencia se marca.
Propuesta: `{ type: 'callout', t: 'Varias investigaciones en psicología asocian el TDAH con mayores puntuaciones en pensamiento divergente — la capacidad de generar ideas originales y conexiones inesperadas. Exactamente lo que necesitas para destacar en YouTube.' }`
Confianza: media.

**N2 · EN · categoría 2 (media)**
Frase actual: `{ type: 'callout', t: 'According to a study published in the Journal of Creative Behavior (2023), people with ADHD score significantly higher in divergent thinking — the ability to generate original ideas and unexpected connections. Exactly what you need to stand out on YouTube.' }`
Propuesta: `{ type: 'callout', t: 'Several psychology studies link ADHD with higher scores in divergent thinking — the ability to generate original ideas and unexpected connections. Exactly what you need to stand out on YouTube.' }`
Confianza: media.

Nota (no contada, baja): creadores nombrados con nº de suscriptores — "Orion Kelly (That Autistic Guy, 208K)", "Jessica Kellgren-Fozard (1,2M)", "Molly Burke (2M)", "Chris Ulmer (3,7M)". Son personas reales y públicas y no hay claim de "pasó de N a M"; el único riesgo es que las cifras de subs queden desactualizadas. Riesgo bajo, no se marca como fabricación.

---

### youtube-trending-videos-free-tool

**TR1 · ES · categoría 1/3 (media)**
Frase actual: `{ type: 'p', t: 'Los creadores que combinan timing (trending) con optimización (SEO) ven resultados 3-5x superiores a los que solo hacen una de las dos cosas.' }`
Problema: multiplicador "3-5x" sin fuente.
Propuesta: `{ type: 'p', t: 'Combinar timing (trending) con optimización (SEO) rinde mucho más que hacer solo una de las dos cosas: llegas pronto al tema y además con un vídeo que el algoritmo entiende desde el primer minuto.' }`
Confianza: media.

**TR2 · EN · categoría 1/3 (media)**
Frase actual: `{ type: 'p', t: 'Creators who combine timing (trending) with optimization (SEO) see 3-5x better results than those who only do one of the two.' }`
Propuesta: `{ type: 'p', t: 'Combining timing (trending) with optimization (SEO) pays off far more than doing just one: you reach the topic early and with a video the algorithm understands from minute one.' }`
Confianza: media.

Resto del post: los datos de producto (6 regiones, actualización cada 30 min, API de YouTube, widget `/embed`) son afirmaciones sobre la propia herramienta, no fabricaciones.

---

### cuanto-gana-un-youtuber-en-espana

Post mayormente **sólido**: no cita fuentes falsas con nombre, no invoca datos internos de YTubViral, no hay casos de estudio con nombre propio. Las tablas de RPM por nicho, CPM por país, tramos de IRPF y cuota de autónomos están enmarcadas como rangos de mercado / normativa vigente (los tramos fiscales y la cuota por tramos son ley española real). Bajo los criterios ("rangos de conocimiento común" no son problema) no se marcan.

**CG1 · ES/EN · categoría 1 (baja)**
Frase actual (ES): `{ type: 'p', t: '... Se ignora que el 90% de los canales abandonan antes de cobrar su primer cheque de 100€. ...' }` y repetida: `{ type: 'p', t: 'El 90% de los canales abandonan antes de cobrar su primer pago de 100€. No es una estadística inventada para dramatizar. Es la realidad del Valle de la Muerte.' }`
EN equivalente: `'Ninety percent of channels quit before cashing their first €100 payment. That is not a statistic invented for dramatic effect. ...'`
Problema: cifra "90%" repetida y explícitamente defendida como no inventada, sin fuente. Es folclore muy extendido pero no verificable.
Propuesta (ES): `'La gran mayoría de los canales abandonan antes de cobrar su primer pago. No es un cuento para dramatizar: es la realidad del Valle de la Muerte.'` / (EN): `'The vast majority of channels quit before cashing their first payment. That is not a story invented for dramatic effect: it is the reality of the Valley of Death.'`
Confianza: baja (podría defenderse como estimación de sentido común; se incluye por la insistencia retórica en que "no es inventada").

---

## Los peores ofensores

1. **thumbnails-youtube-guia-ctr** — 12 incidencias (6 ES + 6 EN). Cinco porcentajes/multiplicadores inventados por idioma ("90% usan miniatura personalizada", "20-42% más clics con caras", "73% usan 2-3 palabras", "rojo 23% más CTR que azul", "Gaming 8,5% / Educación 4,5%", "A/B testing 15-30% en 3 meses"), varios con "los datos son contundentes / los datos muestran". Es el post con más densidad de fabricación de todo el blog manual.
2. **descripciones-seo-youtube-guia** — atribución **falsa** a Backlinko de un hallazgo "78% más probabilidades de primera página" que el estudio real no contiene (y prácticamente contradice), en ES y EN. Más "40% publican sin descripción" y una lista de 10 keywords con volúmenes exactos sin fuente.
3. **como-escribir-titulos-virales-youtube (ES)** — "Según datos internos de YouTube… hasta un 300% más de visualizaciones". Es exactamente el patrón que ya se corrigió en el EN de este post y en `7-frameworks`; el ES se quedó sin tocar. Alta gravedad (categoría 2: atribución a "YouTube").
4. **como-crear-scripts-youtube-con-ia** — "34% más de retención media… No es opinión, es dato de YouTube Analytics" (ES y EN), en un post que a los dos párrafos advierte de no poner cifras sin fuente.
5. **como-monetizar-youtube-2026-guia** — "Ejemplo real" de canal boutique con seis cifras concretas que leen como inventadas (categoría 4), más "Hype: 30-50% más impresiones".

Empatados por detrás: `ab-testing` (precio/plan "Legend $49/mes" de TubeBuddy + "30-50% más CTR"), `como-analizar-competencia` ("90% de creadores pequeños" + rangos de precio VidIQ/TubeBuddy), `auditoria-canal` ("descripción +40-60% visibilidad" + "trending 5x-10x").

---

## Recuento final

- **Incidencias totales: ~54** (contando ES y EN por separado).
- **Incidencias únicas: ~28** (una por frase, sin duplicar idioma).
- **Posts totalmente limpios: 2** — `setup-youtube-menos-500-euros`, `ideas-videos-youtube-no-se-que-subir`.
- **Limpio solo en un idioma: 1** — `como-escribir-titulos-virales-youtube` (EN limpio, ES con 2 incidencias).
- **Confirmación del hallazgo previo:** el problema NO era solo el generador. Los posts manuales antiguos repiten los mismos patrones — "datos internos de YouTube", porcentajes redondos con "los datos muestran", atribución a estudios reales (Backlinko) con cifras que el estudio no dice, y "millones de vídeos analizados" por YTubViral.
