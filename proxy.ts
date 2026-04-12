import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";

const protectedRoutes = ["/dashboard", "/generate"];
const publicRoutes = ["/", "/login", "/signup"];

export default async function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname;
  const isProtected = protectedRoutes.some((r) => path.startsWith(r));

  if (!isProtected) return NextResponse.next();

  const session = await auth();

  if (!session?.user) {
    return NextResponse.redirect(new URL("/login", req.nextUrl));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
