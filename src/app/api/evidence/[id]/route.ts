import { ApiError, handleApiError } from "@/lib/api";
import { getAvailableChallenge } from "@/lib/competition";
import { prisma } from "@/lib/db";
import { requireActiveMembership, requireUser } from "@/lib/server";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireUser(request.headers);
    if (session.user.role !== "ADMIN") {
      await requireActiveMembership(session.user.id);
    }
    const { id } = await context.params;
    const file = await prisma.evidenceFile.findUnique({
      where: { id },
      select: {
        fileName: true,
        mediaType: true,
        contents: true,
        challengeId: true,
      },
    });

    if (!file) {
      throw new ApiError("Evidence file not found.", 404);
    }
    if (session.user.role !== "ADMIN") {
      await getAvailableChallenge(file.challengeId);
    }

    return new Response(new Uint8Array(file.contents), {
      headers: {
        "Content-Type": file.mediaType,
        "Content-Length": String(file.contents.length),
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
