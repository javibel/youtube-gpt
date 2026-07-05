'use client';

import { useState } from 'react';
import { useLang } from '@/components/LangProvider';
import { CheckIcon } from '@/components/icons';

export default function CopyButton({ snippet }: { snippet: string }) {
  const lang = useLang();
  const t = (es: string, en: string) => lang === 'en' ? en : es;
  const [copied, setCopied] = useState(false);

  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(snippet);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className="font-mono-jb text-[13px] px-3 py-1 rounded-lg transition"
      style={{
        background: copied ? 'rgba(0,255,163,0.1)' : 'rgba(255,255,255,0.05)',
        border: copied ? '1px solid rgba(0,255,163,0.3)' : '1px solid var(--yv-border)',
        color: copied ? '#00FFA3' : 'var(--yv-text-2)',
      }}
    >
      {copied ? <span className="inline-flex items-center gap-1">{t('Copiado', 'Copied')} <CheckIcon size={12} /></span> : t('Copiar código', 'Copy code')}
    </button>
  );
}
