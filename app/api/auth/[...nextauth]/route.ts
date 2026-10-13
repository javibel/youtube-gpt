import { handlers, readNativeSignoutCookie, readNativeSessionCookie } from "@/auth";
import { guardNativeSignout } from "@/lib/signout-request-guard";
import { guardNativeTotpUpdate } from "@/lib/totp-request-guard";
import type { NextRequest } from 'next/server';
export const GET = handlers.GET;
export function POST(request: NextRequest) {
  const path = new URL(request.url).pathname;
  if (path.endsWith('/session')) return guardNativeTotpUpdate(request, readNativeSessionCookie,
    original => handlers.POST(original as NextRequest));
  if (!path.endsWith('/signout')) return handlers.POST(request);
  return guardNativeSignout(request, readNativeSignoutCookie,
    original => handlers.POST(original as NextRequest));
}
