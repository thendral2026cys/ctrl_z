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
  return roundNumber === 2 || roundNumber === 3;
}

export function canAdminRestartChallenge(
  roundNumber: number,
  roundStatus: string,
) {
  return (
    isAutomaticScoringRound(roundNumber) &&
    ["OPEN", "SCHEDULED"].includes(roundStatus)
  );
}
