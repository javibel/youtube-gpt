import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { authConfig } from "./auth.config";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { ADMIN_EMAIL } from "@/lib/admin-email";
import { authenticator } from "otplib";
import { rateLimitDb } from "@/lib/rate-limit-db";

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
        totp: { label: "2FA code", type: "text" },
      },
      async authorize(credentials, request) {
        if (!credentials?.email || !credentials?.password) return null;
        const email = String(credentials.email).toLowerCase().trim();

        const user = await prisma.user.findUnique({
          where: { email },
        });

        if (!user || !user.password) return null;

        const passwordMatch = await bcrypt.compare(
          credentials.password as string,
          user.password
        );

        if (!passwordMatch) return null;

        // A6 (2026-07-05): the admin account needs a second factor on top of the password.
        // Secret lives in an env var, never in the DB — with a single admin that's simpler
        // and means a read-only DB leak alone can't hand over the second factor. No-op for
        // every other user, and a deliberate no-op for the admin too if the var isn't set
        // (bootstrap window / recovery path is "delete the var, re-enroll").
        const totpSecret = process.env.ADMIN_TOTP_SECRET;
        if (ADMIN_EMAIL && email === ADMIN_EMAIL && totpSecret) {
          const ip = request?.headers?.get('x-forwarded-for')?.split(',')[0]?.trim()
            ?? request?.headers?.get('x-real-ip')
            ?? 'unknown';
          const allowed = await rateLimitDb(`admin-totp:${ip}`, 10, 15);
          if (!allowed) return null;

          const totp = String(credentials.totp ?? '').trim();
          if (!totp || !authenticator.verify({ token: totp, secret: totpSecret })) return null;
        }

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
        const normalizedEmail = user.email.toLowerCase().trim();
        // A6: the admin logs in with credentials + TOTP only — Google would bypass that
        // second factor entirely, so it's blocked outright for that one email.
        if (ADMIN_EMAIL && normalizedEmail === ADMIN_EMAIL) {
          return false;
        }
        user.email = normalizedEmail;
        const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
        if (existing) {
          // Link Google to existing account — mark as verified
          if (!existing.emailVerified) {
            await prisma.user.update({ where: { id: existing.id }, data: { emailVerified: new Date() } });
          }
          user.id = existing.id;
        } else {
          // Create new user from Google — capture attribution from first-party cookies.
          // Mismo patrón (y mismo gating de consentimiento) que el formulario de email:
          // ytv_ref = código de referido (peer-to-peer); ytv_utm = campaña UTM de entrada;
          // ytv_aff = código de AFILIADO (programa de creadores, namespace separado a
          // propósito de ytv_ref — ver prisma/schema.prisma User.referredByCode).
          let referredBy: string | undefined;
          let referredByCode: string | undefined;
          let utmSource: string | undefined;
          let utmMedium: string | undefined;
          let utmCampaign: string | undefined;
          try {
            const cookieStore = await cookies();
            const refCookie = cookieStore.get('ytv_ref');
            if (refCookie?.value) referredBy = refCookie.value.slice(0, 20);
            const affCookie = cookieStore.get('ytv_aff');
            if (affCookie?.value) referredByCode = affCookie.value.slice(0, 40);
            const utmCookie = cookieStore.get('ytv_utm');
            if (utmCookie?.value) {
              let raw = utmCookie.value;
              try { raw = decodeURIComponent(raw); } catch {}
              try {
                const parsed = JSON.parse(raw);
                if (typeof parsed.source === 'string') utmSource = parsed.source.slice(0, 100);
                if (typeof parsed.medium === 'string') utmMedium = parsed.medium.slice(0, 100);
                if (typeof parsed.campaign === 'string') utmCampaign = parsed.campaign.slice(0, 100);
              } catch {}
            }
          } catch {}
          const newUser = await prisma.user.create({
            data: {
              email: user.email,
              name: user.name || null,
              emailVerified: new Date(),
              referredBy,
              referredByCode,
              referredAt: referredByCode ? new Date() : undefined,
              utmSource,
              utmMedium,
              utmCampaign,
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
        token.isAdmin = !!ADMIN_EMAIL && user.email?.toLowerCase().trim() === ADMIN_EMAIL;
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
