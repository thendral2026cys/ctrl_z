import { Prisma } from "@prisma/client";
import { ApiError } from "@/lib/api";
import { prisma } from "@/lib/db";
import { calculateTeamScore, rankTeams } from "@/lib/scoring";

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
    (round.closesAt && round.closesAt <= now)
  ) {
    return false;
  }

  // A SCHEDULED round is only available once its opensAt time has passed.
  // An OPEN round (manually started) has no opensAt gate.
  if (round.status === "SCHEDULED") {
    if (!round.opensAt || round.opensAt > now) return false;
  } else if (round.opensAt && round.opensAt > now) {
    // OPEN rounds can still have a future opensAt if they were rescheduled.
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

  if (!challenge) {
    throw new ApiError("Challenge not found.", 404);
  }

  if (!challenge.enabled) {
    throw new ApiError(
      "Challenge is not published yet. Please enable it in the Organizer Workspace.",
      403,
    );
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
  if (!challenge) {
    throw new ApiError("Challenge not found.", 404);
  }

  if (!challenge.enabled) {
    throw new ApiError(
      "Challenge is not published yet. Please enable it in the Organizer Workspace.",
      403,
    );
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
  const [team, solves, adjustments] = await Promise.all([
    prisma.team.findUnique({
      where: { id: teamId },
      select: { roundOneScore: true },
    }),
    prisma.challengeSolve.aggregate({
      where: {
        teamId,
        challenge: { round: { number: { in: [2, 3] } } },
      },
      _sum: { pointsAwarded: true },
    }),
    prisma.scoreAdjustment.aggregate({
      where: { teamId, roundNumber: null },
      _sum: { delta: true },
    }),
  ]);

  if (!team) {
    throw new ApiError("Team not found.", 404);
  }

  return calculateTeamScore(
    team.roundOneScore,
    solves._sum.pointsAwarded ?? 0,
    adjustments._sum.delta ?? 0,
  );
}

export async function getRankedTeamLeaderboard() {
  const teams = await prisma.team.findMany({
    select: {
      id: true,
      name: true,
      roundOneScore: true,
      challengeSolves: {
        where: { challenge: { round: { number: { in: [2, 3] } } } },
        select: { pointsAwarded: true },
      },
      scoreAdjustments: {
        where: { roundNumber: null },
        select: { delta: true },
      },
    },
  });

  return rankTeams(
    teams.map((team) => ({
      id: team.id,
      name: team.name,
      score: calculateTeamScore(
        team.roundOneScore,
        team.challengeSolves.reduce(
          (total, solve) => total + solve.pointsAwarded,
          0,
        ),
        team.scoreAdjustments.reduce(
          (total, adjustment) => total + adjustment.delta,
          0,
        ),
      ),
    })),
  );
}
