DELETE FROM "Session" AS older
USING "Session" AS newer
WHERE older."userId" = newer."userId"
  AND (
    older."createdAt" < newer."createdAt"
    OR (
      older."createdAt" = newer."createdAt"
      AND older."id" < newer."id"
    )
  );

DROP INDEX IF EXISTS "Session_userId_idx";

CREATE UNIQUE INDEX "Session_userId_key" ON "Session"("userId");
