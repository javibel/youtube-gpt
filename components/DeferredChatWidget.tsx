'use client';

import { useEffect, useState, lazy, Suspense } from 'react';

const ChatWidget = lazy(() => import('@/components/ChatWidget'));

// Difiere el ChatWidget hasta idle/primera interacción (A2): no aporta nada al
// primer pintado y su JS competía con el contenido en la carga inicial.
export default function DeferredChatWidget() {
  const [load, setLoad] = useState(false);

  useEffect(() => {
    const trigger = () => setLoad(true);
    const w = window as Window & { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void };
    const idle = w.requestIdleCallback
      ? w.requestIdleCallback(trigger, { timeout: 4000 })
      : window.setTimeout(trigger, 3000);
    window.addEventListener('pointerdown', trigger, { once: true, passive: true });
    window.addEventListener('scroll', trigger, { once: true, passive: true });
    return () => {
      if (w.cancelIdleCallback) w.cancelIdleCallback(idle);
      else clearTimeout(idle);
      window.removeEventListener('pointerdown', trigger);
      window.removeEventListener('scroll', trigger);
    };
  }, []);

  if (!load) return null;
  return <Suspense fallback={null}><ChatWidget /></Suspense>;
}
