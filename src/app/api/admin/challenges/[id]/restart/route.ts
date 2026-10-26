import { ApiError, handleApiError } from "@/lib/api";
import { prisma } from "@/lib/db";
import { assertSameOrigin } from "@/lib/security";
import { canAdminRestartChallenge } from "@/lib/scoring";
import { requireAdmin } from "@/lib/server";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOrigin(request);
    const session = await requireAdmin(request.headers);
    const { id } = await context.params;

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
            round: { select: { number: true, status: true } },
          },
        });
        if (!current) {
          throw new ApiError("Challenge not found.", 404);
        }
        if (!canAdminRestartChallenge(current.round.number, current.round.status)) {
          throw new ApiError(
            current.round.number === 1
              ? "Only Round 2 and Round 3 challenges can be restarted."
              : "Start or schedule this round before restarting its challenges.",
            409,
          );
        }

        const updated = await transaction.challenge.update({
          where: { id },
          data: { enabled: true, opensAt: null, closesAt: null },
          select: { id: true, title: true, enabled: true },
        });
        await transaction.activityLog.create({
          data: {
            actorId: session.user.id,
            actorRole: "ADMIN",
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
