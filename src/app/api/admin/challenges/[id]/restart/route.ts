import { ApiError, handleApiError } from "@/lib/api";
import { prisma } from "@/lib/db";
import { assertSameOrigin } from "@/lib/security";
import { canAdminRestartChallenge } from "@/lib/scoring";
import { requireAdmin, requireMainAdmin } from "@/lib/server";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOrigin(request);
    const session = await requireAdmin(request.headers);
    const { id } = await context.params;
    const initialChallenge = await prisma.challenge.findUnique({
      where: { id },
      select: { round: { select: { status: true } } },
    });
    if (!initialChallenge) {
      throw new ApiError("Challenge not found.", 404);
    }
    const canReopenClosedRound = initialChallenge.round.status === "CLOSED";
    if (canReopenClosedRound) {
      await requireMainAdmin(request.headers);
    }

    const challenge = await prisma.$transaction(
      async (transaction) => {
        const current = await transaction.challenge.findUnique({
          where: { id },
          select: {
            id: true,
            roundId: true,
            enabled: true,
            opensAt: true,
            closesAt: true,
            round: {
              select: {
                id: true,
                number: true,
                status: true,
                enabled: true,
                opensAt: true,
                closesAt: true,
              },
            },
          },
        });
        if (!current) {
          throw new ApiError("Challenge not found.", 404);
        }
        if (!canAdminRestartChallenge(current.round.number, current.round.status)) {
          throw new ApiError(
            current.round.number === 1
              ? "Round 1 is managed through its external contest and cannot be restarted here."
              : "Start or schedule this round before restarting its challenges.",
            409,
          );
        }

        if (current.round.status === "CLOSED") {
          if (!canReopenClosedRound) {
            throw new ApiError(
              "Only the main administrator can reopen a closed round.",
              403,
            );
          }
          const subsequentActive = await transaction.round.findFirst({
            where: {
              number: { gt: current.round.number },
              status: { in: ["OPEN", "SCHEDULED"] },
            },
            select: { number: true },
          });
          if (subsequentActive) {
            throw new ApiError(
              `Round ${subsequentActive.number} is open or scheduled. Close or reschedule it before reopening Round ${current.round.number}.`,
              409,
            );
          }
          const previousRound =
            current.round.number > 1
              ? await transaction.round.findUnique({
                  where: { number: current.round.number - 1 },
                  select: { status: true, closesAt: true },
                })
              : null;
          if (
            previousRound &&
            previousRound.status !== "CLOSED" &&
            !(previousRound.closesAt && previousRound.closesAt <= new Date())
          ) {
            throw new ApiError(
              "The previous round must be closed before restarting this round.",
              409,
            );
          }
          const reopenedAt = new Date();
          await transaction.round.update({
            where: { id: current.round.id },
            data: {
              enabled: true,
              status: "OPEN",
              opensAt: reopenedAt,
              closesAt: null,
            },
          });
          await transaction.activityLog.create({
            data: {
              actorId: session.user.id,
              actorRole: session.user.role,
              roundId: current.round.id,
              action: "ROUND_REOPENED_FOR_CHALLENGE_RESTART",
              details: {
                administratorEmail: session.user.email,
                challengeId: current.id,
                previousStatus: current.round.status,
                previousEnabled: current.round.enabled,
                previousOpensAt: current.round.opensAt?.toISOString() ?? null,
                previousClosesAt: current.round.closesAt?.toISOString() ?? null,
                newStatus: "OPEN",
                newOpensAt: reopenedAt.toISOString(),
                newClosesAt: null,
              },
            },
          });
        }

        const updated = await transaction.challenge.update({
          where: { id },
          data: { enabled: true, opensAt: null, closesAt: null },
          select: { id: true, title: true, enabled: true },
        });
        await transaction.activityLog.create({
          data: {
            actorId: session.user.id,
            actorRole: session.user.role,
            roundId: current.roundId,
            challengeId: current.id,
            action: "CHALLENGE_RESTARTED",
            details: {
              administratorEmail: session.user.email,
              previousEnabled: current.enabled,
              previousOpensAt: current.opensAt?.toISOString() ?? null,
              previousClosesAt: current.closesAt?.toISOString() ?? null,
              newOpensAt: null,
              newClosesAt: null,
            },
          },
        });
        return updated;
      },
      { isolationLevel: "Serializable" },
    );

    return Response.json({ challenge });
  } catch (error) {
    return handleApiError(error);
  }
}
