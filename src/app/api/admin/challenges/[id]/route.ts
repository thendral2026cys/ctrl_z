import { z } from "zod";
import { ApiError, handleApiError, readJson } from "@/lib/api";
import { prisma } from "@/lib/db";
import { assertSameOrigin, digestFlag } from "@/lib/security";
import { requireAdmin } from "@/lib/server";

const challengeChangeSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(10000).optional(),
  evidenceText: z.string().trim().max(20000).optional(),
  flag: z.string().trim().min(1).max(500).optional(),
  pointValue: z.number().int().min(1).max(100000).optional(),
  hints: z.array(z.string().trim().min(1).max(1000)).max(20).optional(),
  enabled: z.boolean().optional(),
  isFinalMission: z.boolean().optional(),
  opensAt: z.union([z.string().datetime(), z.literal("")]).optional(),
  closesAt: z.union([z.string().datetime(), z.literal("")]).optional(),
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOrigin(request);
    const session = await requireAdmin(request.headers);
    const { id } = await context.params;
    const input = challengeChangeSchema.parse(await readJson(request));
    const challenge = await prisma.$transaction(async (transaction) => {
      const current = await transaction.challenge.findUnique({
        where: { id },
        select: {
          roundId: true,
          pointValue: true,
          isFinalMission: true,
          opensAt: true,
          closesAt: true,
          round: { select: { number: true } },
        },
      });

      if (!current) {
        throw new ApiError("Challenge not found.", 404);
      }

      if (input.isFinalMission && current.round.number !== 3) {
        throw new ApiError(
          "Only a Round 3 challenge can be the final mission.",
          400,
        );
      }

      if (input.isFinalMission) {
        const duplicate = await transaction.challenge.findFirst({
          where: {
            roundId: current.roundId,
            isFinalMission: true,
            id: { not: id },
          },
        });
        if (duplicate) {
          throw new ApiError("Round 3 already has a final mission.", 409);
        }
      }

      const pointValueChanged =
        input.pointValue !== undefined &&
        input.pointValue !== current.pointValue;
      const finalMissionChanged =
        input.isFinalMission !== undefined &&
        input.isFinalMission !== current.isFinalMission;
      if (input.flag || pointValueChanged || finalMissionChanged) {
        const [attemptCount, solveCount] = await Promise.all([
          transaction.flagAttempt.count({ where: { challengeId: id } }),
          transaction.challengeSolve.count({ where: { challengeId: id } }),
        ]);
        if (input.flag && attemptCount > 0) {
          throw new ApiError(
            "A flag cannot be changed after any team has attempted it.",
            409,
          );
        }
        if ((pointValueChanged || finalMissionChanged) && solveCount > 0) {
          throw new ApiError(
            "Point value and final-mission status are locked after the first solve.",
            409,
          );
        }
      }

      const { flag, ...fields } = input;
      const { opensAt, closesAt, ...editableFields } = fields;
      const nextOpensAt =
        opensAt === undefined ? undefined : opensAt ? new Date(opensAt) : null;
      const nextClosesAt =
        closesAt === undefined
          ? undefined
          : closesAt
            ? new Date(closesAt)
            : null;
      const effectiveOpensAt =
        nextOpensAt === undefined ? current.opensAt : nextOpensAt;
      const effectiveClosesAt =
        nextClosesAt === undefined ? current.closesAt : nextClosesAt;
      if (
        effectiveOpensAt &&
        effectiveClosesAt &&
        effectiveClosesAt <= effectiveOpensAt
      ) {
        throw new ApiError(
          "Challenge close time must follow its open time.",
          400,
        );
      }

      const updated = await transaction.challenge.update({
        where: { id },
        data: {
          ...editableFields,
          ...(nextOpensAt !== undefined ? { opensAt: nextOpensAt } : {}),
          ...(nextClosesAt !== undefined ? { closesAt: nextClosesAt } : {}),
          ...(flag ? { flagDigest: digestFlag(flag) } : {}),
          ...(input.isFinalMission !== undefined
            ? {
                finalMissionKey: input.isFinalMission
                  ? "round-3-final"
                  : null,
              }
            : {}),
        },
        select: { id: true, title: true, enabled: true, pointValue: true },
      });
      await transaction.activityLog.create({
        data: {
          actorId: session.user.id,
          actorRole: "ADMIN",
          roundId: current.roundId,
          challengeId: id,
          action: "CHALLENGE_UPDATED",
          details: { title: updated.title, enabled: updated.enabled },
        },
      });
      return updated;
    }, { isolationLevel: "Serializable" });

    return Response.json({ challenge });
  } catch (error) {
    return handleApiError(error);
  }
}
