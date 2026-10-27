import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { z } from "zod";
import { ApiError, handleApiError, readJson } from "@/lib/api";
import { prisma } from "@/lib/db";
import { assertSameOrigin } from "@/lib/security";
import {
  isMainAdminEmail,
  requireMainAdmin,
} from "@/lib/server";

const manualAdminSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(254),
  password: z.string().min(12).max(128),
  role: z.enum(["PARTICIPANT", "ADMIN"]).default("PARTICIPANT"),
});

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const session = await requireMainAdmin(request.headers);
    const input = manualAdminSchema.parse(await readJson(request));
    const email = input.email.toLowerCase();
    if (isMainAdminEmail(email)) {
      throw new ApiError(
        "A designated main administrator email cannot be provisioned through this form.",
        409,
      );
    }
    const passwordHash = await hashPassword(input.password);
    const result = await prisma.$transaction(async (transaction) => {
      const existingUser = await transaction.user.findUnique({
        where: { email },
        select: { id: true, role: true, disabledAt: true },
      });
      if (existingUser?.role === "MAIN_ADMIN") {
        throw new ApiError("The main administrator account cannot be reconfigured here.", 409);
      }
      if (existingUser?.disabledAt) {
        throw new ApiError("This account is disabled. Reactivate it before adding a login.", 409);
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
        if (input.role === "ADMIN" && existingUser.role !== "ADMIN") {
          await transaction.user.update({
            where: { id: userId },
            data: { role: "ADMIN" },
          });
        }
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
            role: input.role,
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
          actorRole: session.user.role,
          action: "MANUAL_LOGIN_CREATED",
          details: {
            targetUserId: userId,
            targetEmail: email,
            accountRole:
              existingUser?.role === "ADMIN" ? "ADMIN" : input.role,
            addedToExistingAccount: Boolean(existingUser),
          },
        },
      });
      return { userId, addedToExistingAccount: Boolean(existingUser) };
    });

    return Response.json({ created: true, ...result }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
