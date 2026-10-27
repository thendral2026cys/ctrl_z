import { headers } from "next/headers";
import {
  auth,
  MAIN_ADMIN_EMAILS,
  getMainAdminEmails,
  isMainAdminEmail,
} from "@/lib/auth";
import { ApiError } from "@/lib/api";
import { prisma } from "@/lib/db";

export {
  MAIN_ADMIN_EMAILS,
  getMainAdminEmails,
  isMainAdminEmail,
};

export async function getCurrentSession() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { email: true, emailVerified: true, role: true, disabledAt: true },
  });
  return user && !user.disabledAt
    ? elevateDesignatedMainAdmin({
        ...session,
        user: {
          ...session.user,
          email: user.email,
          emailVerified: user.emailVerified,
          role: user.role,
        },
      })
    : null;
}

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
  if (!isMainAdminEmail(session.user.email)) {
    return session;
  }

  if (session.user.role !== "MAIN_ADMIN" || !session.user.emailVerified) {
    await prisma.$transaction(async (transaction) => {
      const promoted = await transaction.user.updateMany({
        where: {
          id: session.user.id,
          email: { in: getMainAdminEmails() },
        },
        data: { role: "MAIN_ADMIN", emailVerified: true },
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

  return { ...session, user: { ...session.user, role: "MAIN_ADMIN", emailVerified: true } };
}

export async function requireUser(requestHeaders: Headers) {
  const session = await auth.api.getSession({ headers: requestHeaders });

  if (!session) {
    throw new ApiError("Sign in to continue.", 401);
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { email: true, emailVerified: true, role: true, disabledAt: true },
  });
  if (!user || user.disabledAt) {
    throw new ApiError("This account is disabled. Contact an administrator.", 403);
  }

  return elevateDesignatedMainAdmin({
    ...session,
    user: {
      ...session.user,
      email: user.email,
      emailVerified: user.emailVerified,
      role: user.role,
    },
  });
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
  if (!isMainAdminEmail(session.user.email)) {
    throw new ApiError("Main administrator access is required.", 403);
  }
  return session;
}

export async function requireActiveMembership(userId: string) {
  const membership = await prisma.membership.findUnique({
    where: { userId },
    include: { team: true },
  });

  if (!membership || membership.removedAt || membership.team.disqualifiedAt) {
    throw new ApiError("Join an active team to continue.", 403);
  }

  return membership;
}
