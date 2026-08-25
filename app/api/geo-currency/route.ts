import { NextRequest, NextResponse } from 'next/server';
import { currencyForCountry } from '@/lib/pricing';

export async function GET(req: NextRequest) {
  const country = req.headers.get('x-vercel-ip-country') || '';
  return NextResponse.json({ currency: currencyForCountry(country), country: country || null });
}
