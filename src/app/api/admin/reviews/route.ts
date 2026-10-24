import { z } from "zod";
import { ApiError, handleApiError, readJson } from "@/lib/api";
import { prisma } from "@/lib/db";
import { assertSameOrigin } from "@/lib/security";
import { requireAdmin } from "@/lib/server";

const reviewSchema = z.object({
  teamId: z.string().min(1),
  participantId: z.string().optional(),
  concern: z.string().trim().min(3).max(1000),
  evidence: z.string().trim().min(3).max(10000),
});

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const session = await requireAdmin(request.headers);
    const input = reviewSchema.parse(await readJson(request));
    const team = await prisma.team.findUnique({
      where: { id: input.teamId },
      select: { id: true },
    });
    if (!team) {
      throw new ApiError("Team not found.", 404);
    }

    const review = await prisma.$transaction(async (transaction) => {
      const created = await transaction.ruleReview.create({
        data: {
          teamId: input.teamId,
          participantId: input.participantId || null,
          createdById: session.user.id,
          concern: input.concern,
          evidence: input.evidence,
        },
      });
      await transaction.activityLog.create({
        data: {
          actorId: session.user.id,
          actorRole: "ADMIN",
          teamId: input.teamId,
          action: "RULE_REVIEW_OPENED",
          details: { reviewId: created.id },
        },
      });
      return created;
    });

    return Response.json({ review }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
