'use client';

import { useRef, useState, useCallback, useEffect } from 'react';
import { primeWebmDuration } from '@/lib/webm-duration';

type Lang = 'es' | 'en';

interface PlaybackModalProps {
  url: string;
  title: string;
  lang: Lang;
  onClose: () => void;
}

export default function PlaybackModal({ url, title, lang, onClose }: PlaybackModalProps) {
  const t = (es: string, en: string) => lang === 'en' ? en : es;
  const videoRef = useRef<HTMLVideoElement>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showControls, setShowControls] = useState(false);
  const [isPlaying, setIsPlaying] = useState(true);

  useEffect(() => {
    return () => { if (hideTimer.current) clearTimeout(hideTimer.current); };
  }, []);

  // Sin esto el clip se queda clavado en el primer segundo: ver lib/webm-duration.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    return primeWebmDuration(v);
  }, [url]);

  const scheduleHide = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    setShowControls(true);
    hideTimer.current = setTimeout(() => setShowControls(false), 2000);
  }, []);

  const handleMouseMove = useCallback(() => scheduleHide(), [scheduleHide]);
  const handleMouseLeave = useCallback(() => {
    setShowControls(false);
    if (hideTimer.current) clearTimeout(hideTimer.current);
  }, []);

  const togglePlay = useCallback(() => {
    const v = videoRef.current; if (!v) return;
    if (v.paused) { v.play(); setIsPlaying(true); } else { v.pause(); setIsPlaying(false); }
    scheduleHide();
  }, [scheduleHide]);

  const skipVideo = useCallback((delta: number) => {
    const v = videoRef.current; if (!v) return;
    const end = Number.isFinite(v.duration) ? v.duration : v.currentTime + delta;
    v.currentTime = Math.max(0, Math.min(end, v.currentTime + delta));
    scheduleHide();
  }, [scheduleHide]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.92)', backdropFilter: 'blur(14px)' }}
      onClick={onClose}>
      <div className="relative w-full my-auto" style={{ maxWidth: 1100 }}
        onClick={e => e.stopPropagation()}>

        {/* Close */}
        <button onClick={onClose}
          className="absolute -top-9 right-0 font-mono-jb text-[13px] text-zinc-500 hover:text-white transition flex items-center gap-1.5">
          <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path d="M18 6 6 18M6 6l12 12"/></svg>
          {t('Cerrar', 'Close')}
        </button>

        {/* Title */}
        <p className="font-mono-jb text-[13px] text-zinc-500 truncate mb-3 text-center">&quot;{title}&quot;</p>

        {/* TV2 with video playing inside */}
        <div style={{ position: 'relative', display: 'inline-block', width: '100%' }}>
          {/* Video + controls behind the TV frame */}
          <div
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
            style={{
              position: 'absolute',
              left: '11%', top: '16%',
              width: '62%', height: '67%',
              zIndex: 1, overflow: 'hidden',
              background: '#000810',
            }}>
            <video
              ref={videoRef}
              src={url}
              autoPlay loop muted playsInline
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            />

            {/* Playback controls overlay */}
            <div style={{
              position: 'absolute', inset: 0, zIndex: 4,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
              background: showControls ? 'rgba(0,0,0,0.35)' : 'transparent',
              opacity: showControls ? 1 : 0,
              transition: 'opacity 0.3s ease, background 0.3s ease',
              pointerEvents: showControls ? 'auto' : 'none',
              cursor: 'pointer',
            }}>
              {/* Rewind 3s */}
              <button onClick={() => skipVideo(-3)} title={t('Retroceder 3s', 'Rewind 3s')} style={{
                background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: '50%',
                width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', backdropFilter: 'blur(4px)', transition: 'background 0.2s',
              }} onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.3)')}
                 onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.15)')}>
                <svg width={16} height={16} viewBox="0 0 24 24" fill="white"><path d="M12.5 3C7.26 3 3 7.26 3 12.5S7.26 22 12.5 22c4.5 0 8.27-3.14 9.24-7.35l-1.93-.51C19.03 17.52 16.07 20 12.5 20 8.36 20 5 16.64 5 12.5S8.36 5 12.5 5c2.07 0 3.93.84 5.29 2.18L14 11h8V3l-2.79 2.79A9.458 9.458 0 0 0 12.5 3z"/><text x="9" y="16" fontSize="8" fill="white" fontWeight="bold">3</text></svg>
              </button>

              {/* Play / Pause */}
              <button onClick={togglePlay} title={isPlaying ? t('Pausar', 'Pause') : t('Reproducir', 'Play')} style={{
                background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: '50%',
                width: 48, height: 48, display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', backdropFilter: 'blur(4px)', transition: 'background 0.2s',
              }} onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.35)')}
                 onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.2)')}>
                {isPlaying ? (
                  <svg width={20} height={20} viewBox="0 0 24 24" fill="white"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>
                ) : (
                  <svg width={20} height={20} viewBox="0 0 24 24" fill="white"><polygon points="6,3 20,12 6,21"/></svg>
                )}
              </button>

              {/* Forward 3s */}
              <button onClick={() => skipVideo(3)} title={t('Avanzar 3s', 'Forward 3s')} style={{
                background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: '50%',
                width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', backdropFilter: 'blur(4px)', transition: 'background 0.2s',
              }} onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.3)')}
                 onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.15)')}>
                <svg width={16} height={16} viewBox="0 0 24 24" fill="white"><path d="M11.5 3c5.24 0 9.5 4.26 9.5 9.5S16.74 22 11.5 22c-4.5 0-8.27-3.14-9.24-7.35l1.93-.51C4.97 17.52 7.93 20 11.5 20c4.14 0 7.5-3.36 7.5-7.5S15.64 5 11.5 5c-2.07 0-3.93.84-5.29 2.18L10 11H2V3l2.79 2.79A9.458 9.458 0 0 1 11.5 3z"/><text x="8" y="16" fontSize="8" fill="white" fontWeight="bold">3</text></svg>
              </button>
            </div>

            {/* CRT scanlines */}
            <div style={{
              position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 5,
              background: 'repeating-linear-gradient(0deg, transparent 0px, transparent 3px, rgba(0,0,0,0.06) 3px, rgba(0,0,0,0.06) 4px)',
            }} />
            {/* Screen glare */}
            <div style={{
              position: 'absolute', top: 0, left: 0, width: '55%', height: '40%',
              background: 'linear-gradient(135deg, rgba(255,255,255,0.05) 0%, transparent 60%)',
              pointerEvents: 'none', zIndex: 6, borderRadius: '0 0 80% 0',
            }} />
          </div>
          {/* TV2 frame on top */}
          <img src="/TV2.webp" alt="" draggable={false}
            style={{ width: '100%', display: 'block', position: 'relative', zIndex: 10, userSelect: 'none', pointerEvents: 'none' }}
          />
        </div>
      </div>
    </div>
  );
}
