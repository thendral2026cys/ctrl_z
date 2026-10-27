CREATE TYPE "TeamJoinRequestStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DENIED');

CREATE TABLE "TeamJoinRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "status" "TeamJoinRequestStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),
    "decidedById" TEXT,

    CONSTRAINT "TeamJoinRequest_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "TeamJoinRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "TeamJoinRequest_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "TeamJoinRequest_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "TeamJoinRequest_teamId_status_createdAt_idx"
    ON "TeamJoinRequest"("teamId", "status", "createdAt");
CREATE INDEX "TeamJoinRequest_userId_createdAt_idx"
    ON "TeamJoinRequest"("userId", "createdAt");
CREATE UNIQUE INDEX "TeamJoinRequest_one_pending_per_user_idx"
    ON "TeamJoinRequest"("userId")
    WHERE "status" = 'PENDING';
