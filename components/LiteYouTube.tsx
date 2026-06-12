'use client';

import { useState } from 'react';

// Facade de YouTube (A2): el iframe real (~1MB de JS de youtube.com) solo se
// carga al hacer clic. Hasta entonces: thumbnail estático + botón de play.
export default function LiteYouTube({ videoId, title }: { videoId: string; title: string }) {
  const [activated, setActivated] = useState(false);

  if (activated) {
    return (
      <iframe
        className="absolute inset-0 w-full h-full"
        src={`https://www.youtube-nocookie.com/embed/${videoId}?rel=0&autoplay=1`}
        title={title}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
      />
    );
  }

  return (
    <button
      onClick={() => setActivated(true)}
      className="group absolute inset-0 w-full h-full cursor-pointer"
      aria-label={`${title} — play`}
    >
      <img
        src={`https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`}
        alt={title}
        loading="lazy"
        className="absolute inset-0 w-full h-full object-cover"
      />
      <span className="absolute inset-0 bg-black/20 group-hover:bg-black/10 transition" />
      <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center w-16 h-12 rounded-xl transition group-hover:scale-110" style={{ background: '#e84d5b' }}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="#fff" aria-hidden><path d="M8 5v14l11-7z" /></svg>
      </span>
    </button>
  );
}
