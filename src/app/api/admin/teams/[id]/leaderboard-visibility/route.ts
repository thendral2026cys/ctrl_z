import { z } from "zod";
import { ApiError, handleApiError, readJson } from "@/lib/api";
import { prisma } from "@/lib/db";
import { assertSameOrigin } from "@/lib/security";
import { requireAdmin } from "@/lib/server";

const visibilitySchema = z.object({
  hidden: z.boolean(),
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOrigin(request);
    const session = await requireAdmin(request.headers);
    const { id } = await context.params;
    const input = visibilitySchema.parse(await readJson(request));
    const team = await prisma.$transaction(async (transaction) => {
      const current = await transaction.team.findUnique({
        where: { id },
        select: { id: true, name: true, leaderboardHidden: true },
      });
      if (!current) {
        throw new ApiError("Team not found.", 404);
      }
      if (current.leaderboardHidden === input.hidden) {
        throw new ApiError(
          input.hidden
            ? "This team is already hidden from the leaderboard."
            : "This team is already visible on the leaderboard.",
          409,
        );
      }

      const updated = await transaction.team.update({
        where: { id },
        data: { leaderboardHidden: input.hidden },
        select: { id: true, name: true, leaderboardHidden: true },
      });
      await transaction.activityLog.create({
        data: {
          actorId: session.user.id,
          actorRole: session.user.role,
          teamId: current.id,
          action: input.hidden
            ? "TEAM_HIDDEN_FROM_LEADERBOARD"
            : "TEAM_SHOWN_ON_LEADERBOARD",
          details: {
            administratorEmail: session.user.email,
            teamName: current.name,
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
