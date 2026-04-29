import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { authConfig } from "./auth.config";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const user = await prisma.user.findUnique({
          where: { email: credentials.email as string },
        });

        if (!user || !user.password) return null;

        const passwordMatch = await bcrypt.compare(
          credentials.password as string,
          user.password
        );

        if (!passwordMatch) return null;

        // Auto-verify legacy users created before email verification was added (pre-March 2026).
        // Users created after must verify their email — no bypass even if token expired.
        if (!user.emailVerified) {
          const LEGACY_CUTOFF = new Date('2026-03-01T00:00:00Z');
          if (user.createdAt < LEGACY_CUTOFF) {
            await prisma.user.update({
              where: { id: user.id },
              data: { emailVerified: new Date() },
            });
            return { id: user.id, email: user.email, name: user.name, emailVerified: new Date() };
          }
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          emailVerified: user.emailVerified,
        };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        const ev = (user as { emailVerified?: Date | null }).emailVerified;
        // Only explicitly null means "new unverified user" — undefined means legacy session
        token.requiresVerification = ev === null;
        token.isAdmin = user.email === process.env.ADMIN_EMAIL;
      }
      return token;
    },
    session({ session, token }) {
      if (token?.id) session.user.id = token.id as string;
      // Old JWTs don't have requiresVerification → default false (don't block legacy sessions)
      (session.user as { requiresVerification?: boolean }).requiresVerification =
        (token.requiresVerification as boolean | undefined) ?? false;
      (session.user as { isAdmin?: boolean }).isAdmin =
        (token.isAdmin as boolean | undefined) ?? false;
      return session;
    },
  },
});
