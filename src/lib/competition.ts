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

  if (round.status === "OPEN" || round.number === 1) {
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

  if (challenge.round.archivedAt) {
    throw new ApiError("This round is no longer available.", 403);
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

  if (challenge.round.archivedAt) {
    throw new ApiError("This round is no longer available.", 403);
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

export async function getMainAdminPracticeChallengeInTransaction(
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
  if (challenge.round.archivedAt) {
    throw new ApiError("This round is no longer available.", 403);
  }
  if (challenge.round.number < 2) {
    throw new ApiError(
      "Round 1 challenges are available on the external contest only.",
      403,
    );
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
        challenge: { round: { number: { gte: 2 } } },
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
    where: { disqualifiedAt: null, leaderboardHidden: false },
    select: {
      id: true,
      name: true,
      roundOneScore: true,
      challengeSolves: {
        where: { challenge: { round: { number: { gte: 2 } } } },
        select: { pointsAwarded: true, solvedAt: true },
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
      firstSolvedAt:
        team.challengeSolves.length > 0
          ? Math.min(
              ...team.challengeSolves.map((solve) => solve.solvedAt.getTime()),
            )
          : null,
    })),
  );
}

export async function getLeaderboardScoreHistory() {
  const teams = await prisma.team.findMany({
    where: { disqualifiedAt: null },
    select: {
      id: true,
      name: true,
      createdAt: true,
      challengeSolves: {
        where: { challenge: { round: { number: { gte: 2 } } } },
        select: { pointsAwarded: true, solvedAt: true },
      },
      scoreAdjustments: {
        select: { delta: true, createdAt: true },
      },
    },
  });

  return teams.map((team) => {
    const events = [
      ...team.challengeSolves.map((solve) => ({
        at: solve.solvedAt.getTime(),
        delta: solve.pointsAwarded,
      })),
      ...team.scoreAdjustments.map((adjustment) => ({
        at: adjustment.createdAt.getTime(),
        delta: adjustment.delta,
      })),
    ].sort((left, right) => left.at - right.at);

    let score = 0;
    const points = [{ at: team.createdAt.getTime(), score }];
    for (const event of events) {
      score = Math.max(0, score + event.delta);
      points.push({ at: event.at, score });
    }

    return { id: team.id, name: team.name, points };
  });
}
