ALTER TABLE "Membership"
ADD COLUMN "removalScoreAdjustmentId" TEXT;

CREATE UNIQUE INDEX "Membership_removalScoreAdjustmentId_key"
ON "Membership"("removalScoreAdjustmentId");

ALTER TABLE "Membership"
ADD CONSTRAINT "Membership_removalScoreAdjustmentId_fkey"
FOREIGN KEY ("removalScoreAdjustmentId")
REFERENCES "ScoreAdjustment"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;

ALTER TABLE "EventConfig"
ALTER COLUMN "eventTimezone" SET DEFAULT 'Asia/Kolkata';

UPDATE "EventConfig"
SET "eventTimezone" = 'Asia/Kolkata';
