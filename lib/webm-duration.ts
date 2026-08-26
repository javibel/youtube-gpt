// Los WebM que produce MediaRecorder se escriben en modo streaming: el elemento
// Duration de la cabecera Matroska queda a cero porque al empezar a grabar aún no
// se sabe cuánto va a durar, y MediaRecorder no vuelve atrás a rellenarlo.
//
// Consecuencia en el <video>: `duration` es Infinity y `seekable` está vacío. Con
// eso el clip se queda clavado en el primer segundo (se ve solo el ruido de TV
// inicial y parece que la pantalla está en negro), `loop` no puede reiniciar y los
// botones de ±3s no hacen nada porque `Math.min(v.duration, …)` es Infinity.
//
// Truco estándar y sin dependencias: forzar un seek muy por detrás del final. El
// navegador lo resuelve recorriendo el fichero, calcula la duración real y a
// partir de ahí el clip es seekable. Verificado sobre una grabación real:
// duration Infinity → 85.463s, seekable vacío → [0, 85.463].
export function primeWebmDuration(video: HTMLVideoElement): () => void {
  let done = false;

  const cleanupFns: Array<() => void> = [];
  const cleanup = () => { while (cleanupFns.length) cleanupFns.pop()!(); };

  const on = (ev: string, fn: () => void) => {
    video.addEventListener(ev, fn);
    cleanupFns.push(() => video.removeEventListener(ev, fn));
  };

  // El seek al final deja currentTime al borde: lo devolvemos al principio y
  // relanzamos la reproducción, que autoPlay ya habrá dado por perdida.
  const finish = () => {
    if (done) return;
    done = true;
    cleanup();
    try {
      video.currentTime = 0;
      void video.play().catch(() => { /* el usuario puede darle al play a mano */ });
    } catch { /* elemento desmontado */ }
  };

  const prime = () => {
    if (done) return;
    if (Number.isFinite(video.duration)) { done = true; cleanup(); return; }
    // Cualquiera de los dos eventos indica que el navegador ya resolvió el seek
    // y con él la duración real; no todos los navegadores emiten los dos.
    on('seeked', () => { if (Number.isFinite(video.duration)) finish(); });
    on('timeupdate', () => { if (Number.isFinite(video.duration)) finish(); });
    try {
      video.currentTime = 1e101;
    } catch { done = true; cleanup(); }
  };

  if (video.readyState >= 1 /* HAVE_METADATA */) prime();
  else on('loadedmetadata', prime);

  return () => { done = true; cleanup(); };
}
