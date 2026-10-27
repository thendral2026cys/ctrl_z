import { ApiError, handleApiError } from "@/lib/api";
import {
  getAvailableChallengeInTransaction,
  getMainAdminPracticeChallengeInTransaction,
} from "@/lib/competition";
import { prisma } from "@/lib/db";
import { isAutomaticScoringRound } from "@/lib/scoring";
import { assertSameOrigin } from "@/lib/security";
import {
  isMainAdminEmail,
  requireActiveMembership,
  requireUser,
} from "@/lib/server";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOrigin(request);
    const session = await requireUser(request.headers);
    const isMainAdmin =
      session.user.role === "MAIN_ADMIN" &&
      session.user.emailVerified === true &&
      isMainAdminEmail(session.user.email);
    const membership = isMainAdmin
      ? null
      : await requireActiveMembership(session.user.id);
    const { id } = await context.params;
    const result = await prisma.$transaction(
      async (transaction) => {
        const challenge = isMainAdmin
          ? await getMainAdminPracticeChallengeInTransaction(transaction, id)
          : await getAvailableChallengeInTransaction(transaction, id);
        if (!isAutomaticScoringRound(challenge.round.number)) {
          throw new ApiError(
            "Round 1 challenges are available on the external contest only.",
            403,
          );
        }
        const files = await transaction.evidenceFile.findMany({
          where: { challengeId: challenge.id },
          select: {
            id: true,
            fileName: true,
            mediaType: true,
            byteLength: true,
          },
          orderBy: { createdAt: "asc" },
        });
        if (isMainAdmin) {
          return { challenge, timer: null, files };
        }
        if (!membership) {
          throw new ApiError("Join an active team to open this challenge.", 403);
        }
        const timer = await transaction.teamChallengeTimer.upsert({
          where: {
            teamId_challengeId: {
              teamId: membership.teamId,
              challengeId: challenge.id,
            },
          },
          update: {},
          create: {
            teamId: membership.teamId,
            challengeId: challenge.id,
          },
        });
        return { challenge, timer, files };
      },
      { isolationLevel: "Serializable" },
    );

    const { challenge, timer, files } = result;
    const firstOpenedAt = timer?.firstOpenedAt ?? new Date();

    return Response.json(
      {
        challenge: {
          id: challenge.id,
          title: challenge.title,
          description: challenge.description,
          evidenceText: challenge.evidenceText,
          hints: challenge.hints,
          pointValue: challenge.pointValue,
          isFinalMission: challenge.isFinalMission,
          files,
        },
        firstOpenedAt,
        elapsedSeconds: Math.max(
          0,
          Math.floor((Date.now() - firstOpenedAt.getTime()) / 1000),
        ),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return handleApiError(error);
  }
}
