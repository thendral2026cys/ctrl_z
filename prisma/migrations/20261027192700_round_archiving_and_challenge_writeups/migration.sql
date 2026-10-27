ALTER TABLE "Round"
ADD COLUMN "archivedAt" TIMESTAMP(3);

CREATE TABLE "ChallengeWriteup" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "challengeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChallengeWriteup_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ChallengeWriteup_challengeId_userId_key"
ON "ChallengeWriteup"("challengeId", "userId");

CREATE INDEX "ChallengeWriteup_teamId_challengeId_idx"
ON "ChallengeWriteup"("teamId", "challengeId");

ALTER TABLE "ChallengeWriteup"
ADD CONSTRAINT "ChallengeWriteup_teamId_fkey"
FOREIGN KEY ("teamId") REFERENCES "Team"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ChallengeWriteup"
ADD CONSTRAINT "ChallengeWriteup_challengeId_fkey"
FOREIGN KEY ("challengeId") REFERENCES "Challenge"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ChallengeWriteup"
ADD CONSTRAINT "ChallengeWriteup_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
