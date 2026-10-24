import { NextResponse } from "next/server";
import { handleApiError } from "@/lib/api";
import { getTeamScore, isRoundAvailable } from "@/lib/competition";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const session = await requireUser(request.headers);
    const [config, rounds, membership] = await Promise.all([
      prisma.eventConfig.findUnique({ where: { id: "main" } }),
      prisma.round.findMany({
        include: {
          challenges: {
            include: {
              evidenceFiles: {
                select: { id: true, fileName: true, mediaType: true, byteLength: true },
                orderBy: { createdAt: "asc" },
              },
            },
            orderBy: { createdAt: "asc" },
          },
        },
        orderBy: { number: "asc" },
      }),
      prisma.membership.findUnique({
        where: { userId: session.user.id },
        include: { team: true },
      }),
    ]);
    if (!config) {
      throw new Error("Event setup is incomplete: run the database seed.");
    }

    const teams = await prisma.team.findMany({
      select: {
        id: true,
        name: true,
        challengeSolves: { select: { pointsAwarded: true } },
        scoreAdjustments: { select: { delta: true } },
      },
    });

    const leaderboard = teams
      .map((team) => ({
        id: team.id,
        name: team.name,
        score: Math.max(
          0,
          team.challengeSolves.reduce((total, solve) => total + solve.pointsAwarded, 0) +
            team.scoreAdjustments.reduce((total, adjustment) => total + adjustment.delta, 0),
        ),
      }))
      .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
      .slice(0, 20);

    const activeMembership = membership && !membership.removedAt ? membership : null;
    const teamScore = activeMembership
      ? await getTeamScore(activeMembership.teamId)
      : null;
    const solvedIds = activeMembership
      ? new Set(
          (
            await prisma.challengeSolve.findMany({
              where: { teamId: activeMembership.teamId },
              select: { challengeId: true, solvedAt: true },
            })
          ).map((solve) => solve.challengeId),
        )
      : new Set<string>();

    const roundData = rounds.map((round, index) => {
      const previous = index > 0 ? rounds[index - 1] : null;
      const available = isRoundAvailable(round, previous);
      const isAdmin = session.user.role === "ADMIN";
      const participantCanSeeRound = Boolean(
        activeMembership && (available || round.status === "CLOSED"),
      );
      const canSeeRoundContent = isAdmin || participantCanSeeRound;
      const now = new Date();
      const publishedChallenges = round.challenges.filter(
        (challenge) =>
          challenge.enabled &&
          (round.status === "CLOSED" ||
            ((!challenge.opensAt || challenge.opensAt <= now) &&
              (!challenge.closesAt || challenge.closesAt > now))),
      );

      return {
        id: round.id,
        number: round.number,
        name: round.name,
        description:
          canSeeRoundContent ? round.description : "",
        status: round.status,
        enabled: round.enabled,
        opensAt: round.opensAt,
        closesAt: round.closesAt,
        available,
        progress: canSeeRoundContent
          ? {
              solved: publishedChallenges.filter((challenge) =>
                solvedIds.has(challenge.id),
              ).length,
              total: publishedChallenges.length,
            }
          : null,
        revealVideoUrl:
          (isAdmin ||
            (activeMembership &&
              round.status === "CLOSED" &&
              round.revealAvailableAt &&
              round.revealAvailableAt <= new Date()))
            ? round.revealVideoUrl
            : null,
        challenges:
          canSeeRoundContent && (available || isAdmin)
            ? round.challenges
                .filter(
                  (challenge) =>
                    isAdmin || challenge.enabled,
                )
              .filter((challenge) => {
                if (isAdmin || round.status === "CLOSED") return true;
                return (
                  (!challenge.opensAt || challenge.opensAt <= now) &&
                  (!challenge.closesAt || challenge.closesAt > now)
                );
              })
              .map((challenge) => ({
                id: challenge.id,
                title: challenge.title,
                slug: challenge.slug,
                description: challenge.description,
                evidenceText: challenge.evidenceText,
                hints: challenge.hints,
                pointValue: challenge.pointValue,
                enabled: challenge.enabled,
                isFinalMission: challenge.isFinalMission,
                opensAt:
                  isAdmin ? challenge.opensAt : null,
                closesAt:
                  isAdmin ? challenge.closesAt : null,
                solved: solvedIds.has(challenge.id),
                files: challenge.evidenceFiles,
              }))
          : [],
      };
    });

    let ownSubmission = null;
    if (activeMembership) {
      ownSubmission = await prisma.finalSubmission.findUnique({
        where: { teamId: activeMembership.teamId },
        select: {
          firstUrl: true,
          secondUrl: true,
          thirdUrl: true,
          submittedAt: true,
        },
      });
    }

    const climaxAvailable =
      Boolean(
        config.climaxVideoUrl &&
          config.climaxAvailableAt &&
          config.climaxAvailableAt <= new Date(),
      ) &&
      Boolean(
        activeMembership &&
          rounds[2]?.challenges.some(
            (challenge) =>
              challenge.isFinalMission &&
              solvedIds.has(challenge.id),
          ),
      );
    const finalMissionComplete = Boolean(
      rounds[2]?.challenges.some(
        (challenge) =>
          challenge.isFinalMission && solvedIds.has(challenge.id),
      ),
    );

    const adminData =
      session.user.role === "ADMIN"
        ? await Promise.all([
            prisma.team.findMany({
              include: {
                memberships: {
                  include: { user: { select: { id: true, name: true, email: true } } },
                  orderBy: { joinedAt: "asc" },
                },
                challengeSolves: { select: { pointsAwarded: true } },
                scoreAdjustments: { select: { delta: true } },
              },
              orderBy: { name: "asc" },
            }),
            prisma.activityLog.findMany({
              take: 100,
              orderBy: { createdAt: "desc" },
              include: {
                actor: { select: { name: true } },
                team: { select: { name: true } },
                round: { select: { name: true } },
                challenge: { select: { title: true } },
              },
            }),
            prisma.finalSubmission.findMany({
              include: { team: { select: { name: true } } },
              orderBy: { submittedAt: "desc" },
            }),
            prisma.ruleReview.findMany({
              take: 100,
              include: {
                team: { select: { name: true } },
                createdBy: { select: { name: true } },
              },
              orderBy: { createdAt: "desc" },
            }),
          ])
        : null;

    const adminTeams = adminData?.[0].map((team) => ({
      id: team.id,
      name: team.name,
      score: Math.max(
        0,
        team.challengeSolves.reduce((total, solve) => total + solve.pointsAwarded, 0) +
          team.scoreAdjustments.reduce((total, adjustment) => total + adjustment.delta, 0),
      ),
      members: team.memberships.map((item) => ({
        id: item.id,
        userId: item.userId,
        name: item.user.name,
        email: item.user.email,
        role: item.role,
        removedAt: item.removedAt,
      })),
    }));

    const adminActivity = adminData?.[1].map((entry) => ({
      ...entry,
      participantRole: entry.actorRole ?? "SYSTEM",
    }));

    return NextResponse.json(
      {
        user: {
          name: session.user.name,
          email: session.user.email,
          role: session.user.role,
        },
        needsTeam: !membership && session.user.role !== "ADMIN",
        membershipRemoved: Boolean(membership?.removedAt),
        team: activeMembership
          ? {
              id: activeMembership.team.id,
              name: activeMembership.team.name,
              memberRole: activeMembership.role,
              score: teamScore,
            }
          : null,
        config: {
          promoOneUrl: config.promoOneUrl,
          promoTwoUrl: config.promoTwoUrl,
          externalContestUrl: config.externalContestUrl,
          aiPolicy: config.aiPolicy,
          eventTimezone: config.eventTimezone,
          climaxVideoUrl: climaxAvailable ? config.climaxVideoUrl : null,
          climaxAvailable,
          finalSubmissionEnabled:
            config.finalSubmissionEnabled && Boolean(activeMembership),
          finalLinkOneLabel: config.finalLinkOneLabel,
          finalLinkOneDescription: config.finalLinkOneDescription,
          finalLinkTwoLabel: config.finalLinkTwoLabel,
          finalLinkTwoDescription: config.finalLinkTwoDescription,
          finalLinkThreeLabel: config.finalLinkThreeLabel,
          finalLinkThreeDescription: config.finalLinkThreeDescription,
        },
        rounds: roundData,
        finalMissionComplete,
        leaderboard,
        finalSubmission: ownSubmission,
        admin: adminData
          ? {
              teams: adminTeams,
              activity: adminActivity,
              finalSubmissions: adminData[2],
              reviews: adminData[3],
              config,
            }
          : null,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return handleApiError(error);
  }
}
