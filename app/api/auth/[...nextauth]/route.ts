import { handlers, readNativeSignoutCookie } from "@/auth";
import { guardNativeSignout } from "@/lib/signout-request-guard";
import type { NextRequest } from 'next/server';
export const GET = handlers.GET;
export function POST(request: NextRequest) {
  if (!new URL(request.url).pathname.endsWith('/signout')) return handlers.POST(request);
  return guardNativeSignout(request, readNativeSignoutCookie,
    original => handlers.POST(original as NextRequest));
}
