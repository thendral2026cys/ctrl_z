import { z } from "zod";
import { ApiError, handleApiError, readJson } from "@/lib/api";
import { prisma } from "@/lib/db";
import { assertSameOrigin } from "@/lib/security";
import { requireAdmin } from "@/lib/server";

const promoteSchema = z.object({
  userId: z.string().min(1).max(200),
});

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const session = await requireAdmin(request.headers);
    const { userId } = promoteSchema.parse(await readJson(request));
    if (userId === session.user.id) {
      throw new ApiError("You already have administrator access.", 400);
    }

    await prisma.$transaction(async (transaction) => {
      const user = await transaction.user.findUnique({
        where: { id: userId },
        select: { id: true, email: true, role: true },
      });
      if (!user) throw new ApiError("Account not found.", 404);
      if (user.role === "ADMIN") {
        throw new ApiError("This account is already an administrator.", 409);
      }

      await transaction.user.update({
        where: { id: user.id },
        data: { role: "ADMIN" },
      });
      await transaction.activityLog.create({
        data: {
          actorId: session.user.id,
          actorRole: "ADMIN",
          action: "USER_PROMOTED_TO_ADMIN",
          details: {
            targetUserId: user.id,
            targetEmail: user.email,
          },
        },
      });
    });

    return Response.json({ promoted: true });
  } catch (error) {
    return handleApiError(error);
  }
}
