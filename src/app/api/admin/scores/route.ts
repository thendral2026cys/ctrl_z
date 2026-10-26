import { z } from "zod";
import { ApiError, handleApiError, readJson } from "@/lib/api";
import { prisma } from "@/lib/db";
import { assertSameOrigin } from "@/lib/security";
import {
  allocateRoundOneScore,
  calculateTeamScore,
} from "@/lib/scoring";
import { requireAdmin } from "@/lib/server";

const scoreSchema = z.union([
  z
    .object({
      teamId: z.string().min(1),
      score: z.number().int().min(0).max(100000),
      reason: z.string().trim().min(3).max(500),
    })
    .strict(),
  z
    .object({
      teamId: z.string().min(1),
      delta: z
        .number()
        .int()
        .min(-100000)
        .max(100000)
        .refine((value) => value !== 0),
      reason: z.string().trim().min(3).max(500),
    })
    .strict(),
]);

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const session = await requireAdmin(request.headers);
    const input = scoreSchema.parse(await readJson(request));

    const result = await prisma.$transaction(async (transaction) => {
      const team = await transaction.team.findUnique({
        where: { id: input.teamId },
        select: { id: true, roundOneScore: true },
      });
      if (!team) {
        throw new ApiError("Team not found.", 404);
      }

      const [solves, adjustments] = await Promise.all([
        transaction.challengeSolve.aggregate({
          where: {
            teamId: team.id,
            challenge: { round: { number: { in: [2, 3] } } },
          },
          _sum: { pointsAwarded: true },
        }),
        transaction.scoreAdjustment.aggregate({
          where: { teamId: team.id, roundNumber: null },
          _sum: { delta: true },
        }),
      ]);
      const currentScore = calculateTeamScore(
        team.roundOneScore,
        solves._sum.pointsAwarded ?? 0,
        adjustments._sum.delta ?? 0,
      );

      if ("score" in input) {
        if (input.score === team.roundOneScore) {
          throw new ApiError("The team already has that Round 1 score.", 400);
        }

        const members = await transaction.membership.findMany({
          where: { teamId: team.id, removedAt: null },
          select: { userId: true },
        });
        if (members.length === 0) {
          throw new ApiError(
            "Add an active team member before entering a Round 1 score.",
            409,
          );
        }
        const allocations = allocateRoundOneScore(input.score, members);
        const adjustment = await transaction.scoreAdjustment.create({
          data: {
            teamId: team.id,
            actorId: session.user.id,
            roundNumber: 1,
            delta: input.score - team.roundOneScore,
            previousScore: team.roundOneScore,
            newScore: input.score,
            reason: input.reason,
          },
        });
        await transaction.team.update({
          where: { id: team.id },
          data: { roundOneScore: input.score },
        });
        await transaction.activityLog.create({
          data: {
            actorId: session.user.id,
            actorRole: "ADMIN",
            teamId: team.id,
            action: "ROUND_ONE_SCORE_SET",
            details: {
              administratorEmail: session.user.email,
              roundNumber: 1,
              previousScore: team.roundOneScore,
              newScore: input.score,
              previousTeamScore: currentScore,
              newTeamScore: currentScore - team.roundOneScore + input.score,
              reason: input.reason,
              allocations,
            },
          },
        });

        return { adjustment, roundOneScore: input.score };
      }

      const newScore = currentScore + input.delta;
      if (newScore < 0) {
        throw new ApiError("A team score cannot fall below zero.", 400);
      }

      const created = await transaction.scoreAdjustment.create({
        data: {
          teamId: team.id,
          actorId: session.user.id,
          delta: input.delta,
          previousScore: currentScore,
          newScore,
          reason: input.reason,
        },
      });
      await transaction.activityLog.create({
        data: {
          actorId: session.user.id,
          actorRole: "ADMIN",
          teamId: team.id,
          action: "TEAM_SCORE_ADJUSTED",
          details: {
            administratorEmail: session.user.email,
            previousScore: currentScore,
            newScore,
            delta: input.delta,
            reason: input.reason,
          },
        },
      });
      return created;
    }, { isolationLevel: "Serializable" });

    return Response.json(result, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
