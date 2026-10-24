import { randomBytes } from "node:crypto";
import { z } from "zod";
import { ApiError, handleApiError, readJson } from "@/lib/api";
import { prisma } from "@/lib/db";
import {
  assertSameOrigin,
  digestInviteCode,
  matchesSecret,
} from "@/lib/security";
import { requireUser } from "@/lib/server";

const onboardingSchema = z.object({
  teamName: z.string().trim().min(2).max(40).optional(),
  inviteCode: z.string().trim().min(20).max(200).optional(),
  adminBootstrapToken: z.string().max(200).optional(),
});

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const session = await requireUser(request.headers);
    const input = onboardingSchema.parse(await readJson(request));
    if (!session.user.emailVerified) {
      throw new ApiError("Verify your email before setting up a team.", 403);
    }
    const configuredAdmin = process.env.ADMIN_EMAIL?.trim().toLowerCase();

    if (
      configuredAdmin &&
      session.user.email.toLowerCase() === configuredAdmin &&
      session.user.role !== "ADMIN" &&
      matchesSecret(
        input.adminBootstrapToken ?? "",
        process.env.ADMIN_BOOTSTRAP_TOKEN,
      )
    ) {
      await prisma.$transaction(
        async (transaction) => {
          const config = await transaction.eventConfig.findUnique({
            where: { id: "main" },
          });
          if (!config) {
            throw new ApiError("Event setup is incomplete.", 503);
          }
          if (config.adminBootstrapUsed) {
            throw new ApiError(
              "The organizer bootstrap has already been used.",
              409,
            );
          }

          await transaction.user.update({
            where: { id: session.user.id },
            data: { role: "ADMIN" },
          });
          await transaction.eventConfig.update({
            where: { id: "main" },
            data: { adminBootstrapUsed: true },
          });
          await transaction.activityLog.create({
            data: {
              actorId: session.user.id,
              actorRole: "ADMIN",
              action: "INITIAL_ADMIN_BOOTSTRAPPED",
              details: {},
            },
          });
        },
        { isolationLevel: "Serializable" },
      );

      if (!input.teamName && !input.inviteCode) {
        return Response.json({ role: "ADMIN" });
      }
    }

    if (session.user.role === "ADMIN" && !input.teamName && !input.inviteCode) {
      return Response.json({ role: "ADMIN" });
    }

    const existingMembership = await prisma.membership.findUnique({
      where: { userId: session.user.id },
    });

    if (existingMembership) {
      throw new ApiError("This account already has a team membership.", 409);
    }

    if (input.teamName && input.inviteCode) {
      throw new ApiError("Create a team or join one, not both.", 400);
    }

    if (input.teamName) {
      const inviteCode = randomBytes(32).toString("base64url");
      const team = await prisma.team.create({
        data: {
          name: input.teamName,
          inviteCodeHash: digestInviteCode(inviteCode),
          memberships: {
            create: { userId: session.user.id, role: "LEADER" },
          },
          activity: {
            create: {
              actorId: session.user.id,
              actorRole: "LEADER",
              action: "TEAM_CREATED",
              details: { teamName: input.teamName },
            },
          },
        },
        select: { id: true, name: true },
      });

      return Response.json({ team, inviteCode });
    }

    if (input.inviteCode) {
      const team = await prisma.team.findUnique({
        where: { inviteCodeHash: digestInviteCode(input.inviteCode) },
        select: { id: true, name: true },
      });

      if (!team) {
        throw new ApiError("The team invite code is not valid.", 404);
      }

      await prisma.$transaction(
        async (transaction) => {
          const memberCount = await transaction.membership.count({
            where: { teamId: team.id, removedAt: null },
          });

          if (memberCount >= 4) {
            throw new ApiError("Teams can have no more than four members.", 409);
          }

          await transaction.membership.create({
            data: {
              userId: session.user.id,
              teamId: team.id,
              role: "MEMBER",
            },
          });
          await transaction.activityLog.create({
            data: {
              actorId: session.user.id,
              actorRole: "MEMBER",
              teamId: team.id,
              action: "TEAM_MEMBER_JOINED",
              details: { participantName: session.user.name },
            },
          });
        },
        { isolationLevel: "Serializable" },
      );

      return Response.json({ team });
    }

    throw new ApiError(
      "Enter a team name to create a team, or an invite code to join one.",
      400,
    );
  } catch (error) {
    return handleApiError(error);
  }
}
