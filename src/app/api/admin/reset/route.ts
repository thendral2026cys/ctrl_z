import { z } from "zod";
import { ApiError, handleApiError, readJson } from "@/lib/api";
import { prisma } from "@/lib/db";
import { assertSameOrigin } from "@/lib/security";
import { requireAdmin } from "@/lib/server";

const resetSchema = z.object({
  confirmation: z.literal("RESET VIPERWOLF"),
});

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const session = await requireAdmin(request.headers);
    resetSchema.parse(await readJson(request));

    const deleted = await prisma.$transaction(async (transaction) => {
      const [teamCount, participantCount] = await Promise.all([
        transaction.team.count(),
        transaction.user.count({ where: { role: { not: "ADMIN" } } }),
      ]);

      await transaction.ruleReview.deleteMany();
      await transaction.finalSubmission.deleteMany();
      const scoreAdjustments = await transaction.scoreAdjustment.deleteMany();
      const challengeSolves = await transaction.challengeSolve.deleteMany();
      const flagAttempts = await transaction.flagAttempt.deleteMany();
      await transaction.teamChallengeTimer.deleteMany();
      await transaction.flagRateLimit.deleteMany();
      await transaction.membership.deleteMany();
      const activityLogs = await transaction.activityLog.deleteMany();
      await transaction.team.deleteMany();
      await transaction.user.deleteMany({
        where: { role: { not: "ADMIN" } },
      });

      await transaction.activityLog.create({
        data: {
          actorId: session.user.id,
          actorRole: "ADMIN",
          action: "COMPETITION_FULL_RESET",
          details: {
            teamsRemoved: teamCount,
            participantAccountsRemoved: participantCount,
            scoreAdjustmentsRemoved: scoreAdjustments.count,
            challengeSolvesRemoved: challengeSolves.count,
            flagAttemptsRemoved: flagAttempts.count,
            priorActivityLogsRemoved: activityLogs.count,
          },
        },
      });

      return {
        teams: teamCount,
        participantAccounts: participantCount,
      };
    });

    return Response.json({ reset: true, deleted });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return handleApiError(
        new ApiError("Type RESET VIPERWOLF to confirm the full reset.", 400),
      );
    }
    return handleApiError(error);
  }
}
