'use client';

import { useCurrency } from '@/components/CurrencyProvider';
import { formatPrice } from '@/lib/pricing';

// Small client leaf so price displays can read the visitor's currency without
// forcing whole marketing pages (server components) to become client components.
export default function PriceTag({ amount, lang = 'es' }: { amount: number; lang?: 'es' | 'en' }) {
  const currency = useCurrency();
  return <>{formatPrice(amount, currency, lang)}</>;
}
