import { z } from "zod";
import { ApiError, handleApiError, readJson } from "@/lib/api";
import { prisma } from "@/lib/db";
import { assertSameOrigin } from "@/lib/security";
import { requireMainAdmin } from "@/lib/server";

const disqualificationSchema = z.object({
  disqualified: z.boolean(),
  reason: z.string().trim().min(3).max(500),
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOrigin(request);
    const session = await requireMainAdmin(request.headers);
    const { id } = await context.params;
    const input = disqualificationSchema.parse(await readJson(request));

    const team = await prisma.$transaction(async (transaction) => {
      const current = await transaction.team.findUnique({
        where: { id },
        select: {
          id: true,
          name: true,
          disqualifiedAt: true,
          disqualificationReason: true,
        },
      });
      if (!current) {
        throw new ApiError("Team not found.", 404);
      }
      if (Boolean(current.disqualifiedAt) === input.disqualified) {
        throw new ApiError(
          input.disqualified
            ? "This team is already disqualified."
            : "This team is already active.",
          409,
        );
      }

      const updated = await transaction.team.update({
        where: { id },
        data: input.disqualified
          ? {
              disqualifiedAt: new Date(),
              disqualificationReason: input.reason,
            }
          : {
              disqualifiedAt: null,
              disqualificationReason: null,
            },
        select: { id: true, name: true, disqualifiedAt: true },
      });
      await transaction.activityLog.create({
        data: {
          actorId: session.user.id,
          actorRole: "MAIN_ADMIN",
          teamId: current.id,
          action: input.disqualified
            ? "TEAM_DISQUALIFIED"
            : "TEAM_REINSTATED",
          details: {
            administratorEmail: session.user.email,
            reason: input.reason,
            previousReason: current.disqualificationReason,
          },
        },
      });
      return updated;
    });

    return Response.json({ team });
  } catch (error) {
    return handleApiError(error);
  }
}
