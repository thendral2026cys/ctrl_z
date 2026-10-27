import { z } from "zod";
import { ApiError, handleApiError, readJson } from "@/lib/api";
import { prisma } from "@/lib/db";
import { assertSameOrigin } from "@/lib/security";
import {
  requireActiveMembership,
  requireUser,
} from "@/lib/server";

const writeupSchema = z.object({
  content: z.string().trim().min(1).max(10000),
});

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireUser(request.headers);
    const membership = await requireActiveMembership(session.user.id);
    const { id } = await context.params;
    const challenge = await prisma.challenge.findUnique({
      where: { id },
      select: {
        id: true,
        round: { select: { number: true, archivedAt: true } },
      },
    });
    if (!challenge || challenge.round.archivedAt) {
      throw new ApiError("Challenge not found.", 404);
    }
    if (challenge.round.number === 1) {
      throw new ApiError("Round 1 writeups are not available here.", 403);
    }
    const solve = await prisma.challengeSolve.findUnique({
      where: {
        teamId_challengeId: {
          teamId: membership.teamId,
          challengeId: challenge.id,
        },
      },
      select: {
        solvedAt: true,
        solvingUser: { select: { name: true } },
      },
    });
    const [timer, writeup] = await Promise.all([
      solve
        ? prisma.teamChallengeTimer.findUnique({
            where: {
              teamId_challengeId: {
                teamId: membership.teamId,
                challengeId: challenge.id,
              },
            },
            select: { firstOpenedAt: true },
          })
        : null,
      solve
        ? prisma.challengeWriteup.findUnique({
            where: {
              challengeId_userId: {
                challengeId: challenge.id,
                userId: session.user.id,
              },
            },
            select: { content: true, updatedAt: true },
          })
        : null,
    ]);

    const solveElapsedSeconds =
      solve && timer
        ? Math.max(
            0,
            Math.floor((solve.solvedAt.getTime() - timer.firstOpenedAt.getTime()) / 1000),
          )
        : null;

    return Response.json(
      {
        solved: Boolean(solve),
        solvedByName: solve?.solvingUser?.name ?? null,
        solveElapsedSeconds,
        writeup,
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOrigin(request);
    const session = await requireUser(request.headers);
    const membership = await requireActiveMembership(session.user.id);
    const { id } = await context.params;
    const input = writeupSchema.parse(await readJson(request));
    const challenge = await prisma.challenge.findUnique({
      where: { id },
      select: {
        id: true,
        roundId: true,
        round: { select: { number: true, archivedAt: true } },
      },
    });
    if (!challenge || challenge.round.archivedAt) {
      throw new ApiError("Challenge not found.", 404);
    }
    if (challenge.round.number === 1) {
      throw new ApiError("Round 1 writeups are not available here.", 403);
    }

    const writeup = await prisma.$transaction(async (transaction) => {
      const solve = await transaction.challengeSolve.findUnique({
        where: {
          teamId_challengeId: {
            teamId: membership.teamId,
            challengeId: challenge.id,
          },
        },
        select: { id: true },
      });
      if (!solve) {
        throw new ApiError(
          "Solve the challenge with your team before submitting a writeup.",
          409,
        );
      }

      const saved = await transaction.challengeWriteup.upsert({
        where: {
          challengeId_userId: {
            challengeId: challenge.id,
            userId: session.user.id,
          },
        },
        create: {
          teamId: membership.teamId,
          challengeId: challenge.id,
          userId: session.user.id,
          content: input.content,
        },
        update: {
          teamId: membership.teamId,
          content: input.content,
        },
        select: { content: true, updatedAt: true },
      });
      await transaction.activityLog.create({
        data: {
          actorId: session.user.id,
          actorRole: membership.role,
          teamId: membership.teamId,
          roundId: challenge.roundId,
          challengeId: challenge.id,
          action: "CHALLENGE_WRITEUP_SUBMITTED",
          details: { updatedAt: saved.updatedAt.toISOString() },
        },
      });
      return saved;
    });

    return Response.json(
      { saved: true, writeup },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return handleApiError(error);
  }
}
