export function calculateTeamScore(
  roundOneScore: number,
  challengePoints: number,
  manualAdjustment: number,
) {
  return Math.max(0, roundOneScore + challengePoints + manualAdjustment);
}

export function allocateRoundOneScore(
  score: number,
  members: { userId: string }[],
) {
  if (members.length === 0) {
    throw new Error("A Round 1 score requires an active team member.");
  }

  return members.map(({ userId }) => ({
    userId,
    scoreNumerator: score,
    scoreDenominator: members.length,
  }));
}

export function isAutomaticScoringRound(roundNumber: number) {
  return roundNumber >= 2;
}

export function canAdminRestartChallenge(
  roundNumber: number,
  roundStatus: string,
) {
  return (
    isAutomaticScoringRound(roundNumber) &&
    ["OPEN", "SCHEDULED", "CLOSED"].includes(roundStatus)
  );
}

export function rankTeams<
  T extends {
    id: string;
    name: string;
    score: number;
    firstSolvedAt?: number | null;
  },
>(
  teams: T[],
) {
  const sorted = [...teams].sort(
    (left, right) => {
      const timeDifference =
        left.firstSolvedAt == null
          ? right.firstSolvedAt == null
            ? 0
            : 1
          : right.firstSolvedAt == null
            ? -1
            : left.firstSolvedAt - right.firstSolvedAt;
      return (
        right.score - left.score ||
        timeDifference ||
        left.name.localeCompare(right.name, "en", { sensitivity: "base" }) ||
        left.name.localeCompare(right.name) ||
        left.id.localeCompare(right.id)
      );
    },
  );

  let previousScore: number | undefined;
  let previousFirstSolvedAt: number | null | undefined;
  let previousRank = 0;

  return sorted.map((team, index) => {
    const firstSolvedAt = team.firstSolvedAt ?? null;
    const rank =
      team.score === previousScore &&
      firstSolvedAt === previousFirstSolvedAt
        ? previousRank
        : index + 1;
    previousScore = team.score;
    previousFirstSolvedAt = firstSolvedAt;
    previousRank = rank;
    return { ...team, rank };
  });
}
