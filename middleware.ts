import NextAuth from "next-auth";
import { authConfig } from "./auth.config";
import { getDemoResponse } from "@/lib/demo-data";
import { NextRequest, NextResponse } from "next/server";
import type { Session } from "next-auth";

// Keep this JWT-only boundary on Edge. Next16's proxy.ts always runs on Node,
// where instrumentation also prepares the AI runtime before serving a page.
// middleware.ts retains Edge support and avoids that unrelated startup work.
// Do not import @/auth here: the existing authConfig preserves the cookie gates
// without pulling Prisma or provider preparation into navigation.
const { auth } = NextAuth(authConfig);

const protectedRoutes = [
  "/dashboard", "/generate", "/admin", "/profile", "/ab-test",
  "/team", "/optimize", "/audit", "/achievements", "/thumbnail-preview", "/revenue",
];

type AuthRequest = NextRequest & { auth: Session | null };

export default auth(function middleware(req: AuthRequest) {
  const path = req.nextUrl.pathname;

  // Demo mode: cookie ytv_demo=1 returns fake data for video recording
  if (path.startsWith('/api/') && req.cookies.get('ytv_demo')?.value === '1') {
    const demo = getDemoResponse(req);
    if (demo) return demo;
  }

  const isProtected = protectedRoutes.some((r) => path.startsWith(r));
  if (!isProtected) return NextResponse.next();

  if (!req.auth?.user) {
    return NextResponse.redirect(new URL("/login", req.nextUrl));
  }

  const requiresVerification =
    (req.auth.user as { requiresVerification?: boolean }).requiresVerification ?? false;
  if (requiresVerification && !path.startsWith('/admin')) {
    return NextResponse.redirect(new URL("/verify-email", req.nextUrl));
  }

  // Admin signed in via Google: session is valid but gated behind TOTP until
  // /verify-totp confirms the code (see auth.ts jwt callback).
  const requiresTotp =
    (req.auth.user as { requiresTotp?: boolean }).requiresTotp ?? false;
  if (requiresTotp && path !== "/verify-totp") {
    return NextResponse.redirect(new URL("/verify-totp", req.nextUrl));
  }

  return NextResponse.next();
} as Parameters<typeof auth>[0]);

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
