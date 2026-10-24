import { ApiError, handleApiError, readJson } from "@/lib/api";
import { prisma } from "@/lib/db";
import { assertSameOrigin } from "@/lib/security";
import { requireAdmin } from "@/lib/server";
import { z } from "zod";

const removalSchema = z.object({
  contributionPolicy: z.enum(["RETAIN", "EXCLUDE"]),
  reason: z.string().trim().min(3).max(500),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOrigin(request);
    const session = await requireAdmin(request.headers);
    const { id } = await context.params;
    const input = removalSchema.parse(await readJson(request));

    const result = await prisma.$transaction(async (transaction) => {
      const membership = await transaction.membership.findUnique({
        where: { id },
        include: { user: { select: { name: true } } },
      });

      if (!membership || membership.removedAt) {
        throw new ApiError("Active team membership not found.", 404);
      }

      let contributionRemoved = 0;
      if (input.contributionPolicy === "EXCLUDE") {
        const [solves, scoreSolves, scoreAdjustments] = await Promise.all([
          transaction.challengeSolve.aggregate({
            where: {
              teamId: membership.teamId,
              solvingUserId: membership.userId,
            },
            _sum: { pointsAwarded: true },
          }),
          transaction.challengeSolve.aggregate({
            where: { teamId: membership.teamId },
            _sum: { pointsAwarded: true },
          }),
          transaction.scoreAdjustment.aggregate({
            where: { teamId: membership.teamId },
            _sum: { delta: true },
          }),
        ]);
        const score = Math.max(
          0,
          (scoreSolves._sum.pointsAwarded ?? 0) +
            (scoreAdjustments._sum.delta ?? 0),
        );
        contributionRemoved = Math.min(
          solves._sum.pointsAwarded ?? 0,
          score,
        );

        if (contributionRemoved > 0) {
          await transaction.scoreAdjustment.create({
            data: {
              teamId: membership.teamId,
              actorId: session.user.id,
              delta: -contributionRemoved,
              reason: `Participant removal (${membership.user.name}): ${input.reason}`,
            },
          });
        }
      }

      const updated = await transaction.membership.update({
        where: { id },
        data: {
          removedAt: new Date(),
          removedContributionPolicy: input.contributionPolicy,
        },
      });

      if (membership.role === "LEADER") {
        const replacement = await transaction.membership.findFirst({
          where: {
            teamId: membership.teamId,
            removedAt: null,
            id: { not: id },
          },
          orderBy: { joinedAt: "asc" },
        });
        if (replacement) {
          await transaction.membership.update({
            where: { id: replacement.id },
            data: { role: "LEADER" },
          });
        }
      }

      await transaction.activityLog.create({
        data: {
          actorId: session.user.id,
          actorRole: "ADMIN",
          teamId: membership.teamId,
          action: "TEAM_MEMBER_REMOVED",
          details: {
            participantName: membership.user.name,
            contributionPolicy: input.contributionPolicy,
            contributionRemoved,
            reason: input.reason,
          },
        },
      });

      return updated;
    }, { isolationLevel: "Serializable" });

    return Response.json({
      removed: true,
      membershipId: result.id,
      contributionPolicy: result.removedContributionPolicy,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
