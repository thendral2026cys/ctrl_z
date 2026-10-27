import { z } from "zod";
import { ApiError, handleApiError, readJson } from "@/lib/api";
import { prisma } from "@/lib/db";
import { assertSameOrigin } from "@/lib/security";
import { requireMainAdmin } from "@/lib/server";

const resetSchema = z.object({
  confirmation: z.string().transform((val) => val.trim().toUpperCase()),
}).refine(
  (data) => data.confirmation === "RESET" || data.confirmation === "RESET CTRL_Z",
  { message: "Type RESET to confirm." },
);

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const session = await requireMainAdmin(request.headers);
    resetSchema.parse(await readJson(request));

    const deleted = await prisma.$transaction(async (transaction) => {
      const nonAdminUsers = await transaction.user.findMany({
        where: { role: { notIn: ["ADMIN", "MAIN_ADMIN"] } },
        select: { id: true },
      });
      const nonAdminUserIds = nonAdminUsers.map((u) => u.id);

      const [teamCount, participantCount] = await Promise.all([
        transaction.team.count(),
        nonAdminUsers.length,
      ]);

      await transaction.$executeRawUnsafe(
        "SET LOCAL viperwolf.allow_admin_delete = 'true'",
      );
      await transaction.ruleReview.deleteMany();
      await transaction.finalSubmission.deleteMany();
      const teamJoinRequests = await transaction.teamJoinRequest.deleteMany();
      const scoreAdjustments = await transaction.scoreAdjustment.deleteMany();
      const challengeSolves = await transaction.challengeSolve.deleteMany();
      await transaction.challengeWriteup.deleteMany();
      const flagAttempts = await transaction.flagAttempt.deleteMany();
      await transaction.teamChallengeTimer.deleteMany();
      await transaction.flagRateLimit.deleteMany();
      await transaction.membership.deleteMany();
      const activityLogs = await transaction.activityLog.deleteMany();
      await transaction.team.deleteMany();

      if (nonAdminUserIds.length > 0) {
        await transaction.session.deleteMany({
          where: { userId: { in: nonAdminUserIds } },
        });
        await transaction.account.deleteMany({
          where: { userId: { in: nonAdminUserIds } },
        });
        await transaction.user.deleteMany({
          where: { id: { in: nonAdminUserIds } },
        });
      }

      // Reset round statuses back to fresh scheduled state
      await transaction.round.updateMany({
        where: { number: 1 },
        data: { status: "SCHEDULED" },
      });
      await transaction.round.updateMany({
        where: { number: { gte: 2 } },
        data: { status: "LOCKED" },
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
            teamJoinRequestsRemoved: teamJoinRequests.count,
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
        new ApiError("Type RESET to confirm the full reset.", 400),
      );
    }
    return handleApiError(error);
  }
}
