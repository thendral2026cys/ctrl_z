import { ApiError, handleApiError } from "@/lib/api";
import { getAvailableChallenge } from "@/lib/competition";
import { prisma } from "@/lib/db";
import { isAutomaticScoringRound } from "@/lib/scoring";
import { requireActiveMembership, requireUser } from "@/lib/server";

// Mirror of the allowlist enforced at upload time (admin/evidence route).
// We re-validate here so that even if a record were inserted directly into the
// DB with a different mediaType, we never serve it with an unsafe Content-Type.
const SAFE_MEDIA_TYPES = new Set([
  "text/plain",
  "text/csv",
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/gif",
]);

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireUser(request.headers);
    if (
      session.user.role !== "ADMIN" &&
      session.user.role !== "MAIN_ADMIN"
    ) {
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
    if (
      session.user.role !== "ADMIN" &&
      session.user.role !== "MAIN_ADMIN"
    ) {
      const challenge = await getAvailableChallenge(file.challengeId);
      if (!isAutomaticScoringRound(challenge.round.number)) {
        throw new ApiError(
          "Round 1 challenge materials are available on the external contest only.",
          403,
        );
      }
    }

    // Re-validate the stored media type against the trusted allowlist.
    // Any value not on the list is served as a generic binary download to
    // prevent the browser from treating unknown content as executable.
    const contentType = SAFE_MEDIA_TYPES.has(file.mediaType)
      ? file.mediaType
      : "application/octet-stream";

    return new Response(new Uint8Array(file.contents), {
      headers: {
        "Content-Type": contentType,
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
