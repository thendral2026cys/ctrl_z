import { randomBytes } from "node:crypto";
import { ApiError, handleApiError } from "@/lib/api";
import { prisma } from "@/lib/db";
import { assertSameOrigin, digestInviteCode } from "@/lib/security";
import { requireActiveMembership, requireUser } from "@/lib/server";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const session = await requireUser(request.headers);
    const membership = await requireActiveMembership(session.user.id);

    if (membership.role !== "LEADER") {
      throw new ApiError("Only the team leader can generate an invite code.", 403);
    }

    const inviteCode = randomBytes(32).toString("base64url");
    await prisma.$transaction([
      prisma.team.update({
        where: { id: membership.teamId },
        data: { inviteCodeHash: digestInviteCode(inviteCode) },
      }),
      prisma.activityLog.create({
        data: {
          actorId: session.user.id,
          actorRole: membership.role,
          teamId: membership.teamId,
          action: "TEAM_INVITE_CODE_ROTATED",
          details: {},
        },
      }),
    ]);

    return Response.json({ inviteCode });
  } catch (error) {
    return handleApiError(error);
  }
}
