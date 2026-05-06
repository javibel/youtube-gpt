import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

function todayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

// 60 tips — rotated by day-of-year so the fallback is never the same two days in a row
const TIPS: { es: string; en: string }[] = [
  { es: 'Los títulos con un número específico (7, 23, 147) superan a los genéricos en un 36% de CTR. Prueba "7 errores..." la próxima vez.', en: 'Titles with a specific number (7, 23, 147) outperform generic ones by 36% CTR. Try "7 mistakes..." next time.' },
  { es: 'Las primeras 48 horas de un vídeo son críticas. YouTube analiza el CTR y la retención inicial para decidir si lo recomienda.', en: 'The first 48 hours of a video are critical. YouTube analyzes initial CTR and retention to decide whether to recommend it.' },
  { es: 'Los vídeos entre 8 y 15 minutos tienen el mejor equilibrio entre retención y monetización en la mayoría de nichos.', en: 'Videos between 8 and 15 minutes have the best balance of retention and monetization in most niches.' },
  { es: 'Publicar a la misma hora cada semana entrena a tu audiencia a esperarte. La consistencia supera a la frecuencia.', en: 'Publishing at the same time each week trains your audience to expect you. Consistency beats frequency.' },
  { es: 'El 70% de las visualizaciones en YouTube vienen de las recomendaciones del algoritmo, no de las búsquedas.', en: '70% of YouTube views come from algorithm recommendations, not from search.' },
  { es: 'Un buen hook en los primeros 5 segundos puede mejorar tu retención media un 20%. Ve al grano desde el segundo 1.', en: 'A good hook in the first 5 seconds can improve your average retention by 20%. Get to the point from second 1.' },
  { es: 'Las miniaturas con caras expresivas tienen un 38% más de CTR que las que solo usan texto o gráficos.', en: 'Thumbnails with expressive faces get 38% higher CTR than those using only text or graphics.' },
  { es: 'Responder a los comentarios en la primera hora aumenta el engagement y le señala al algoritmo que tu vídeo genera conversación.', en: 'Replying to comments in the first hour boosts engagement and signals the algorithm that your video drives conversation.' },
  { es: 'Las descripciones con keywords en las primeras 2 líneas ayudan al SEO de YouTube. No desperdicies ese espacio.', en: 'Descriptions with keywords in the first 2 lines help YouTube SEO. Don\'t waste that space.' },
  { es: 'Usa capítulos (timestamps) en tus vídeos. Mejoran la experiencia del usuario y pueden aparecer en los resultados de Google.', en: 'Use chapters (timestamps) in your videos. They improve user experience and can appear in Google search results.' },
  { es: 'Los Shorts pueden ser un funnel hacia tu contenido largo. Menciona tu último vídeo largo en cada Short.', en: 'Shorts can funnel viewers to your long-form content. Mention your latest long video in each Short.' },
  { es: 'YouTube premia la satisfacción del espectador. Un vídeo corto con alta retención vale más que uno largo con retención baja.', en: 'YouTube rewards viewer satisfaction. A short video with high retention is worth more than a long one with low retention.' },
  { es: 'Añade 3-5 tags relevantes a cada vídeo. No abusar — YouTube penaliza el keyword stuffing.', en: 'Add 3-5 relevant tags to each video. Don\'t overdo it — YouTube penalizes keyword stuffing.' },
  { es: 'Las playlists aumentan el tiempo de sesión. Agrupa tus vídeos por temática y ponlas en tu canal.', en: 'Playlists increase session time. Group your videos by topic and feature them on your channel.' },
  { es: 'El título ideal tiene entre 50 y 60 caracteres. Lo suficiente para informar, lo bastante corto para no cortarse.', en: 'The ideal title is 50-60 characters. Enough to inform, short enough not to get cut off.' },
  { es: 'Pregunta algo en los últimos 30 segundos del vídeo. Los comentarios que genera impulsan el engagement.', en: 'Ask a question in the last 30 seconds of your video. The comments it generates boost engagement.' },
  { es: 'Sube tu miniatura antes de publicar, no después. YouTube toma una "primera impresión" del vídeo al publicarlo.', en: 'Upload your thumbnail before publishing, not after. YouTube takes a "first impression" of the video when published.' },
  { es: 'Los vídeos que empiezan con "Cómo..." tienen un 65% más de probabilidad de aparecer en búsquedas de YouTube.', en: 'Videos starting with "How to..." are 65% more likely to appear in YouTube search results.' },
  { es: 'Analiza qué vídeos tienen mayor AVD (duración media de visualización) y haz más contenido de ese estilo.', en: 'Analyze which videos have the highest AVD (average view duration) and make more content in that style.' },
  { es: 'No cambies el título y la miniatura a la vez. Cambia uno, espera 48h, mide, y luego decide si cambias el otro.', en: 'Don\'t change the title and thumbnail at the same time. Change one, wait 48h, measure, then decide on the other.' },
  { es: 'Los end screens (pantallas finales) bien colocados pueden aumentar las visualizaciones del siguiente vídeo un 15%.', en: 'Well-placed end screens can increase next-video views by 15%.' },
  { es: 'YouTube favorece los vídeos que la gente ve hasta el final. Estructura tu contenido para mantener la curiosidad.', en: 'YouTube favors videos people watch to the end. Structure your content to maintain curiosity.' },
  { es: 'Los canales que publican al menos 1 vídeo por semana crecen 4x más rápido que los que publican cada 2 semanas.', en: 'Channels that publish at least 1 video per week grow 4x faster than those posting every 2 weeks.' },
  { es: 'El patrón de curiosidad ("Lo que nadie te dice sobre...") sigue siendo uno de los más efectivos para CTR.', en: 'The curiosity pattern ("What nobody tells you about...") remains one of the most effective for CTR.' },
  { es: 'Usa la pestaña "Comunidad" de YouTube para mantener engagement entre vídeos. Las encuestas funcionan especialmente bien.', en: 'Use the YouTube "Community" tab to maintain engagement between videos. Polls work especially well.' },
  { es: 'Las tarjetas (cards) de YouTube al minuto 3-4 tienen mejor CTR que las puestas al inicio o al final.', en: 'YouTube cards at minute 3-4 get better CTR than those placed at the beginning or end.' },
  { es: 'Graba en 1080p mínimo. YouTube comprime mucho el vídeo — si subes en 720p, la calidad percibida baja notablemente.', en: 'Record in 1080p minimum. YouTube compresses video heavily — if you upload in 720p, perceived quality drops noticeably.' },
  { es: 'Analiza los "picos de abandono" en tu gráfica de retención. Ahí está la información más valiosa para mejorar.', en: 'Analyze the "drop-off peaks" in your retention graph. That\'s where the most valuable improvement info is.' },
  { es: 'Los primeros 100 suscriptores son los más difíciles. Comparte tu contenido en comunidades relevantes (Reddit, foros, Discord).', en: 'The first 100 subscribers are the hardest. Share your content in relevant communities (Reddit, forums, Discord).' },
  { es: 'Subtítulos y closed captions mejoran el SEO y hacen tu contenido accesible a más personas. YouTube los indexa.', en: 'Subtitles and closed captions improve SEO and make your content accessible to more people. YouTube indexes them.' },
  { es: 'No elimines vídeos con pocas vistas — pueden resurgir meses después si el algoritmo encuentra una audiencia para ellos.', en: 'Don\'t delete low-view videos — they can resurface months later if the algorithm finds an audience for them.' },
  { es: 'El audio es más importante que el vídeo. Los espectadores perdonan una imagen regular, pero no un audio malo.', en: 'Audio is more important than video. Viewers forgive mediocre visuals, but not bad audio.' },
  { es: 'Prueba diferentes estilos de miniatura y compara el CTR en Analytics. Pequeños cambios pueden hacer gran diferencia.', en: 'Try different thumbnail styles and compare CTR in Analytics. Small changes can make a big difference.' },
  { es: 'Los vídeos que generan "clics compartidos" (shares) reciben un boost significativo del algoritmo.', en: 'Videos that generate shares receive a significant algorithm boost.' },
  { es: 'Usa YouTube Studio móvil para responder comentarios rápido. La velocidad de respuesta importa para el engagement.', en: 'Use YouTube Studio mobile to reply to comments quickly. Response speed matters for engagement.' },
  { es: 'Haz colaboraciones con canales de tamaño similar al tuyo. Ambos ganan audiencia nueva sin competir directamente.', en: 'Collaborate with channels of similar size. Both gain new audience without directly competing.' },
  { es: 'Las tendencias de búsqueda cambian por temporada. Planifica contenido "evergreen" pero también aprovecha picos estacionales.', en: 'Search trends change seasonally. Plan evergreen content but also leverage seasonal peaks.' },
  { es: 'Un canal bien organizado (secciones, playlists, banner actualizado) genera más confianza y más suscriptores.', en: 'A well-organized channel (sections, playlists, updated banner) builds more trust and more subscribers.' },
  { es: 'YouTube mide cuántos vídeos tuyos ve un espectador por sesión. Más variedad en temas puede reducir esta métrica.', en: 'YouTube measures how many of your videos a viewer watches per session. Too much topic variety can reduce this metric.' },
  { es: 'El CTR medio en YouTube está entre 2% y 10%. Si tu vídeo supera el 10%, el algoritmo lo amplifica fuerte.', en: 'Average YouTube CTR is between 2% and 10%. If your video exceeds 10%, the algorithm amplifies it strongly.' },
  { es: 'Antes de grabar, busca tu keyword en YouTube y analiza los 5 primeros resultados. Haz algo mejor o diferente.', en: 'Before recording, search your keyword on YouTube and analyze the top 5 results. Make something better or different.' },
  { es: 'Los vídeos con pattern interrupts (cambios de ángulo, gráficos, zooms) cada 30-60s retienen mejor la atención.', en: 'Videos with pattern interrupts (angle changes, graphics, zooms) every 30-60s retain attention better.' },
  { es: 'Si un vídeo no funciona en las primeras 24h, prueba a cambiar solo la miniatura. A veces es lo único que falla.', en: 'If a video doesn\'t perform in the first 24h, try changing just the thumbnail. Sometimes that\'s the only thing failing.' },
  { es: 'YouTube Analytics > Fuentes de tráfico te dice exactamente de dónde vienen tus vistas. Usa esa info para optimizar.', en: 'YouTube Analytics > Traffic Sources tells you exactly where your views come from. Use that info to optimize.' },
  { es: 'Los canales en nichos específicos crecen más rápido que los generalistas. YouTube premia la coherencia temática.', en: 'Niche channels grow faster than general ones. YouTube rewards thematic coherence.' },
  { es: 'Incluye tu keyword principal en el nombre del archivo de vídeo antes de subirlo (ej: "como-editar-videos.mp4").', en: 'Include your main keyword in the video file name before uploading (e.g., "how-to-edit-videos.mp4").' },
  { es: 'No pidas "like y suscríbete" en los primeros 30 segundos. Primero da valor, luego pide la acción.', en: 'Don\'t ask for "like and subscribe" in the first 30 seconds. First deliver value, then ask for the action.' },
  { es: 'Los vídeos de listas ("Top 10...", "5 mejores...") tienen un CTR un 25% superior a otros formatos de media.', en: 'List videos ("Top 10...", "5 best...") get 25% higher CTR than other average formats.' },
  { es: 'Fija tu mejor comentario o una pregunta al inicio de los comentarios. Genera discusión y mejora el engagement.', en: 'Pin your best comment or a question at the top of comments. It drives discussion and improves engagement.' },
  { es: 'YouTube recomienda contenido basándose en lo que tu audiencia ve fuera de tu canal. Conoce sus intereses.', en: 'YouTube recommends content based on what your audience watches outside your channel. Know their interests.' },
  { es: 'Los Shorts con loop (que terminan donde empiezan) tienen más reproducciones porque se repiten automáticamente.', en: 'Shorts with a loop (ending where they start) get more plays because they replay automatically.' },
  { es: 'Publica tu vídeo como "no listado" primero, revisa que todo esté bien, y luego cambia a "público".', en: 'Publish your video as "unlisted" first, check everything, then switch to "public".' },
  { es: 'Las miniaturas con contraste alto (fondo claro + texto oscuro, o viceversa) destacan más en el feed.', en: 'High-contrast thumbnails (light background + dark text, or vice versa) stand out more in the feed.' },
  { es: 'La retención en el minuto 0:30 es la métrica más predictiva del éxito del vídeo. Si la pierdes ahí, el resto no importa.', en: 'Retention at 0:30 is the most predictive metric of video success. If you lose viewers there, the rest doesn\'t matter.' },
  { es: 'Haz A/B testing de tus títulos con herramientas como YTubViral. Un pequeño cambio en el título puede duplicar las vistas.', en: 'A/B test your titles with tools like YTubViral. A small title change can double your views.' },
  { es: 'Crea una "serie" de vídeos conectados. YouTube recomienda el siguiente episodio automáticamente si lo detecta como serie.', en: 'Create a "series" of connected videos. YouTube automatically recommends the next episode if it detects a series.' },
  { es: 'Los vídeos subidos en fin de semana compiten con menos contenido nuevo. Puede ser buen momento para nichos educativos.', en: 'Videos uploaded on weekends compete with less new content. It can be a good time for educational niches.' },
  { es: 'Revisa YouTube Search Suggest para encontrar ideas. Escribe tu keyword y mira qué autocompleta YouTube.', en: 'Check YouTube Search Suggest for ideas. Type your keyword and see what YouTube autocompletes.' },
  { es: 'El CPM sube en Q4 (octubre-diciembre) por la publicidad navideña. Planifica tu mejor contenido para esas fechas.', en: 'CPM rises in Q4 (October-December) due to holiday advertising. Plan your best content for those dates.' },
  { es: 'No subestimes las descripciones. YouTube lee las primeras 200 palabras para entender de qué trata tu vídeo.', en: 'Don\'t underestimate descriptions. YouTube reads the first 200 words to understand what your video is about.' },
];

function dayOfYear(): number {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  return Math.floor((now.getTime() - start.getTime()) / 86_400_000);
}

export async function GET() {
  const date = todayUTC();
  const tip = await prisma.dailyTip.findUnique({ where: { date } });
  if (tip) return NextResponse.json(tip);

  // DB miss — rotate through static pool by day-of-year
  const fallback = TIPS[dayOfYear() % TIPS.length];
  return NextResponse.json({ ...fallback, date });
}
