import { Prisma } from "@prisma/client";
import { z } from "zod";
import { ApiError, handleApiError, readJson } from "@/lib/api";
import {
  getAvailableChallenge,
  getAvailableChallengeInTransaction,
} from "@/lib/competition";
import { prisma } from "@/lib/db";
import { assertSameOrigin, verifyFlag } from "@/lib/security";
import { enforceFlagAttemptLimit } from "@/lib/rate-limit";
import { requireActiveMembership, requireUser } from "@/lib/server";

const submissionSchema = z.object({
  flag: z.string().trim().min(1).max(500),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOrigin(request);
    const session = await requireUser(request.headers);
    const membership = await requireActiveMembership(session.user.id);
    const { id } = await context.params;
    const input = submissionSchema.parse(await readJson(request));
    const challenge = await getAvailableChallenge(id);

    const timer = await prisma.teamChallengeTimer.findUnique({
      where: {
        teamId_challengeId: {
          teamId: membership.teamId,
          challengeId: challenge.id,
        },
      },
    });

    if (!timer) {
      throw new ApiError("Open the challenge before submitting a flag.", 409);
    }

    const existingSolve = await prisma.challengeSolve.findUnique({
      where: {
        teamId_challengeId: {
          teamId: membership.teamId,
          challengeId: challenge.id,
        },
      },
    });

    if (existingSolve) {
      return Response.json({
        correct: true,
        alreadySolved: true,
        pointsAwarded: 0,
      });
    }

    await enforceFlagAttemptLimit(membership.teamId, challenge.id);

    try {
      const result = await prisma.$transaction(async (transaction) => {
        const currentChallenge = await getAvailableChallengeInTransaction(
          transaction,
          challenge.id,
        );
        const solved = await transaction.challengeSolve.findUnique({
          where: {
            teamId_challengeId: {
              teamId: membership.teamId,
              challengeId: currentChallenge.id,
            },
          },
        });
        if (solved) {
          return { correct: true, alreadySolved: true, pointsAwarded: 0 };
        }

        if (!verifyFlag(input.flag, currentChallenge.flagDigest)) {
          await transaction.flagAttempt.create({
            data: {
              teamId: membership.teamId,
              challengeId: currentChallenge.id,
              userId: session.user.id,
              isCorrect: false,
            },
          });
          await transaction.activityLog.create({
            data: {
              actorId: session.user.id,
              actorRole: membership.role,
              teamId: membership.teamId,
              roundId: currentChallenge.roundId,
              challengeId: currentChallenge.id,
              action: "FLAG_REJECTED",
              details: {},
            },
          });
          return { correct: false, alreadySolved: false, pointsAwarded: 0 };
        }

        await transaction.challengeSolve.create({
          data: {
            teamId: membership.teamId,
            challengeId: currentChallenge.id,
            solvingUserId: session.user.id,
            pointsAwarded: currentChallenge.pointValue,
          },
        });
        await transaction.flagAttempt.create({
          data: {
            teamId: membership.teamId,
            challengeId: currentChallenge.id,
            userId: session.user.id,
            isCorrect: true,
          },
        });
        await transaction.activityLog.create({
          data: {
            actorId: session.user.id,
            actorRole: membership.role,
            teamId: membership.teamId,
            roundId: currentChallenge.roundId,
            challengeId: currentChallenge.id,
            action: "CHALLENGE_SOLVED",
            details: { pointsAwarded: currentChallenge.pointValue },
          },
        });
        return {
          correct: true,
          alreadySolved: false,
          pointsAwarded: currentChallenge.pointValue,
          finalMissionComplete: currentChallenge.isFinalMission,
        };
      }, { isolationLevel: "Serializable" });

      if (!result.correct) {
        return Response.json(
          { correct: false, error: "That flag is not correct." },
          { status: 400 },
        );
      }
      return Response.json(result);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        return Response.json({
          correct: true,
          alreadySolved: true,
          pointsAwarded: 0,
        });
      }
      throw error;
    }
  } catch (error) {
    return handleApiError(error);
  }
}
