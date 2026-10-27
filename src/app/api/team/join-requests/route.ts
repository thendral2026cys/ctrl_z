import { Prisma } from "@prisma/client";
import { z } from "zod";
import { ApiError, handleApiError, readJson } from "@/lib/api";
import { prisma } from "@/lib/db";
import { assertSameOrigin } from "@/lib/security";
import { requireUser } from "@/lib/server";

const requestSchema = z.object({
  teamId: z.string().min(1).max(100),
});

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const session = await requireUser(request.headers);
    if (session.user.role === "ADMIN" || session.user.role === "MAIN_ADMIN") {
      throw new ApiError("Organizer accounts cannot request team membership.", 403);
    }
    if (!session.user.emailVerified) {
      throw new ApiError("Verify your email before requesting team membership.", 403);
    }

    const { teamId } = requestSchema.parse(await readJson(request));
    const result = await prisma.$transaction(async (transaction) => {
      const membership = await transaction.membership.findUnique({
        where: { userId: session.user.id },
        select: { id: true },
      });
      if (membership) {
        throw new ApiError("This account already has team membership history.", 409);
      }

      const team = await transaction.team.findUnique({
        where: { id: teamId },
        select: {
          id: true,
          name: true,
          disqualifiedAt: true,
          _count: {
            select: { memberships: { where: { removedAt: null } } },
          },
        },
      });
      if (!team || team.disqualifiedAt) {
        throw new ApiError("That team is not available to join.", 404);
      }
      if (team._count.memberships >= 4) {
        throw new ApiError("That team is full.", 409);
      }

      const pendingRequest = await transaction.teamJoinRequest.findFirst({
        where: { userId: session.user.id, status: "PENDING" },
        select: { id: true, team: { select: { name: true } } },
      });
      if (pendingRequest) {
        throw new ApiError(
          `A team request is already pending for ${pendingRequest.team.name}.`,
          409,
        );
      }

      const joinRequest = await transaction.teamJoinRequest.create({
        data: { userId: session.user.id, teamId },
        select: { id: true, status: true, createdAt: true },
      });
      await transaction.activityLog.create({
        data: {
          actorId: session.user.id,
          actorRole: "PARTICIPANT",
          teamId,
          action: "TEAM_JOIN_REQUESTED",
          details: {
            participantName: session.user.name,
            teamName: team.name,
            requestId: joinRequest.id,
          },
        },
      });

      return { ...joinRequest, teamName: team.name };
    }, { isolationLevel: "Serializable" });

    return Response.json({ request: result }, { status: 201 });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.code === "P2002" || error.code === "P2034")
    ) {
      return handleApiError(
        new ApiError(
          error.code === "P2002"
            ? "A team membership request is already pending."
            : "Team availability changed while you requested to join. Refresh and try again.",
          409,
        ),
      );
    }
    return handleApiError(error);
  }
}
