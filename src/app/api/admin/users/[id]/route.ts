import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { z } from "zod";
import { ApiError, handleApiError, readJson } from "@/lib/api";
import { prisma } from "@/lib/db";
import { assertSameOrigin } from "@/lib/security";
import {
  isMainAdminEmail,
  requireAdmin,
  requireMainAdmin,
} from "@/lib/server";

const userActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("update-name"),
    name: z.string().trim().min(1).max(100),
  }),
  z.object({
    action: z.literal("reset-password"),
    password: z.string().min(12).max(128),
  }),
  z.object({
    action: z.literal("set-role"),
    role: z.enum(["PARTICIPANT", "ADMIN"]),
    reason: z.string().trim().min(3).max(500),
  }),
  z.object({
    action: z.literal("deactivate"),
    reason: z.string().trim().min(3).max(500),
  }),
  z.object({
    action: z.literal("reactivate"),
    reason: z.string().trim().min(3).max(500),
  }),
]);

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOrigin(request);
    const session = await requireAdmin(request.headers);
    const { id } = await context.params;
    const input = userActionSchema.parse(await readJson(request));
    const isMainAdmin = session.user.role === "MAIN_ADMIN";
    const privilegedAction =
      input.action === "set-role" ||
      (input.action === "deactivate" && id !== session.user.id);
    if (privilegedAction && !isMainAdmin) {
      await requireMainAdmin(request.headers);
    }

    const passwordHash =
      input.action === "reset-password"
        ? await hashPassword(input.password)
        : null;

    const updated = await prisma.$transaction(async (transaction) => {
      const target = await transaction.user.findUnique({
        where: { id },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          disabledAt: true,
        },
      });
      if (!target) {
        throw new ApiError("Account not found.", 404);
      }
      if (isMainAdminEmail(target.email)) {
        if (
          input.action === "set-role" ||
          input.action === "deactivate" ||
          input.action === "reactivate"
        ) {
          throw new ApiError("A designated main administrator cannot be disabled or have its role changed.", 409);
        }
      }
      if (!isMainAdmin && target.role !== "PARTICIPANT") {
        throw new ApiError("Regular admins can only manage participant accounts.", 403);
      }
      if (input.action === "deactivate" && target.id === session.user.id) {
        throw new ApiError("You cannot disable your own account.", 409);
      }

      let action: string;
      let details: Record<string, unknown>;
      let name = target.name;
      let role = target.role;
      let disabledAt = target.disabledAt;

      if (input.action === "update-name") {
        await transaction.user.update({
          where: { id },
          data: { name: input.name },
        });
        name = input.name;
        action = "USER_PROFILE_UPDATED";
        details = { targetUserId: id, targetEmail: target.email };
      } else if (input.action === "reset-password") {
        const credential = await transaction.account.findFirst({
          where: { userId: id, providerId: "credential" },
          select: { id: true },
        });
        if (credential) {
          await transaction.account.update({
            where: { id: credential.id },
            data: { password: passwordHash },
          });
        } else {
          await transaction.account.create({
            data: {
              id: randomUUID(),
              accountId: id,
              providerId: "credential",
              userId: id,
              password: passwordHash,
            },
          });
        }
        await transaction.session.deleteMany({ where: { userId: id } });
        action = "USER_PASSWORD_RESET";
        details = { targetUserId: id, targetEmail: target.email };
      } else if (input.action === "set-role") {
        if (target.id === session.user.id) {
          throw new ApiError("You cannot change your own administrator role.", 409);
        }
        if (target.role === input.role) {
          throw new ApiError(`This account already has the ${input.role} role.`, 409);
        }
        await transaction.user.update({
          where: { id },
          data: { role: input.role },
        });
        await transaction.session.deleteMany({ where: { userId: id } });
        role = input.role;
        action = input.role === "ADMIN" ? "USER_PROMOTED_TO_ADMIN" : "USER_DEMOTED_TO_PARTICIPANT";
        details = {
          targetUserId: id,
          targetEmail: target.email,
          previousRole: target.role,
          newRole: input.role,
          reason: input.reason,
        };
      } else if (input.action === "deactivate") {
        if (target.disabledAt) {
          throw new ApiError("This account is already disabled.", 409);
        }
        const activeMembership = await transaction.membership.findFirst({
          where: { userId: id, removedAt: null },
          select: { id: true },
        });
        if (activeMembership) {
          throw new ApiError(
            "Remove this participant from their team before disabling the account, so the team roster and score history remain accurate.",
            409,
          );
        }
        disabledAt = new Date();
        await transaction.user.update({
          where: { id },
          data: { disabledAt, disabledReason: input.reason },
        });
        await transaction.session.deleteMany({ where: { userId: id } });
        action = "USER_ACCOUNT_DISABLED";
        details = {
          targetUserId: id,
          targetEmail: target.email,
          reason: input.reason,
        };
      } else {
        if (!target.disabledAt) {
          throw new ApiError("This account is already active.", 409);
        }
        disabledAt = null;
        await transaction.user.update({
          where: { id },
          data: { disabledAt: null, disabledReason: null },
        });
        action = "USER_ACCOUNT_REACTIVATED";
        details = {
          targetUserId: id,
          targetEmail: target.email,
          reason: input.reason,
        };
      }

      await transaction.activityLog.create({
        data: {
          actorId: session.user.id,
          actorRole: session.user.role,
          action,
          details: {
            administratorEmail: session.user.email,
            ...details,
          },
        },
      });
      return {
        id,
        name,
        email: target.email,
        role,
        disabledAt,
      };
    });

    return Response.json({ user: updated });
  } catch (error) {
    return handleApiError(error);
  }
}
