import { NextRequest, NextResponse } from 'next/server';
import { getExtensionUser } from '@/lib/extension-auth';
import { createAbTest, countActiveAbTests } from '@/lib/ab-test';

// GET — cuenta de tests activos, para pintar "N/M activos" en el panel de la
// extensión sin traer los 20 registros completos que sí devuelve la ruta web.
export async function GET(request: Request) {
  const ext = await getExtensionUser(request);
  if (!ext) return NextResponse.json({ error: 'not_logged_in' }, { status: 401 });

  const active = await countActiveAbTests(ext.user.id);
  return NextResponse.json({ active });
}

export async function POST(request: NextRequest) {
  const ext = await getExtensionUser(request);
  if (!ext) return NextResponse.json({ error: 'not_logged_in' }, { status: 401 });

  const body = await request.json();
  const result = await createAbTest(ext.user.id, body);
  if (!result.ok) {
    return NextResponse.json({ error: result.error, limit: result.limit }, { status: result.status });
  }
  return NextResponse.json({ test: result.test }, { status: 201 });
}
