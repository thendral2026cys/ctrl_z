import { z } from "zod";
import { handleApiError, readJson } from "@/lib/api";
import { prisma } from "@/lib/db";
import { assertSameOrigin, isSafeHttpsUrl } from "@/lib/security";
import { requireMainAdmin } from "@/lib/server";
import { EVENT_TIME_ZONE } from "@/lib/time";

const optionalHttpsUrl = z
  .union([z.string().trim().max(2048), z.literal("")])
  .transform((value) => value || null)
  .refine((value) => value === null || isSafeHttpsUrl(value), {
    message: "Use an HTTPS URL.",
  });

const configSchema = z.object({
  promoOneUrl: optionalHttpsUrl,
  promoTwoUrl: optionalHttpsUrl,
  externalContestUrl: optionalHttpsUrl,
  aiPolicy: z.string().trim().max(10000),
  // eventTimezone is not accepted from the client; it is always set server-side
  // to EVENT_TIME_ZONE so the field cannot be changed via the API.
  climaxVideoUrl: optionalHttpsUrl,
  climaxAvailableAt: z.union([z.string().datetime().or(z.literal(""))]),
});

export async function PUT(request: Request) {
  try {
    assertSameOrigin(request);
    const session = await requireMainAdmin(request.headers);
    const input = configSchema.parse(await readJson(request));
    const config = await prisma.$transaction(async (transaction) => {
      const updated = await transaction.eventConfig.upsert({
        where: { id: "main" },
        update: {
          ...input,
          eventTimezone: EVENT_TIME_ZONE,
          climaxAvailableAt: input.climaxAvailableAt
            ? new Date(input.climaxAvailableAt)
            : null,
        },
        create: {
          id: "main",
          ...input,
          eventTimezone: EVENT_TIME_ZONE,
          climaxAvailableAt: input.climaxAvailableAt
            ? new Date(input.climaxAvailableAt)
            : null,
        },
      });

      await transaction.activityLog.create({
        data: {
          actorId: session.user.id,
          actorRole: "ADMIN",
          action: "EVENT_CONFIGURATION_UPDATED",
          details: { updatedFields: Object.keys(input) },
        },
      });
      return updated;
    });

    return Response.json({ saved: true, config });
  } catch (error) {
    return handleApiError(error);
  }
}
