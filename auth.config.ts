import type { NextAuthConfig } from "next-auth";

// Configuración Edge-compatible (sin Prisma).
// Usada por el middleware para verificar sesión.
export const authConfig: NextAuthConfig = {
  pages: {
    signIn: "/login",
  },
  providers: [],
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const isProtected = nextUrl.pathname.startsWith("/dashboard");

      if (isProtected) return isLoggedIn;
      return true;
    },
    // Without this, @auth/core's DEFAULT session callback runs instead (it rebuilds
    // session.user from scratch with only {name, email, image} and silently drops any
    // custom token claim). proxy.ts reads exactly this config, so requiresVerification/
    // isAdmin/requiresTotp were always undefined there regardless of what auth.ts's own
    // session callback computed — the gates in proxy.ts never actually fired. Pure
    // token→session copying, no DB access, so it's Edge-safe to duplicate here.
    session({ session, token }) {
      if (token?.id) session.user.id = token.id as string;
      (session.user as { requiresVerification?: boolean }).requiresVerification =
        (token.requiresVerification as boolean | undefined) ?? false;
      (session.user as { isAdmin?: boolean }).isAdmin =
        (token.isAdmin as boolean | undefined) ?? false;
      (session.user as { requiresTotp?: boolean }).requiresTotp =
        (token.requiresTotp as boolean | undefined) ?? false;
      return session;
    },
  },
};
