import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { ApiError } from "@/lib/api";
import { prisma } from "@/lib/db";

export async function getCurrentSession() {
  return auth.api.getSession({ headers: await headers() });
}

export async function requireUser(requestHeaders: Headers) {
  const session = await auth.api.getSession({ headers: requestHeaders });

  if (!session) {
    throw new ApiError("Sign in to continue.", 401);
  }

  return session;
}

export async function requireAdmin(requestHeaders: Headers) {
  const session = await requireUser(requestHeaders);

  if (session.user.role !== "ADMIN") {
    throw new ApiError("Administrator access is required.", 403);
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
