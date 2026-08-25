// Precios canónicos de los planes — misma fuente para toda la web y el checkout.
// USD fijado a mano en Stripe (currency_options, 25/08/2026) con los mismos dígitos
// que EUR para que el mensaje sea simple: "mismo precio, distinta moneda".
export type Currency = 'eur' | 'usd';

// Países de la zona euro (moneda oficial EUR) — todo lo demás ve y paga en USD.
// Fuente única: la usan tanto /api/geo-currency (lo que se MUESTRA en la web) como
// /api/stripe/checkout (lo que se COBRA). Si divergen, un visitante vería "$9,99"
// y se le cobraría 9,99€ — el fallo que esta constante compartida evita.
const EUROZONE = new Set([
  'AT', 'BE', 'CY', 'EE', 'FI', 'FR', 'DE', 'GR', 'IE', 'IT', 'LV', 'LT',
  'LU', 'MT', 'NL', 'PT', 'SK', 'SI', 'ES', 'AD', 'MC', 'SM', 'VA', 'HR',
]);

/** Moneda a partir del código ISO de país (cabecera x-vercel-ip-country). Sin país → EUR. */
export function currencyForCountry(country: string | null | undefined): Currency {
  return country && !EUROZONE.has(country) ? 'usd' : 'eur';
}

export const PRICES = {
  pro: { monthly: { eur: 9.99, usd: 9.99 }, yearly: { eur: 99.99, usd: 99.99 } },
  business: { monthly: { eur: 29.99, usd: 29.99 }, yearly: { eur: 299, usd: 299 } },
} as const;

const SYMBOL: Record<Currency, string> = { eur: '€', usd: '$' };

// Los precios son idénticos en dígitos entre EUR y USD, así que solo cambia
// el símbolo y su posición (100€ vs $100).
export function formatPrice(amount: number, currency: Currency, lang: 'es' | 'en' = 'es'): string {
  const n = Number.isInteger(amount)
    ? String(amount)
    : amount.toFixed(2).replace('.', lang === 'en' ? '.' : ',');
  return currency === 'usd' ? `$${n}` : `${n}${SYMBOL.eur}`;
}
