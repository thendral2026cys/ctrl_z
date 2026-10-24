import { z } from "zod";
import { ApiError, handleApiError, readJson } from "@/lib/api";
import { prisma } from "@/lib/db";
import { assertSameOrigin, isSafeHttpsUrl } from "@/lib/security";
import { requireAdmin } from "@/lib/server";

const roundChangeSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("start") }),
  z.object({ action: z.literal("close") }),
  z.object({
    action: z.literal("schedule"),
    opensAt: z.string().datetime(),
    closesAt: z.union([z.string().datetime(), z.literal("")]),
  }),
  z.object({
    action: z.literal("content"),
    name: z.string().trim().min(1).max(120),
    description: z.string().trim().max(10000),
    revealVideoUrl: z.union([z.string().trim().max(2048), z.literal("")]),
    revealAvailableAt: z.union([z.string().datetime(), z.literal("")]),
  }),
]);

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOrigin(request);
    const session = await requireAdmin(request.headers);
    const { id } = await context.params;
    const input = roundChangeSchema.parse(await readJson(request));

    if (
      input.action === "content" &&
      input.revealVideoUrl &&
      !isSafeHttpsUrl(input.revealVideoUrl)
    ) {
      throw new ApiError("Reveal video URLs must use HTTPS.", 400);
    }

    const updated = await prisma.$transaction(
      async (transaction) => {
        const round = await transaction.round.findUnique({ where: { id } });
        if (!round) {
          throw new ApiError("Round not found.", 404);
        }

        if (input.action === "start" || input.action === "schedule") {
          if (round.status === "CLOSED") {
            throw new ApiError("A closed round cannot be reopened.", 409);
          }
          if (round.status === "OPEN") {
            throw new ApiError(
              "An open round cannot be rescheduled or started again.",
              409,
            );
          }
          if (round.number === 1) {
            const config = await transaction.eventConfig.findUnique({
              where: { id: "main" },
              select: { aiPolicy: true },
            });
            if (!config?.aiPolicy.trim()) {
              throw new ApiError(
                "Publish the official AI-use policy before starting Round 1.",
                409,
              );
            }
          }
          if (round.number > 1) {
            const previous = await transaction.round.findUnique({
              where: { number: round.number - 1 },
            });
            const previousClosed = Boolean(
              previous &&
                (previous.status === "CLOSED" ||
                  (previous.closesAt && previous.closesAt <= new Date())),
            );
            if (!previousClosed) {
              throw new ApiError(
                "The previous round must be closed before this round can start.",
                409,
              );
            }
          }
        }

        let nextRound;
        if (input.action === "start") {
          nextRound = await transaction.round.update({
            where: { id },
            data: {
              enabled: true,
              status: "OPEN",
              opensAt: new Date(),
              closesAt: null,
            },
          });
        } else if (input.action === "close") {
          if (round.status === "CLOSED") {
            throw new ApiError("This round is already closed.", 409);
          }
          nextRound = await transaction.round.update({
            where: { id },
            data: {
              enabled: false,
              status: "CLOSED",
              closesAt: new Date(),
            },
          });
        } else if (input.action === "schedule") {
          const opensAt = new Date(input.opensAt);
          const closesAt = input.closesAt
            ? new Date(input.closesAt)
            : null;
          if (
            opensAt <= new Date() ||
            (closesAt && closesAt <= opensAt)
          ) {
            throw new ApiError(
              "A scheduled start must be in the future and end after it.",
              400,
            );
          }
          nextRound = await transaction.round.update({
            where: { id },
            data: {
              enabled: true,
              status: "SCHEDULED",
              opensAt,
              closesAt,
            },
          });
        } else {
          nextRound = await transaction.round.update({
            where: { id },
            data: {
              name: input.name,
              description: input.description,
              revealVideoUrl: input.revealVideoUrl || null,
              revealAvailableAt: input.revealAvailableAt
                ? new Date(input.revealAvailableAt)
                : null,
            },
          });
        }

        await transaction.activityLog.create({
          data: {
            actorId: session.user.id,
            actorRole: "ADMIN",
            roundId: id,
            action: `ROUND_${input.action.toUpperCase()}`,
            details: {
              status: nextRound.status,
              opensAt: nextRound.opensAt?.toISOString() ?? null,
              closesAt: nextRound.closesAt?.toISOString() ?? null,
            },
          },
        });
        return nextRound;
      },
      { isolationLevel: "Serializable" },
    );

    return Response.json({ round: updated });
  } catch (error) {
    return handleApiError(error);
  }
}
