import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { z } from "zod";
import { ApiError, handleApiError, readJson } from "@/lib/api";
import { prisma } from "@/lib/db";
import { assertSameOrigin } from "@/lib/security";
import { requireAdmin } from "@/lib/server";

const manualAdminSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(254),
  password: z.string().min(12).max(128),
});

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const session = await requireAdmin(request.headers);
    const input = manualAdminSchema.parse(await readJson(request));
    const email = input.email.toLowerCase();
    const passwordHash = await hashPassword(input.password);
    const result = await prisma.$transaction(async (transaction) => {
      const existingUser = await transaction.user.findUnique({
        where: { email },
        select: { id: true, role: true },
      });
      if (existingUser && existingUser.role !== "ADMIN") {
        throw new ApiError(
          "Promote this existing account before creating its manual administrator login.",
          409,
        );
      }

      const userId = existingUser?.id ?? randomUUID();
      const existingCredential = await transaction.account.findFirst({
        where: { userId, providerId: "credential" },
        select: { id: true },
      });
      if (existingCredential) {
        throw new ApiError(
          "This administrator account already has a manual login.",
          409,
        );
      }

      if (existingUser) {
        await transaction.account.create({
          data: {
            id: randomUUID(),
            accountId: userId,
            providerId: "credential",
            userId,
            password: passwordHash,
          },
        });
      } else {
        await transaction.user.create({
          data: {
            id: userId,
            name: input.name,
            email,
            emailVerified: true,
            role: "ADMIN",
            accounts: {
              create: {
                id: randomUUID(),
                accountId: userId,
                providerId: "credential",
                password: passwordHash,
              },
            },
          },
        });
      }

      await transaction.activityLog.create({
        data: {
          actorId: session.user.id,
          actorRole: "ADMIN",
          action: "ADMIN_MANUAL_LOGIN_CREATED",
          details: {
            targetUserId: userId,
            targetEmail: email,
            addedToExistingAdmin: Boolean(existingUser),
          },
        },
      });
      return { userId, addedToExistingAdmin: Boolean(existingUser) };
    });

    return Response.json({ created: true, ...result }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
