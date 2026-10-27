import { Prisma } from "@prisma/client";
import { z } from "zod";
import { ApiError, handleApiError, readJson } from "@/lib/api";
import { prisma } from "@/lib/db";
import { assertSameOrigin } from "@/lib/security";
import { requireAdmin } from "@/lib/server";

const createRoundSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(10000).default(""),
});

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const session = await requireAdmin(request.headers);
    const input = createRoundSchema.parse(await readJson(request));
    const round = await prisma.$transaction(async (transaction) => {
      const latestRound = await transaction.round.findFirst({
        orderBy: { number: "desc" },
        select: { number: true },
      });
      const created = await transaction.round.create({
        data: {
          number: (latestRound?.number ?? 0) + 1,
          name: input.name,
          description: input.description,
        },
      });
      await transaction.activityLog.create({
        data: {
          actorId: session.user.id,
          actorRole: session.user.role,
          roundId: created.id,
          action: "ROUND_CREATED",
          details: {
            roundNumber: created.number,
            roundName: created.name,
          },
        },
      });
      return created;
    });

    return Response.json({ round }, { status: 201 });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return handleApiError(
        new ApiError(
          "Another round was added at the same time. Refresh and try again.",
          409,
        ),
      );
    }
    return handleApiError(error);
  }
}
