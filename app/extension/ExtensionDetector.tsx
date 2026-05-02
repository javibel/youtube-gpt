'use client';

import { useState, useEffect } from 'react';

export function ExtensionDetector({
  installUrl,
  installLabel,
  installedLabel,
}: {
  installUrl: string;
  installLabel: string;
  installedLabel: string;
}) {
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    // The extension's detect.js sets data-ytv-ext="1" on <html> at document_start
    const check = () => document.documentElement.getAttribute('data-ytv-ext') === '1';
    if (check()) {
      setInstalled(true);
    } else {
      // Give the content script a moment to inject
      const timer = setTimeout(() => {
        if (check()) setInstalled(true);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, []);

  if (installed) {
    return (
      <div className="inline-flex items-center gap-3 px-8 py-3.5 text-sm font-display rounded-lg border border-green-500/30" style={{ background: 'rgba(34,197,94,0.08)', color: '#22c55e' }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M20 6L9 17l-5-5" />
        </svg>
        {installedLabel}
      </div>
    );
  }

  return (
    <a
      href={installUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="btn-offset inline-flex items-center gap-3 px-8 py-3.5 text-sm font-display"
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="7 10 12 15 17 10" />
        <line x1="12" x2="12" y1="15" y2="3" />
      </svg>
      {installLabel}
    </a>
  );
}
