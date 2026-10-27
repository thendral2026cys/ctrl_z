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
    const [config, rounds, membership, leaderboard, solveCounts] =
      await Promise.all([
      prisma.eventConfig.findUnique({ where: { id: "main" } }),
      prisma.round.findMany({
        where: { archivedAt: null },
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
      getRankedTeamLeaderboard(),
      prisma.challengeSolve.groupBy({
        by: ["challengeId"],
        where: { team: { disqualifiedAt: null } },
        _count: { _all: true },
      }),
    ]);
    if (!config) {
      throw new Error("Event setup is incomplete: run the database seed.");
    }

    const activeMembership =
      membership && !membership.removedAt && !membership.team.disqualifiedAt
        ? membership
        : null;
    const isParticipant =
      session.user.role !== "ADMIN" && session.user.role !== "MAIN_ADMIN";
    const [
      availableTeams,
      ownJoinRequests,
      incomingJoinRequests,
      teamScore,
      teamSolves,
      teamTimers,
    ] =
      await Promise.all([
        !membership && isParticipant
          ? prisma.team.findMany({
              where: { disqualifiedAt: null },
              select: {
                id: true,
                name: true,
                _count: {
                  select: { memberships: { where: { removedAt: null } } },
                },
              },
              orderBy: { name: "asc" },
            })
          : Promise.resolve([]),
        !membership && isParticipant
          ? prisma.teamJoinRequest.findMany({
              where: { userId: session.user.id },
              take: 20,
              orderBy: { createdAt: "desc" },
              select: {
                id: true,
                status: true,
                createdAt: true,
                team: { select: { name: true } },
              },
            })
          : Promise.resolve([]),
        activeMembership?.role === "LEADER"
          ? prisma.teamJoinRequest.findMany({
              where: {
                teamId: activeMembership.teamId,
                status: "PENDING",
              },
              take: 50,
              orderBy: { createdAt: "asc" },
              select: {
                id: true,
                createdAt: true,
                user: { select: { name: true } },
              },
            })
          : Promise.resolve([]),
        activeMembership
            ? getTeamScore(activeMembership.teamId)
            : Promise.resolve(null),
        activeMembership
            ? prisma.challengeSolve.findMany({
                where: { teamId: activeMembership.teamId },
                select: {
                  challengeId: true,
                  solvedAt: true,
                  solvingUser: { select: { name: true } },
                },
              })
            : Promise.resolve([]),
        activeMembership
            ? prisma.teamChallengeTimer.findMany({
                where: { teamId: activeMembership.teamId },
                select: { challengeId: true, firstOpenedAt: true },
              })
            : Promise.resolve([]),
      ]);
    const selectableTeams = availableTeams
      .filter((team) => team._count.memberships < 4)
      .map(({ id, name, _count }) => ({
        id,
        name,
        availableSlots: 4 - _count.memberships,
      }));
    const solvedIds = new Set(teamSolves.map((solve) => solve.challengeId));
    const solveTimeMap = new Map(teamSolves.map((s) => [s.challengeId, s.solvedAt]));
    const solveUserMap = new Map(
      teamSolves.map((s) => [s.challengeId, s.solvingUser?.name ?? null]),
    );
    const timerMap = new Map((teamTimers ?? []).map((t) => [t.challengeId, t.firstOpenedAt]));
    const challengeSolveCounts = new Map(
      solveCounts.map((item) => [item.challengeId, item._count._all]),
    );

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
                solvedByName: solveUserMap.get(challenge.id) ?? null,
                solveCount: challengeSolveCounts.get(challenge.id) ?? 0,
                files: challenge.evidenceFiles,
                solveElapsedSeconds: (() => {
                  const solvedAt = solveTimeMap.get(challenge.id);
                  const openedAt = timerMap.get(challenge.id);
                  if (!solvedAt || !openedAt) return null;
                  return Math.max(0, Math.floor((solvedAt.getTime() - openedAt.getTime()) / 1000));
                })(),
              }))
          : [],
      };
    });

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
                  where: { challenge: { round: { number: { gte: 2 } } } },
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
              ? prisma.ruleReview.findMany({
                  take: 100,
                  include: {
                    team: { select: { name: true } },
                    createdBy: { select: { name: true } },
                  },
                  orderBy: { createdAt: "desc" },
                })
              : Promise.resolve([]),
          ])
        : null;

    const adminTeams = adminData?.[0].map((team) => ({
      id: team.id,
      name: team.name,
      leaderboardHidden: team.leaderboardHidden,
      roundOneScore: team.roundOneScore,
      disqualifiedAt: team.disqualifiedAt,
      disqualificationReason: team.disqualificationReason,
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
          isParticipant,
        availableTeams: selectableTeams,
        ownJoinRequests: ownJoinRequests.map((joinRequest) => ({
          id: joinRequest.id,
          status: joinRequest.status,
          createdAt: joinRequest.createdAt,
          teamName: joinRequest.team.name,
        })),
        incomingJoinRequests: incomingJoinRequests.map((joinRequest) => ({
          id: joinRequest.id,
          createdAt: joinRequest.createdAt,
          participantName: joinRequest.user.name,
        })),
        membershipRemoved: Boolean(
          membership?.removedAt || membership?.team.disqualifiedAt,
        ),
        teamDisqualified: Boolean(membership?.team.disqualifiedAt),
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
        },
        rounds: roundData,
        finalMissionComplete,
        leaderboard: leaderboard.slice(0, 20),
        admin: adminData
          ? {
              isMainAdmin,
              teams: adminTeams,
              activity: adminActivity,
              reviews: adminData[2],
              users: [],
              config: isMainAdmin
                ? {
                    promoOneUrl: config.promoOneUrl,
                    promoTwoUrl: config.promoTwoUrl,
                    externalContestUrl: config.externalContestUrl,
                    aiPolicy: config.aiPolicy,
                    eventTimezone: EVENT_TIME_ZONE,
                    climaxVideoUrl: config.climaxVideoUrl,
                    climaxAvailableAt: config.climaxAvailableAt,
                  }
                : {
                    promoOneUrl: null,
                    promoTwoUrl: null,
                    externalContestUrl: null,
                    aiPolicy: "",
                    eventTimezone: EVENT_TIME_ZONE,
                    climaxVideoUrl: null,
                    climaxAvailableAt: null,
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
