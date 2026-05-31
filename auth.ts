import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { authConfig } from "./auth.config";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID?.trim(),
      clientSecret: process.env.GOOGLE_CLIENT_SECRET?.trim(),
    }),
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
    async signIn({ user, account }) {
      // Google OAuth: create or link user in DB
      if (account?.provider === 'google' && user.email) {
        const existing = await prisma.user.findUnique({ where: { email: user.email } });
        if (existing) {
          // Link Google to existing account — mark as verified
          if (!existing.emailVerified) {
            await prisma.user.update({ where: { id: existing.id }, data: { emailVerified: new Date() } });
          }
          user.id = existing.id;
        } else {
          // Create new user from Google
          const newUser = await prisma.user.create({
            data: {
              email: user.email,
              name: user.name || null,
              emailVerified: new Date(),
            },
          });
          user.id = newUser.id;
        }
      }
      return true;
    },
    async jwt({ token, user, trigger, account }) {
      if (user) {
        token.id = user.id;
        // Google users are always verified
        if (account?.provider === 'google') {
          token.requiresVerification = false;
        } else {
          const ev = (user as { emailVerified?: Date | null }).emailVerified;
          // Only explicitly null means "new unverified user" — undefined means legacy session
          token.requiresVerification = ev === null;
        }
        token.isAdmin = user.email === process.env.ADMIN_EMAIL;
      }
      // On session update(), re-check emailVerified from DB to unblock verified users
      if (trigger === 'update' && token.requiresVerification && token.id) {
        const fresh = await prisma.user.findUnique({
          where: { id: token.id as string },
          select: { emailVerified: true },
        });
        if (fresh?.emailVerified) {
          token.requiresVerification = false;
        }
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
