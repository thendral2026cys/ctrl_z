import { z } from "zod";
import { ApiError, handleApiError, readJson } from "@/lib/api";
import { prisma } from "@/lib/db";
import { assertSameOrigin } from "@/lib/security";
import { requireAdmin } from "@/lib/server";

const scoreSchema = z.object({
  teamId: z.string().min(1),
  delta: z.number().int().min(-100000).max(100000).refine((value) => value !== 0),
  reason: z.string().trim().min(3).max(500),
});

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const session = await requireAdmin(request.headers);
    const input = scoreSchema.parse(await readJson(request));

    const adjustment = await prisma.$transaction(async (transaction) => {
      const team = await transaction.team.findUnique({
        where: { id: input.teamId },
        select: { id: true },
      });
      if (!team) {
        throw new ApiError("Team not found.", 404);
      }

      const [solves, adjustments] = await Promise.all([
        transaction.challengeSolve.aggregate({
          where: { teamId: team.id },
          _sum: { pointsAwarded: true },
        }),
        transaction.scoreAdjustment.aggregate({
          where: { teamId: team.id },
          _sum: { delta: true },
        }),
      ]);
      const currentScore = Math.max(
        0,
        (solves._sum.pointsAwarded ?? 0) + (adjustments._sum.delta ?? 0),
      );

      if (currentScore + input.delta < 0) {
        throw new ApiError("A team score cannot fall below zero.", 400);
      }

      const created = await transaction.scoreAdjustment.create({
        data: {
          teamId: team.id,
          actorId: session.user.id,
          delta: input.delta,
          reason: input.reason,
        },
      });
      await transaction.activityLog.create({
        data: {
          actorId: session.user.id,
          actorRole: "ADMIN",
          teamId: team.id,
          action: "TEAM_SCORE_ADJUSTED",
          details: { delta: input.delta, reason: input.reason },
        },
      });
      return created;
    }, { isolationLevel: "Serializable" });

    return Response.json({ adjustment }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
