'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useLang } from '@/components/LangProvider';
import { CheckIcon, StarIcon } from '@/components/icons';

const COPY = {
  es: {
    title: '¿Cómo va tu experiencia?',
    subtitle: 'Tu opinión nos ayuda a mejorar YTubViral para todos los creadores.',
    placeholder: 'Cuéntanos qué mejorarías o qué te ha gustado más...',
    submit: 'Enviar valoración',
    sending: 'Enviando...',
    thanks: '¡Gracias por tu feedback!',
    thanksText: 'Tu opinión es muy valiosa para nosotros. Seguimos trabajando para mejorar YTubViral.',
    alreadyDone: 'Ya has enviado tu valoración. ¡Gracias!',
    invalid: 'Este enlace no es válido o ha expirado.',
    errorSubmit: 'Error al enviar. Inténtalo de nuevo.',
    stars: ['Muy malo', 'Malo', 'Regular', 'Bueno', '¡Excelente!'],
  },
  en: {
    title: 'How is your experience?',
    subtitle: 'Your feedback helps us improve YTubViral for all creators.',
    placeholder: 'Tell us what you would improve or what you liked most...',
    submit: 'Send feedback',
    sending: 'Sending...',
    thanks: 'Thank you for your feedback!',
    thanksText: 'Your opinion is very valuable to us. We keep working to improve YTubViral.',
    alreadyDone: 'You have already submitted your feedback. Thank you!',
    invalid: 'This link is not valid or has expired.',
    errorSubmit: 'Error sending. Please try again.',
    stars: ['Very bad', 'Bad', 'Average', 'Good', 'Excellent!'],
  },
} as const;

type Lang = keyof typeof COPY;

function FeedbackForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';

  const serverLang = useLang();
  const [lang, setLang] = useState<Lang>(serverLang);
  const [status, setStatus] = useState<'loading' | 'ready' | 'done' | 'already' | 'invalid'>('loading');
  const [rating, setRating] = useState(0);
  const [hovered, setHovered] = useState(0);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) { setStatus('invalid'); return; }
    fetch(`/api/feedback?token=${token}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) { setStatus('invalid'); return; }
        setLang((data.lang as Lang) ?? 'es');
        setStatus(data.submitted ? 'already' : 'ready');
      })
      .catch(() => setStatus('invalid'));
  }, [token]);

  const c = COPY[lang];

  async function handleSubmit() {
    if (rating === 0) return;
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, rating, comment }),
      });
      if (!res.ok) throw new Error();
      setStatus('done');
    } catch {
      setError(c.errorSubmit);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: 'var(--yv-light)' }}>
      <div
        className="yv-glass yv-glass--lift w-full max-w-md p-8"
        style={{ borderRadius: 'var(--yv-radius-xl)' }}
      >
        {/* Logo */}
        <div className="text-center mb-8">
          <span className="text-2xl font-black" style={{ color: 'var(--yv-brand)' }}>YTubViral</span>
        </div>

        {status === 'loading' && (
          <p className="text-center text-white/40 text-sm">Cargando...</p>
        )}

        {status === 'invalid' && (
          <p className="text-center text-white/60 text-sm">{c.invalid}</p>
        )}

        {status === 'already' && (
          <div className="text-center">
            <div className="mb-4 flex justify-center">
              <span className="inline-flex items-center justify-center rounded-full" style={{ width: 56, height: 56, background: 'rgba(34,197,94,0.12)', color: '#22c55e' }}><CheckIcon size={26} /></span>
            </div>
            <p className="text-white font-semibold">{c.alreadyDone}</p>
          </div>
        )}

        {status === 'done' && (
          <div className="text-center">
            <div className="mb-4 flex justify-center">
              <span className="inline-flex items-center justify-center rounded-full" style={{ width: 56, height: 56, background: 'rgba(34,197,94,0.12)', color: '#22c55e' }}><CheckIcon size={26} /></span>
            </div>
            <h2 className="text-white font-bold text-xl mb-2">{c.thanks}</h2>
            <p className="text-white/60 text-sm">{c.thanksText}</p>
          </div>
        )}

        {status === 'ready' && (
          <>
            <h1 className="text-white font-bold text-xl text-center mb-2">{c.title}</h1>
            <p className="text-white/50 text-sm text-center mb-8">{c.subtitle}</p>

            {/* Stars */}
            <div className="flex justify-center gap-3 mb-3">
              {[1, 2, 3, 4, 5].map(star => (
                <button
                  key={star}
                  onClick={() => setRating(star)}
                  onMouseEnter={() => setHovered(star)}
                  onMouseLeave={() => setHovered(0)}
                  className="transition-transform hover:scale-110"
                  style={{ color: '#FFE800', filter: (hovered || rating) >= star ? 'none' : 'grayscale(1) opacity(0.3)' }}
                >
                  <StarIcon size={36} />
                </button>
              ))}
            </div>
            {(hovered || rating) > 0 && (
              <p className="text-center text-sm mb-6" style={{ color: 'var(--yv-brand-lift)' }}>
                {c.stars[(hovered || rating) - 1]}
              </p>
            )}

            {/* Comment */}
            <textarea
              value={comment}
              onChange={e => setComment(e.target.value)}
              placeholder={c.placeholder}
              rows={4}
              className="yv-input text-sm text-white/80 resize-none"
            />

            {error && <p className="text-red-400 text-[13px] mt-2">{error}</p>}

            <button
              onClick={handleSubmit}
              disabled={rating === 0 || submitting}
              className="w-full mt-4 py-3 rounded-xl text-sm font-bold transition-opacity disabled:opacity-40"
              style={{ background: 'var(--yv-brand-fill)', color: '#fff' }}
            >
              {submitting ? c.sending : c.submit}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default function FeedbackPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--yv-light)' }}>
        <p className="text-white/40 text-sm">Cargando...</p>
      </div>
    }>
      <FeedbackForm />
    </Suspense>
  );
}
