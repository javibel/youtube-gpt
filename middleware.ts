import { NextRequest, NextResponse } from 'next/server';
import { getDemoResponse } from '@/lib/demo-data';

export function middleware(req: NextRequest) {
  // Demo mode: return fake data for video recording
  if (req.cookies.get('ytv_demo')?.value === '1') {
    const demo = getDemoResponse(req);
    if (demo) return demo;
  }

  return NextResponse.next();
}

export const config = {
  matcher: '/api/:path*',
};
