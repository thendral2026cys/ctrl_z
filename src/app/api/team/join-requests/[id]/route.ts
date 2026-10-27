import { Prisma } from "@prisma/client";
import { z } from "zod";
import { ApiError, handleApiError, readJson } from "@/lib/api";
import { prisma } from "@/lib/db";
import { assertSameOrigin } from "@/lib/security";
import { requireActiveMembership, requireUser } from "@/lib/server";

const decisionSchema = z.object({
  decision: z.enum(["accept", "deny"]),
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOrigin(request);
    const session = await requireUser(request.headers);
    const membership = await requireActiveMembership(session.user.id);
    if (membership.role !== "LEADER") {
      throw new ApiError("Only the team leader can review membership requests.", 403);
    }

    const { id } = await context.params;
    const { decision } = decisionSchema.parse(await readJson(request));
    const result = await prisma.$transaction(async (transaction) => {
      const joinRequest = await transaction.teamJoinRequest.findFirst({
        where: {
          id,
          teamId: membership.teamId,
          status: "PENDING",
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
              disabledAt: true,
            },
          },
          team: {
            select: {
              name: true,
              _count: {
                select: { memberships: { where: { removedAt: null } } },
              },
            },
          },
        },
      });
      if (!joinRequest) {
        throw new ApiError("Pending request not found for your team.", 404);
      }

      if (decision === "accept") {
        if (
          joinRequest.user.disabledAt ||
          joinRequest.user.role !== "PARTICIPANT"
        ) {
          throw new ApiError("This account is not eligible to join a team.", 409);
        }
        if (joinRequest.team._count.memberships >= 4) {
          throw new ApiError("Your team already has four active members.", 409);
        }
        const existingMembership = await transaction.membership.findUnique({
          where: { userId: joinRequest.userId },
          select: { id: true },
        });
        if (existingMembership) {
          throw new ApiError(
            "This account already has team membership history. Ask an organizer for help.",
            409,
          );
        }

        await transaction.membership.create({
          data: {
            userId: joinRequest.userId,
            teamId: membership.teamId,
            role: "MEMBER",
          },
        });
      }

      const status = decision === "accept" ? "ACCEPTED" : "DENIED";
      const updatedRequest = await transaction.teamJoinRequest.update({
        where: { id },
        data: {
          status,
          decidedAt: new Date(),
          decidedById: session.user.id,
        },
        select: { id: true, status: true, decidedAt: true },
      });
      await transaction.activityLog.create({
        data: {
          actorId: session.user.id,
          actorRole: membership.role,
          teamId: membership.teamId,
          action:
            decision === "accept"
              ? "TEAM_JOIN_REQUEST_ACCEPTED"
              : "TEAM_JOIN_REQUEST_DENIED",
          details: {
            requestId: id,
            participantId: joinRequest.user.id,
            participantName: joinRequest.user.name,
            participantEmail: joinRequest.user.email,
          },
        },
      });

      return updatedRequest;
    }, { isolationLevel: "Serializable" });

    return Response.json({ request: result });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.code === "P2002" || error.code === "P2034")
    ) {
      return handleApiError(
        new ApiError(
          "The request or team roster changed while it was being reviewed. Refresh and try again.",
          409,
        ),
      );
    }
    return handleApiError(error);
  }
}
