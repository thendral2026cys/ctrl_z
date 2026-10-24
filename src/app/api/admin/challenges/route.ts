import { z } from "zod";
import { Prisma } from "@prisma/client";
import { ApiError, handleApiError, readJson } from "@/lib/api";
import { prisma } from "@/lib/db";
import { assertSameOrigin, digestFlag } from "@/lib/security";
import { requireAdmin } from "@/lib/server";

const challengeSchema = z.object({
  roundId: z.string().min(1),
  slug: z.string().trim().min(1).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(10000),
  evidenceText: z.string().trim().max(20000),
  flag: z.string().trim().min(1).max(500),
  pointValue: z.number().int().min(1).max(100000),
  hints: z.array(z.string().trim().min(1).max(1000)).max(20),
  isFinalMission: z.boolean(),
  opensAt: z.union([z.string().datetime(), z.literal("")]),
  closesAt: z.union([z.string().datetime(), z.literal("")]),
});

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const session = await requireAdmin(request.headers);
    const input = challengeSchema.parse(await readJson(request));
    const round = await prisma.round.findUnique({
      where: { id: input.roundId },
      select: { number: true },
    });

    if (!round) {
      throw new ApiError("Round not found.", 404);
    }

    if (input.isFinalMission && round.number !== 3) {
      throw new ApiError("Only a Round 3 challenge can be the final mission.", 400);
    }
    const opensAt = input.opensAt ? new Date(input.opensAt) : null;
    const closesAt = input.closesAt ? new Date(input.closesAt) : null;
    if (opensAt && closesAt && closesAt <= opensAt) {
      throw new ApiError("Challenge close time must follow its open time.", 400);
    }

    const challenge = await prisma.$transaction(async (transaction) => {
      if (input.isFinalMission) {
        const existing = await transaction.challenge.findFirst({
          where: { roundId: input.roundId, isFinalMission: true },
          select: { id: true },
        });
        if (existing) {
          throw new ApiError("Round 3 already has a final mission.", 409);
        }
      }

      const created = await transaction.challenge.create({
        data: {
          roundId: input.roundId,
          slug: input.slug,
          title: input.title,
          description: input.description,
          evidenceText: input.evidenceText,
          flagDigest: digestFlag(input.flag),
          pointValue: input.pointValue,
          hints: input.hints,
          isFinalMission: input.isFinalMission,
          finalMissionKey: input.isFinalMission ? "round-3-final" : null,
          opensAt,
          closesAt,
          enabled: false,
        },
        select: {
          id: true,
          title: true,
          roundId: true,
          pointValue: true,
          isFinalMission: true,
        },
      });
      await transaction.activityLog.create({
        data: {
          actorId: session.user.id,
          actorRole: "ADMIN",
          roundId: input.roundId,
          challengeId: created.id,
          action: "CHALLENGE_CREATED",
          details: { title: created.title, points: created.pointValue },
        },
      });
      return created;
    });

    return Response.json({ challenge }, { status: 201 });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return Response.json(
        {
          error:
            "A challenge with this slug already exists in the selected round, or a final mission is already assigned.",
        },
        { status: 409 },
      );
    }
    return handleApiError(error);
  }
}
