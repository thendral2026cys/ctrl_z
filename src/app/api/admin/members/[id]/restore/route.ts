import { ApiError, handleApiError, readJson } from "@/lib/api";
import { prisma } from "@/lib/db";
import { assertSameOrigin } from "@/lib/security";
import { calculateTeamScore } from "@/lib/scoring";
import { requireMainAdmin } from "@/lib/server";
import { z } from "zod";

const restoreSchema = z.object({
  reason: z.string().trim().min(3).max(500),
});


export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOrigin(request);
    const session = await requireMainAdmin(request.headers);
    const { id } = await context.params;
    const input = restoreSchema.parse(await readJson(request));

    const result = await prisma.$transaction(
      async (transaction) => {
        const membership = await transaction.membership.findUnique({
          where: { id },
          include: {
            user: { select: { id: true, name: true } },
            removalScoreAdjustment: { select: { id: true, delta: true } },
          },
        });

        if (!membership || !membership.removedAt) {
          throw new ApiError("Removed team membership not found.", 404);
        }

        const [activeMemberCount, team] = await Promise.all([
          transaction.membership.count({
            where: { teamId: membership.teamId, removedAt: null },
          }),
          transaction.team.findUnique({
            where: { id: membership.teamId },
            select: { roundOneScore: true },
          }),
        ]);
        if (!team) {
          throw new ApiError("Team not found.", 404);
        }
        if (activeMemberCount >= 4) {
          throw new ApiError(
            "This team already has four active members. Remove a team member before restoring this participant.",
            409,
          );
        }

        // The removalScoreAdjustment foreign key is the authoritative source
        // for how many points were deducted at removal. If that record is not
        // linked (e.g. the member was removed under an older policy that didn't
        // deduct points, or the removal had no contribution), we conservatively
        // apply no reversal rather than risk matching the wrong audit log entry.
        const reversalDelta = membership.removalScoreAdjustment
          ? Math.max(0, -membership.removalScoreAdjustment.delta)
          : 0;

        const [solves, adjustments] = await Promise.all([
          transaction.challengeSolve.aggregate({
            where: {
              teamId: membership.teamId,
              challenge: { round: { number: { gte: 2 } } },
            },
            _sum: { pointsAwarded: true },
          }),
          transaction.scoreAdjustment.aggregate({
            where: { teamId: membership.teamId, roundNumber: null },
            _sum: { delta: true },
          }),
        ]);
        const previousScore = calculateTeamScore(
          team.roundOneScore,
          solves._sum.pointsAwarded ?? 0,
          adjustments._sum.delta ?? 0,
        );
        const newScore = previousScore + reversalDelta;

        if (reversalDelta > 0) {
          await transaction.scoreAdjustment.create({
            data: {
              teamId: membership.teamId,
              actorId: session.user.id,
              delta: reversalDelta,
              previousScore,
              newScore,
              reason: `Participant removal reversal (${membership.user.name}): ${input.reason}`,
            },
          });
        }

        if (membership.role === "LEADER") {
          await transaction.membership.updateMany({
            where: {
              teamId: membership.teamId,
              role: "LEADER",
              removedAt: null,
            },
            data: { role: "MEMBER" },
          });
        }

        await transaction.membership.update({
          where: { id },
          data: {
            removedAt: null,
            removedContributionPolicy: null,
            removalScoreAdjustmentId: null,
          },
        });

        await transaction.activityLog.create({
          data: {
            actorId: session.user.id,
            actorRole: "ADMIN",
            teamId: membership.teamId,
            action: "TEAM_MEMBER_RESTORED",
            details: {
              administratorEmail: session.user.email,
              membershipId: membership.id,
              participantId: membership.userId,
              participantName: membership.user.name,
              reversedContribution: reversalDelta,
              previousScore,
              newScore,
              reason: input.reason,
            },
          },
        });

        return {
          restored: true,
          membershipId: membership.id,
          reversedContribution: reversalDelta,
          previousScore,
          newScore,
        };
      },
      { isolationLevel: "Serializable" },
    );

    return Response.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}
