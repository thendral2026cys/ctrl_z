import { z } from "zod";
import { ApiError, handleApiError } from "@/lib/api";
import { prisma } from "@/lib/db";
import { assertSameOrigin } from "@/lib/security";
import { requireAdmin } from "@/lib/server";

const allowedTypes = new Set([
  "text/plain",
  "text/csv",
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/gif",
]);
const maxFileSize = 8 * 1024 * 1024;

function hasExpectedFileSignature(mediaType: string, bytes: Uint8Array) {
  if (mediaType === "image/jpeg") {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (mediaType === "image/png") {
    return (
      bytes.length >= 8 &&
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47 &&
      bytes[4] === 0x0d &&
      bytes[5] === 0x0a &&
      bytes[6] === 0x1a &&
      bytes[7] === 0x0a
    );
  }
  if (mediaType === "image/gif") {
    return (
      bytes.length >= 6 &&
      new TextDecoder().decode(bytes.slice(0, 6)).startsWith("GIF8")
    );
  }
  if (mediaType === "application/pdf") {
    return (
      bytes.length >= 5 &&
      new TextDecoder().decode(bytes.slice(0, 5)) === "%PDF-"
    );
  }
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return true;
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const session = await requireAdmin(request.headers);
    const form = await request.formData();
    const challengeId = z.string().min(1).parse(form.get("challengeId"));
    const file = form.get("file");

    if (!(file instanceof File) || file.size === 0 || file.size > maxFileSize) {
      throw new ApiError("Choose a file no larger than 8 MB.", 400);
    }
    if (!allowedTypes.has(file.type)) {
      throw new ApiError(
        "Only text, CSV, PDF, JPEG, PNG, and GIF evidence files are supported.",
        400,
      );
    }
    const contents = new Uint8Array(await file.arrayBuffer());
    if (!hasExpectedFileSignature(file.type, contents)) {
      throw new ApiError("The uploaded file content does not match its type.", 400);
    }

    const challenge = await prisma.challenge.findUnique({
      where: { id: challengeId },
      select: { id: true, roundId: true },
    });
    if (!challenge) {
      throw new ApiError("Challenge not found.", 404);
    }

    const stored = await prisma.$transaction(async (transaction) => {
      const evidence = await transaction.evidenceFile.create({
        data: {
          challengeId,
          fileName: file.name.replace(/[\r\n"]/g, "_").slice(0, 200) || "evidence",
          mediaType: file.type,
          byteLength: file.size,
          contents,
        },
        select: { id: true, fileName: true },
      });
      await transaction.activityLog.create({
        data: {
          actorId: session.user.id,
          actorRole: "ADMIN",
          roundId: challenge.roundId,
          challengeId,
          action: "EVIDENCE_FILE_ADDED",
          details: { fileName: evidence.fileName },
        },
      });
      return evidence;
    });

    return Response.json({ file: stored }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
