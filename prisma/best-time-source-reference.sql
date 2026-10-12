-- Preserve unknown historical source time; do not backfill or renew it.
ALTER TABLE best_time_analysis_attempts ADD COLUMN "referenceAt" TIMESTAMP(3);
