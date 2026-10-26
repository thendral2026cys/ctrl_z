import { ApiError, handleApiError } from "@/lib/api";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/server";

const PAGE_SIZE = 100;

export async function GET(request: Request) {
  try {
    await requireAdmin(request.headers);
    const url = new URL(request.url);
    const teamId = url.searchParams.get("teamId")?.trim();
    const cursor = url.searchParams.get("cursor")?.trim();
    if (!teamId) {
      throw new ApiError("A team is required to load participant activity.", 400);
    }

    const records = await prisma.activityLog.findMany({
      where: { teamId },
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      take: PAGE_SIZE + 1,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      include: {
        actor: { select: { name: true } },
        team: { select: { id: true, name: true } },
        round: { select: { name: true } },
        challenge: { select: { title: true } },
      },
    });
    const hasMore = records.length > PAGE_SIZE;
    const entries = records.slice(0, PAGE_SIZE).map((record) => ({
      ...record,
      participantRole: record.actorRole ?? "SYSTEM",
    }));

    return Response.json(
      {
        entries,
        nextCursor: hasMore ? entries.at(-1)?.id ?? null : null,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return handleApiError(error);
  }
}
