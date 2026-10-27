import { ApiError, handleApiError } from "@/lib/api";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/server";

export async function GET(request: Request) {
  try {
    const session = await requireAdmin(request.headers);
    const teamId = new URL(request.url).searchParams.get("teamId");
    if (!teamId) {
      throw new ApiError("Choose a team before viewing its accounts.", 400);
    }

    const where = {
      ...(session.user.role === "MAIN_ADMIN"
        ? {}
        : { role: "PARTICIPANT" }),
      membership:
        teamId === "__unassigned__"
          ? { is: null }
          : { is: { teamId } },
    };
    if (teamId !== "__unassigned__") {
      const teamExists = await prisma.team.findUnique({
        where: { id: teamId },
        select: { id: true },
      });
      if (!teamExists) {
        throw new ApiError("Team not found.", 404);
      }
    }

    const users = await prisma.user.findMany({
      where,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        disabledAt: true,
        disabledReason: true,
        membership: {
          select: {
            removedAt: true,
            team: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { email: "asc" },
    });

    return Response.json(
      {
        users: users.map((user) => ({
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          disabledAt: user.disabledAt,
          disabledReason: user.disabledReason,
          teamId: user.membership?.team.id ?? null,
          teamName: user.membership?.team.name ?? null,
          membershipRemoved: Boolean(user.membership?.removedAt),
        })),
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return handleApiError(error);
  }
}
