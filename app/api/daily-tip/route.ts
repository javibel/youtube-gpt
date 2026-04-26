import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

function todayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

const FALLBACK = {
  es: 'Los títulos con un número específico (7, 23, 147) superan a los genéricos en un 36% de CTR. Prueba "7 errores..." la próxima vez.',
  en: 'Titles with a specific number (7, 23, 147) outperform generic ones by 36% CTR. Try "7 mistakes..." next time.',
};

export async function GET() {
  const tip = await prisma.dailyTip.findUnique({ where: { date: todayUTC() } });
  return NextResponse.json(tip ?? { ...FALLBACK, date: todayUTC() });
}
