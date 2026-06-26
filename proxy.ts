import NextAuth from "next-auth";
import { authConfig } from "./auth.config";
import { getDemoResponse } from "@/lib/demo-data";
import { NextRequest, NextResponse } from "next/server";
import type { Session } from "next-auth";

// Edge-compatible auth — reads JWT from cookie, zero DB calls, zero cold start.
// NOTE: do NOT import from "@/auth" here — that pulls in Prisma which is Node.js-only
// and forces the middleware off the Edge Runtime onto Node.js serverless, adding 2-5s
// cold start + Neon DB cold start on top = 9-16s landing times measured by Sentinel.
const { auth } = NextAuth(authConfig);

const protectedRoutes = [
  "/dashboard", "/generate", "/admin", "/profile", "/ab-test",
  "/team", "/optimize", "/audit", "/achievements", "/thumbnail-preview", "/revenue",
];

type AuthRequest = NextRequest & { auth: Session | null };

export default auth(function proxy(req: AuthRequest) {
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

  return NextResponse.next();
} as Parameters<typeof auth>[0]);

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
