import { ApiError, handleApiError } from "@/lib/api";
import { prisma } from "@/lib/db";
import { decryptFlag } from "@/lib/security";
import { requireMainAdmin } from "@/lib/server";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    await requireMainAdmin(request.headers);
    const { id } = await context.params;
    const challenge = await prisma.challenge.findUnique({
      where: { id },
      select: { flagEncrypted: true },
    });
    if (!challenge) {
      throw new ApiError("Challenge not found.", 404);
    }

    let answer: string | null = null;
    if (challenge.flagEncrypted) {
      try {
        answer = decryptFlag(challenge.flagEncrypted);
      } catch (err) {
        console.error("Failed to decrypt challenge flag:", err);
      }
    }

    return Response.json(
      { answer },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return handleApiError(error);
  }
}
