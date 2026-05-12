import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getDemoResponse } from "@/lib/demo-data";

const protectedRoutes = ["/dashboard", "/generate", "/admin", "/profile", "/seo-score", "/ab-test", "/team", "/optimize", "/audit", "/achievements", "/thumbnail-preview", "/revenue"];

export default async function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname;

  // Demo mode: cookie ytv_demo=1 returns fake data for video recording
  if (path.startsWith('/api/') && req.cookies.get('ytv_demo')?.value === '1') {
    const demo = getDemoResponse(req);
    if (demo) return demo;
  }

  const isProtected = protectedRoutes.some((r) => path.startsWith(r));

  if (!isProtected) return NextResponse.next();

  const session = await auth();

  if (!session?.user) {
    return NextResponse.redirect(new URL("/login", req.nextUrl));
  }

  // Redirect unverified users to /verify-email (except /admin which is already access-controlled)
  // requiresVerification is only true for new signups that haven't verified yet.
  // Old sessions without this field default to false (not blocked).
  const requiresVerification = (session.user as { requiresVerification?: boolean }).requiresVerification ?? false;
  if (requiresVerification && !path.startsWith('/admin')) {
    return NextResponse.redirect(new URL("/verify-email", req.nextUrl));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
