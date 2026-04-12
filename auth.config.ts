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
  },
};
