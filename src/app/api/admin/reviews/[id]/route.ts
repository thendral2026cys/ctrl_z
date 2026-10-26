import { z } from "zod";
import { handleApiError, readJson } from "@/lib/api";
import { prisma } from "@/lib/db";
import { assertSameOrigin } from "@/lib/security";
import { requireMainAdmin } from "@/lib/server";

const reviewUpdateSchema = z.object({
  status: z.enum(["OPEN", "REVIEWED", "CLOSED"]),
  decision: z.string().trim().min(3).max(5000),
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOrigin(request);
    const session = await requireMainAdmin(request.headers);
    const { id } = await context.params;
    const input = reviewUpdateSchema.parse(await readJson(request));

    const result = await prisma.$transaction(async (transaction) => {
      const review = await transaction.ruleReview.update({
        where: { id },
        data: {
          status: input.status,
          decision: input.decision,
        },
      });
      await transaction.activityLog.create({
        data: {
          actorId: session.user.id,
          actorRole: "ADMIN",
          teamId: review.teamId,
          action: "RULE_REVIEW_UPDATED",
          details: {
            reviewId: review.id,
            status: input.status,
            decision: input.decision,
          },
        },
      });
      return review;
    });

    return Response.json({ review: result });
  } catch (error) {
    return handleApiError(error);
  }
}
