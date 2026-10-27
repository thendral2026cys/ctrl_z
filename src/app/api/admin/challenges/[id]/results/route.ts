import { ApiError, handleApiError } from "@/lib/api";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/server";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdmin(request.headers);
    const { id } = await context.params;
    const challenge = await prisma.challenge.findUnique({
      where: { id },
      select: { id: true, title: true },
    });
    if (!challenge) {
      throw new ApiError("Challenge not found.", 404);
    }

    const [solves, incorrectAttempts, writeups] = await Promise.all([
      prisma.challengeSolve.findMany({
        where: { challengeId: id },
        orderBy: { solvedAt: "asc" },
        select: {
          teamId: true,
          pointsAwarded: true,
          solvedAt: true,
          solvingUser: { select: { name: true, email: true } },
          team: {
            select: {
              name: true,
              timers: {
                where: { challengeId: id },
                select: { firstOpenedAt: true },
                take: 1,
              },
            },
          },
        },
      }),
      prisma.flagAttempt.findMany({
        where: { challengeId: id, isCorrect: false },
        orderBy: { attemptedAt: "asc" },
        select: {
          teamId: true,
          attemptedAt: true,
          user: { select: { name: true, email: true } },
          team: { select: { name: true } },
        },
      }),
      prisma.challengeWriteup.findMany({
        where: { challengeId: id },
        orderBy: { updatedAt: "desc" },
        select: {
          content: true,
          createdAt: true,
          updatedAt: true,
          team: { select: { name: true } },
          user: { select: { name: true, email: true } },
        },
      }),
    ]);

    const incorrectCounts = new Map<string, number>();
    for (const attempt of incorrectAttempts) {
      incorrectCounts.set(
        attempt.teamId,
        (incorrectCounts.get(attempt.teamId) ?? 0) + 1,
      );
    }

    return Response.json(
      {
        challenge,
        totalSolved: solves.length,
        totalIncorrectAttempts: incorrectAttempts.length,
        solves: solves.map((solve) => {
          const openedAt = solve.team.timers[0]?.firstOpenedAt ?? null;
          return {
            teamName: solve.team.name,
            solverName: solve.solvingUser.name,
            solverEmail: solve.solvingUser.email,
            pointsAwarded: solve.pointsAwarded,
            solvedAt: solve.solvedAt,
            openedAt,
            elapsedSeconds: openedAt
              ? Math.max(
                  0,
                  Math.floor(
                    (solve.solvedAt.getTime() - openedAt.getTime()) / 1000,
                  ),
                )
              : null,
            incorrectAttempts: incorrectCounts.get(solve.teamId) ?? 0,
          };
        }),
        incorrectAttempts: incorrectAttempts.map((attempt) => ({
          teamName: attempt.team.name,
          participantName: attempt.user.name,
          participantEmail: attempt.user.email,
          attemptedAt: attempt.attemptedAt,
        })),
        writeups: writeups.map((writeup) => ({
          teamName: writeup.team.name,
          participantName: writeup.user.name,
          participantEmail: writeup.user.email,
          content: writeup.content,
          createdAt: writeup.createdAt,
          updatedAt: writeup.updatedAt,
        })),
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return handleApiError(error);
  }
}
