import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";

const protectedRoutes = ["/dashboard", "/generate", "/admin", "/research", "/competitors", "/profile"];
const publicRoutes = ["/", "/login", "/signup"];

export default async function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname;
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
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
