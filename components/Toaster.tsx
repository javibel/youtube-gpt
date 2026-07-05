'use client';

import { useEffect, useState } from 'react';
import { CheckIcon, CrossIcon } from '@/components/icons';

// Sistema de toasts global sin dependencias.
// Uso desde cualquier client component: import { toast } from '@/components/Toaster';
// toast('Mensaje', 'error' | 'success' | 'info')
// <Toaster /> se monta una vez en app/layout.tsx.

type ToastType = 'error' | 'success' | 'info';
type ToastItem = { id: number; msg: string; type: ToastType };

export function toast(msg: string, type: ToastType = 'info') {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('yv-toast', { detail: { msg, type } }));
}

const COLORS: Record<ToastType, { border: string; Icon: (props: { size?: number; className?: string; style?: React.CSSProperties }) => React.ReactElement | null }> = {
  error: { border: 'rgba(232,77,91,0.5)', Icon: CrossIcon },
  success: { border: 'rgba(124,255,0,0.4)', Icon: CheckIcon },
  info: { border: 'rgba(255,255,255,0.2)', Icon: () => <span className="font-mono-jb text-[13px]">i</span> },
};

let nextId = 1;

export default function Toaster() {
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(() => {
    function onToast(e: Event) {
      const { msg, type } = (e as CustomEvent).detail as { msg: string; type: ToastType };
      const id = nextId++;
      setItems((prev) => [...prev.slice(-3), { id, msg, type }]);
      setTimeout(() => setItems((prev) => prev.filter((t) => t.id !== id)), 4500);
    }
    window.addEventListener('yv-toast', onToast);
    return () => window.removeEventListener('yv-toast', onToast);
  }, []);

  if (items.length === 0) return null;

  return (
    // pointer-events-none: los toasts son informativos; sin esto bloqueaban los
    // botones del banner de cookies cuando coincidían abajo en móvil (E3)
    <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[300] flex flex-col gap-2 w-[calc(100%-32px)] max-w-md pointer-events-none" role="status" aria-live="polite">
      {items.map((t) => {
        const { Icon } = COLORS[t.type];
        return (
          <div
            key={t.id}
            className="flex items-start gap-3 px-4 py-3 rounded-xl text-sm text-white backdrop-blur-md shadow-lg"
            style={{ background: 'rgba(17,17,20,0.95)', border: `1px solid ${COLORS[t.type].border}` }}
          >
            <span className="mt-0.5 shrink-0" style={{ color: COLORS[t.type].border.replace('0.5', '1').replace('0.4', '1').replace('0.2', '0.7') }}>
              <Icon size={14} />
            </span>
            <span className="leading-snug">{t.msg}</span>
          </div>
        );
      })}
    </div>
  );
}
