import { Prisma } from "@prisma/client";
import { ApiError } from "@/lib/api";
import { prisma } from "@/lib/db";

export function isRoundAvailable(
  round: {
    number: number;
    enabled: boolean;
    status: string;
    opensAt: Date | null;
    closesAt: Date | null;
  },
  previousRound: { status: string; closesAt: Date | null } | null,
  now = new Date(),
) {
  if (
    !round.enabled ||
    !["OPEN", "SCHEDULED"].includes(round.status) ||
    (round.opensAt && round.opensAt > now) ||
    (round.closesAt && round.closesAt <= now)
  ) {
    return false;
  }

  if (round.number === 1) {
    return true;
  }

  return Boolean(
    previousRound &&
      (previousRound.status === "CLOSED" ||
        (previousRound.closesAt && previousRound.closesAt <= now)),
  );
}

export async function getAvailableChallenge(challengeId: string) {
  const challenge = await prisma.challenge.findUnique({
    where: { id: challengeId },
    include: { round: true },
  });

  if (!challenge || !challenge.enabled) {
    throw new ApiError("Challenge is unavailable.", 404);
  }

  const previousRound =
    challenge.round.number > 1
      ? await prisma.round.findUnique({
          where: { number: challenge.round.number - 1 },
          select: { status: true, closesAt: true },
        })
      : null;

  if (!isRoundAvailable(challenge.round, previousRound)) {
    throw new ApiError("This round is not open yet.", 403);
  }

  const now = new Date();

  if (
    (challenge.opensAt && challenge.opensAt > now) ||
    (challenge.closesAt && challenge.closesAt <= now)
  ) {
    throw new ApiError("Challenge is outside its availability window.", 403);
  }

  return challenge;
}

export async function getAvailableChallengeInTransaction(
  transaction: Prisma.TransactionClient,
  challengeId: string,
) {
  const challenge = await transaction.challenge.findUnique({
    where: { id: challengeId },
    include: { round: true },
  });
  if (!challenge || !challenge.enabled) {
    throw new ApiError("Challenge is unavailable.", 404);
  }

  const previousRound =
    challenge.round.number > 1
      ? await transaction.round.findUnique({
          where: { number: challenge.round.number - 1 },
          select: { status: true, closesAt: true },
        })
      : null;

  if (!isRoundAvailable(challenge.round, previousRound)) {
    throw new ApiError("This round is not open yet.", 403);
  }

  const now = new Date();
  if (
    (challenge.opensAt && challenge.opensAt > now) ||
    (challenge.closesAt && challenge.closesAt <= now)
  ) {
    throw new ApiError("Challenge is outside its availability window.", 403);
  }

  return challenge;
}

export async function getTeamScore(teamId: string) {
  const [solves, adjustments] = await Promise.all([
    prisma.challengeSolve.aggregate({
      where: { teamId },
      _sum: { pointsAwarded: true },
    }),
    prisma.scoreAdjustment.aggregate({
      where: { teamId },
      _sum: { delta: true },
    }),
  ]);

  return Math.max(
    0,
    (solves._sum.pointsAwarded ?? 0) + (adjustments._sum.delta ?? 0),
  );
}
