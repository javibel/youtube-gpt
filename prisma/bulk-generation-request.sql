CREATE TABLE IF NOT EXISTS public.bulk_generation_requests (
  id text PRIMARY KEY,
  "userId" text NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  "inputDigest" text NOT NULL CHECK ("inputDigest" ~ '^[a-f0-9]{64}$'),
  "itemCount" integer NOT NULL CHECK ("itemCount" BETWEEN 1 AND 10),
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS bulk_generation_requests_userid_createdat_idx
  ON public.bulk_generation_requests ("userId", "createdAt");
