import { z } from "zod";
import { ApiError, handleApiError, readJson } from "@/lib/api";
import { prisma } from "@/lib/db";
import { assertSameOrigin, isSafeHttpsUrl } from "@/lib/security";
import { requireActiveMembership, requireUser } from "@/lib/server";

const submissionSchema = z.object({
  firstUrl: z.string().trim().url().max(2048),
  secondUrl: z.string().trim().url().max(2048),
  thirdUrl: z.string().trim().url().max(2048),
});

export async function GET(request: Request) {
  try {
    const session = await requireUser(request.headers);
    const membership = await requireActiveMembership(session.user.id);
    const submission = await prisma.finalSubmission.findUnique({
      where: { teamId: membership.teamId },
      select: {
        firstUrl: true,
        secondUrl: true,
        thirdUrl: true,
        submittedAt: true,
      },
    });

    return Response.json({ submission });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const session = await requireUser(request.headers);
    const membership = await requireActiveMembership(session.user.id);
    const input = submissionSchema.parse(await readJson(request));

    if (
      ![input.firstUrl, input.secondUrl, input.thirdUrl].every(isSafeHttpsUrl)
    ) {
      throw new ApiError("All three links must be valid HTTPS URLs.", 400);
    }

    const result = await prisma.$transaction(async (transaction) => {
      const [config, finalMission] = await Promise.all([
        transaction.eventConfig.findUnique({ where: { id: "main" } }),
        transaction.challenge.findFirst({
          where: {
            round: { number: 3 },
            isFinalMission: true,
            solves: { some: { teamId: membership.teamId } },
          },
          select: { id: true },
        }),
      ]);

      if (!config?.finalSubmissionEnabled) {
        throw new ApiError("Final submissions are not open.", 403);
      }

      if (!finalMission) {
        throw new ApiError(
          "Complete the final mission before submitting the three links.",
          403,
        );
      }

      const submission = await transaction.finalSubmission.upsert({
        where: { teamId: membership.teamId },
        update: {
          firstUrl: input.firstUrl,
          secondUrl: input.secondUrl,
          thirdUrl: input.thirdUrl,
        },
        create: {
          teamId: membership.teamId,
          firstUrl: input.firstUrl,
          secondUrl: input.secondUrl,
          thirdUrl: input.thirdUrl,
        },
        select: { submittedAt: true },
      });
      await transaction.activityLog.create({
        data: {
          actorId: session.user.id,
          actorRole: membership.role,
          teamId: membership.teamId,
          action: "FINAL_LINKS_SUBMITTED",
          details: {
            firstUrl: input.firstUrl,
            secondUrl: input.secondUrl,
            thirdUrl: input.thirdUrl,
          },
        },
      });
      return submission;
    }, { isolationLevel: "Serializable" });

    return Response.json({ saved: true, submittedAt: result.submittedAt });
  } catch (error) {
    return handleApiError(error);
  }
}
