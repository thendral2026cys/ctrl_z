-- Fix FinalSubmission.submittedAt: was @updatedAt (reset on every save),
-- now @default(now()) so it permanently records the first submission time.
-- A separate updatedAt column is added to track the last modification.

ALTER TABLE "FinalSubmission"
  -- Set a real DEFAULT so existing rows keep their current timestamp value
  -- and new rows get now() on INSERT without Prisma having to provide it.
  ALTER COLUMN "submittedAt" SET DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "FinalSubmission"
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
