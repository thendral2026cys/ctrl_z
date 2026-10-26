import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { ApiError } from "@/lib/api";
import { prisma } from "@/lib/db";

const attemptLimit = 20;

// Accept either a top-level Prisma client or a transaction client so this
// function can be called inside a Serializable transaction (eliminating the
// TOCTOU gap between the rate-limit check and the actual solve creation).
type DbClient = Prisma.TransactionClient | typeof prisma;

export async function enforceFlagAttemptLimit(
  db: DbClient,
  teamId: string,
  challengeId: string,
) {
  const key = `${teamId}:${challengeId}`;
  const [bucket] = await db.$queryRaw<{ count: number }[]>`
    INSERT INTO "FlagRateLimit" ("id", "key", "count", "windowStartedAt")
    VALUES (${randomUUID()}, ${key}, 1, CURRENT_TIMESTAMP)
    ON CONFLICT ("key") DO UPDATE
    SET
      "count" = CASE
        WHEN "FlagRateLimit"."windowStartedAt" <= CURRENT_TIMESTAMP - INTERVAL '5 minutes'
          THEN 1
        ELSE LEAST("FlagRateLimit"."count" + 1, ${attemptLimit + 1})
      END,
      "windowStartedAt" = CASE
        WHEN "FlagRateLimit"."windowStartedAt" <= CURRENT_TIMESTAMP - INTERVAL '5 minutes'
          THEN CURRENT_TIMESTAMP
        ELSE "FlagRateLimit"."windowStartedAt"
      END
    RETURNING "count"
  `;

  if (!bucket) {
    throw new Error("Flag rate-limit state could not be updated.");
  }

  if (bucket.count > attemptLimit) {
    throw new ApiError(
      "This team has reached the attempt limit. Try again in five minutes.",
      429,
    );
  }
}
