'use client';

import { useState, useEffect } from 'react';

export default function ReferralCard({ lang }: { lang: 'es' | 'en' }) {
  const t = (es: string, en: string) => lang === 'en' ? en : es;
  const [code, setCode] = useState('');
  const [url, setUrl] = useState('');
  const [referrals, setReferrals] = useState(0);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/user/referral')
      .then(r => r.json())
      .then(data => {
        if (data.code) {
          setCode(data.code);
          setUrl(data.url);
          setReferrals(data.referrals);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleCopy = () => {
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) return null;

  return (
    <div className="yv-card p-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex-1 min-w-0">
          <p className="font-mono-jb text-[13px] tracking-[0.3em] uppercase mb-2" style={{ color: '#FF8A00' }}>
            {t('INVITA AMIGOS', 'INVITE FRIENDS')}
          </p>
          <h3 className="font-display font-bold text-lg mb-1">
            {t('Comparte YTubViral', 'Share YTubViral')}
          </h3>
          <p className="font-mono-jb text-[13px] leading-relaxed" style={{ color: 'var(--yv-text-3)' }}>
            {t(
              'Envía tu enlace a otros creadores. Si se hacen de pago, te regalamos 1 mes de Pro gratis.',
              'Send your link to other creators. If they go paid, you get 1 month of Pro free.'
            )}
          </p>
        </div>
        <div className="flex items-center gap-2 px-4 py-2 rounded-lg" style={{ background: 'rgba(255,138,0,0.08)', border: '1px solid rgba(255,138,0,0.3)' }}>
          <span className="font-display font-bold text-2xl" style={{ color: '#FF8A00' }}>{referrals}</span>
          <span className="font-mono-jb text-[13px]" style={{ color: 'var(--yv-text-3)' }}>{t('referidos', 'referrals')}</span>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-2">
        <div
          className="flex-1 min-w-0 px-4 py-2.5 rounded-lg font-mono-jb text-[13px] truncate"
          style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--line)', color: 'var(--yv-text-2)' }}
        >
          {url}
        </div>
        <button
          onClick={handleCopy}
          className="flex-shrink-0 px-4 py-2.5 rounded-lg font-mono-jb text-[13px] font-medium transition"
          style={{
            background: copied ? 'rgba(0,255,163,0.1)' : 'rgba(255,138,0,0.1)',
            border: copied ? '1px solid rgba(0,255,163,0.4)' : '1px solid rgba(255,138,0,0.4)',
            color: copied ? '#00FFA3' : '#FF8A00',
          }}
        >
          {copied ? t('Copiado ✓', 'Copied ✓') : t('Copiar', 'Copy')}
        </button>
      </div>
    </div>
  );
}
