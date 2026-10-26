import { NextResponse } from "next/server";
import { handleApiError } from "@/lib/api";
import {
  getRankedTeamLeaderboard,
  getTeamScore,
  isRoundAvailable,
} from "@/lib/competition";
import { prisma } from "@/lib/db";
import { calculateTeamScore } from "@/lib/scoring";
import { EVENT_TIME_ZONE } from "@/lib/time";
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

    const leaderboard = await getRankedTeamLeaderboard();

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
      const isAdmin =
        session.user.role === "ADMIN" || session.user.role === "MAIN_ADMIN";
      const participantCanSeeRound = Boolean(
        round.number !== 1 &&
          activeMembership &&
          (available || round.status === "CLOSED"),
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
      const visibleChallenges = round.challenges.filter(
        (challenge) => challenge.enabled,
      );
      const currentlyAvailableChallenges = visibleChallenges.filter(
        (challenge) =>
          (!challenge.opensAt || challenge.opensAt <= now) &&
          (!challenge.closesAt || challenge.closesAt > now),
      );
      const nextChallengeStart = visibleChallenges
        .map((challenge) => challenge.opensAt)
        .filter((opensAt): opensAt is Date => Boolean(opensAt && opensAt > now))
        .sort((a, b) => a.getTime() - b.getTime())[0];
      let availabilityMessage: string | null = null;
      if (!isAdmin && round.number > 1 && !available) {
        const previousRound = index > 0 ? rounds[index - 1] : null;
        if (round.status === "CLOSED") {
          availabilityMessage = "This round has been closed by an administrator.";
        } else if (
          previousRound &&
          previousRound.status !== "CLOSED" &&
          !(previousRound.closesAt && previousRound.closesAt <= now)
        ) {
          availabilityMessage = `Round ${round.number} opens after Round ${previousRound.number} is closed by an administrator.`;
        } else if (round.opensAt && round.opensAt > now) {
          availabilityMessage = `This round is scheduled to open at ${new Intl.DateTimeFormat(
            "en-IN",
            {
              timeZone: EVENT_TIME_ZONE,
              dateStyle: "medium",
              timeStyle: "short",
            },
          ).format(round.opensAt)} IST.`;
        } else if (!round.enabled) {
          availabilityMessage = "An administrator has not enabled this round yet.";
        }
      } else if (
        !isAdmin &&
        round.number > 1 &&
        available &&
        currentlyAvailableChallenges.length === 0
      ) {
        if (visibleChallenges.length === 0) {
          availabilityMessage =
            "No challenges have been published yet. An administrator must enable a challenge.";
        } else if (nextChallengeStart) {
          availabilityMessage = `The next challenge is scheduled to open at ${new Intl.DateTimeFormat(
            "en-IN",
            {
              timeZone: EVENT_TIME_ZONE,
              dateStyle: "medium",
              timeStyle: "short",
            },
          ).format(nextChallengeStart)} IST.`;
        } else {
          availabilityMessage =
            "No challenge is currently within its scheduled window. An administrator can restart a challenge to override its challenge-level schedule.";
        }
      }

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
        availabilityMessage,
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
            (round.number !== 1 &&
              activeMembership &&
              round.status === "CLOSED" &&
              round.revealAvailableAt &&
              round.revealAvailableAt <= new Date()))
            ? round.revealVideoUrl
            : null,
        revealAvailableAt: isAdmin ? round.revealAvailableAt : null,
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
          rounds.find((r) => r.number === 3)?.challenges.some(
            (challenge) =>
              challenge.isFinalMission &&
              solvedIds.has(challenge.id),
          ),
      );
    const finalMissionComplete = Boolean(
      rounds.find((r) => r.number === 3)?.challenges.some(
        (challenge) =>
          challenge.isFinalMission && solvedIds.has(challenge.id),
      ),
    );

    const isMainAdmin = session.user.role === "MAIN_ADMIN";
    const isAdmin = isMainAdmin || session.user.role === "ADMIN";
    const adminData =
      isAdmin
        ? await Promise.all([
            prisma.team.findMany({
              include: {
                memberships: {
                  include: {
                    user: {
                      select: { id: true, name: true, email: true, role: true },
                    },
                  },
                  orderBy: { joinedAt: "asc" },
                },
                challengeSolves: {
                  where: { challenge: { round: { number: { in: [2, 3] } } } },
                  select: { pointsAwarded: true },
                },
                scoreAdjustments: {
                  where: { roundNumber: null },
                  select: { delta: true },
                },
              },
              orderBy: { name: "asc" },
            }),
            prisma.activityLog.findMany({
              take: 100,
              orderBy: { createdAt: "desc" },
              include: {
                actor: { select: { name: true } },
                team: { select: { id: true, name: true } },
                round: { select: { name: true } },
                challenge: { select: { title: true } },
              },
            }),
            isMainAdmin
              ? prisma.finalSubmission.findMany({
                  include: { team: { select: { name: true } } },
                  orderBy: { submittedAt: "desc" },
                })
              : Promise.resolve([]),
            isMainAdmin
              ? prisma.ruleReview.findMany({
                  take: 100,
                  include: {
                    team: { select: { name: true } },
                    createdBy: { select: { name: true } },
                  },
                  orderBy: { createdAt: "desc" },
                })
              : Promise.resolve([]),
            isMainAdmin
              ? prisma.user.findMany({
                  select: { id: true, name: true, email: true, role: true },
                  orderBy: { email: "asc" },
                })
              : Promise.resolve([]),
          ])
        : null;

    const adminTeams = adminData?.[0].map((team) => ({
      id: team.id,
      name: team.name,
      roundOneScore: team.roundOneScore,
      score: calculateTeamScore(
        team.roundOneScore,
        team.challengeSolves.reduce((total, solve) => total + solve.pointsAwarded, 0),
        team.scoreAdjustments.reduce((total, adjustment) => total + adjustment.delta, 0),
      ),
      members: isMainAdmin ? team.memberships.map((item) => ({
        id: item.id,
        userId: item.userId,
        name: item.user.name,
        email: item.user.email,
        role: item.role,
        userRole: item.user.role,
        removedAt: item.removedAt,
      })) : [],
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
        needsTeam:
          !membership &&
          session.user.role !== "ADMIN" &&
          session.user.role !== "MAIN_ADMIN",
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
          eventTimezone: EVENT_TIME_ZONE,
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
        leaderboard: leaderboard.slice(0, 20),
        finalSubmission: ownSubmission,
        admin: adminData
          ? {
              isMainAdmin,
              teams: adminTeams,
              activity: adminActivity,
              finalSubmissions: adminData[2],
              reviews: adminData[3],
              users: adminData[4],
              config: isMainAdmin
                ? { ...config, eventTimezone: EVENT_TIME_ZONE }
                : {
                    promoOneUrl: null,
                    promoTwoUrl: null,
                    externalContestUrl: null,
                    aiPolicy: "",
                    eventTimezone: EVENT_TIME_ZONE,
                    climaxVideoUrl: null,
                    climaxAvailableAt: null,
                    finalLinkOneLabel: "Initial promotional video",
                    finalLinkOneDescription: "",
                    finalLinkTwoLabel: "Story reveal video",
                    finalLinkTwoDescription: "",
                    finalLinkThreeLabel: "Final climax video",
                    finalLinkThreeDescription: "",
                    finalSubmissionEnabled: false,
                  },
            }
          : null,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return handleApiError(error);
  }
}
