// Single source of truth for the normalized admin email (A9, 2026-07-05).
// Split out from lib/auth-guards.ts to avoid a circular import: auth.ts needs this
// constant too, and auth-guards.ts imports from "@/auth" (which is auth.ts).
export const ADMIN_EMAIL = (process.env.ADMIN_EMAIL ?? '').toLowerCase().trim();
