import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { ApiError } from "@/lib/api";
import { prisma } from "@/lib/db";

export async function getCurrentSession() {
  const session = await auth.api.getSession({ headers: await headers() });
  return session ? elevateDesignatedMainAdmin(session) : null;
}

export const MAIN_ADMIN_EMAIL = "thendralcys@gmail.com";

async function elevateDesignatedMainAdmin<
  T extends {
    user: {
      id: string;
      email: string;
      emailVerified: boolean;
      role?: string | null;
    };
  },
>(session: T) {
  if (
    session.user.email.toLowerCase() !== MAIN_ADMIN_EMAIL ||
    !session.user.emailVerified
  ) {
    return session;
  }

  if (session.user.role !== "MAIN_ADMIN") {
    await prisma.$transaction(async (transaction) => {
      const promoted = await transaction.user.updateMany({
        where: {
          id: session.user.id,
          email: MAIN_ADMIN_EMAIL,
          emailVerified: true,
          role: { not: "MAIN_ADMIN" },
        },
        data: { role: "MAIN_ADMIN" },
      });
      if (promoted.count > 0) {
        await transaction.activityLog.create({
          data: {
            actorId: session.user.id,
            actorRole: "MAIN_ADMIN",
            action: "MAIN_ADMIN_ACCESS_GRANTED",
            details: { email: session.user.email },
          },
        });
      }
    });
  }

  return { ...session, user: { ...session.user, role: "MAIN_ADMIN" } };
}

export async function requireUser(requestHeaders: Headers) {
  const session = await auth.api.getSession({ headers: requestHeaders });

  if (!session) {
    throw new ApiError("Sign in to continue.", 401);
  }

  return elevateDesignatedMainAdmin(session);
}

export async function requireAdmin(requestHeaders: Headers) {
  const session = await requireUser(requestHeaders);

  if (session.user.role !== "ADMIN" && session.user.role !== "MAIN_ADMIN") {
    throw new ApiError("Administrator access is required.", 403);
  }

  return session;
}

export async function requireMainAdmin(requestHeaders: Headers) {
  const session = await requireUser(requestHeaders);
  if (
    session.user.role !== "MAIN_ADMIN" ||
    session.user.email.toLowerCase() !== MAIN_ADMIN_EMAIL
  ) {
    throw new ApiError("Main administrator access is required.", 403);
  }
  return session;
}

export async function requireActiveMembership(userId: string) {
  const membership = await prisma.membership.findUnique({
    where: { userId },
    include: { team: true },
  });

  if (!membership || membership.removedAt) {
    throw new ApiError("Join an active team to continue.", 403);
  }

  return membership;
}
