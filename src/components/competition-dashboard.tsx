"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { AdminConsole } from "@/components/admin-console";
import { BrandEmblem } from "@/components/brand-emblem";
import { CompetitionNavigation } from "@/components/competition-navigation";
import { EVENT_TIME_ZONE, formatEventTime } from "@/lib/time";

type UserInfo = { name: string; email: string; role: string };
type Challenge = {
  id: string;
  title: string;
  slug: string;
  description: string;
  evidenceText: string;
  hints: string[];
  pointValue: number;
  opensAt: string | null;
  closesAt: string | null;
  enabled: boolean;
  isFinalMission: boolean;
  solved: boolean;
  solvedByName: string | null;
  solveCount: number;
  solveElapsedSeconds: number | null;
  files: {
    id: string;
    fileName: string;
    mediaType: string;
    byteLength: number;
  }[];
};
type Round = {
  id: string;
  number: number;
  name: string;
  description: string;
  status: string;
  enabled: boolean;
  opensAt: string | null;
  closesAt: string | null;
  revealAvailableAt: string | null;
  available: boolean;
  availabilityMessage: string | null;
  progress: { solved: number; total: number } | null;
  revealVideoUrl: string | null;
  challenges: Challenge[];
};
export type Config = {
  promoOneUrl: string | null;
  promoTwoUrl: string | null;
  externalContestUrl: string | null;
  aiPolicy: string;
  eventTimezone: string;
  climaxVideoUrl: string | null;
  climaxAvailable: boolean;
};
type DashboardData = {
  user: UserInfo;
  needsTeam: boolean;
  membershipRemoved: boolean;
  teamDisqualified: boolean;
  team: { id: string; name: string; memberRole: string; score: number } | null;
  config: Config;
  rounds: Round[];
  leaderboard: { id: string; name: string; score: number; rank: number }[];
  finalMissionComplete: boolean;
  availableTeams: { id: string; name: string; availableSlots: number }[];
  ownJoinRequests: {
    id: string;
    status: string;
    createdAt: string;
    teamName: string;
  }[];
  incomingJoinRequests: {
    id: string;
    createdAt: string;
    participantName: string;
  }[];
  admin: AdminData | null;
};
type AdminData = {
  isMainAdmin: boolean;
  teams: {
    id: string;
    name: string;
    score: number;
    roundOneScore: number;
    leaderboardHidden: boolean;
    disqualifiedAt: string | null;
    disqualificationReason: string | null;
    members: {
      id: string;
      userId: string;
      name: string;
      email: string;
      role: string;
      userRole: string;
      removedAt: string | null;
    }[];
  }[];
  activity: {
    id: string;
    actor: { name: string; role: string } | null;
    participantRole: string;
    team: { id: string; name: string } | null;
    round: { name: string } | null;
    challenge: { title: string } | null;
    action: string;
    details: unknown;
    createdAt: string;
  }[];
  reviews: {
    id: string;
    teamId: string;
    concern: string;
    evidence: string;
    decision: string | null;
    status: string;
    createdAt: string;
    team: { name: string };
    createdBy: { name: string };
  }[];
  users: {
    id: string;
    name: string;
    email: string;
    role: string;
    disabledAt: string | null;
    disabledReason: string | null;
    teamId: string | null;
    teamName: string | null;
    membershipRemoved: boolean;
  }[];
  config: Config & { climaxAvailableAt: string | null };
};
export function CompetitionDashboard({
  initialUser,
  view = "dashboard",
}: {
  initialUser: UserInfo;
  view?: "dashboard" | "challenges";
}) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [teamFormMessage, setTeamFormMessage] = useState("");
  const [teamFormError, setTeamFormError] = useState(false);
  const [inviteCode, setInviteCode] = useState("");
  const [selectedTeamId, setSelectedTeamId] = useState("");
  const [showTeamCode, setShowTeamCode] = useState(false);
  const [teamCodeMessage, setTeamCodeMessage] = useState("");
  const [teamCodeError, setTeamCodeError] = useState(false);
  const [teamCodeBusy, setTeamCodeBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [expandedSolves, setExpandedSolves] = useState<Record<string, boolean>>({});
  const [challengeResults, setChallengeResults] = useState<
    Record<
      string,
      {
        totalSolved: number;
        solves: {
          teamName: string;
          solverName: string;
          solverEmail: string;
          solvedAt: string;
          elapsedSeconds: number | null;
        }[];
      }
    >
  >({});
  const [loadingResults, setLoadingResults] = useState<Record<string, boolean>>({});

  async function toggleSolveDetails(challengeId: string) {
    if (expandedSolves[challengeId]) {
      setExpandedSolves((prev) => ({ ...prev, [challengeId]: false }));
      return;
    }
    setExpandedSolves((prev) => ({ ...prev, [challengeId]: true }));
    if (!challengeResults[challengeId]) {
      setLoadingResults((prev) => ({ ...prev, [challengeId]: true }));
      try {
        const response = await fetch(`/api/admin/challenges/${challengeId}/results`, {
          cache: "no-store",
        });
        const body = await response.json();
        if (response.ok) {
          setChallengeResults((prev) => ({ ...prev, [challengeId]: body }));
        }
      } finally {
        setLoadingResults((prev) => ({ ...prev, [challengeId]: false }));
      }
    }
  }

  useEffect(() => {
    let mounted = true;
    fetch("/api/dashboard", { cache: "no-store" })
      .then(async (response) => {
        const body = (await response.json()) as DashboardData & {
          error?: string;
        };
        if (!response.ok) {
          throw new Error(body.error ?? "Dashboard data could not be loaded.");
        }
        if (mounted) setData(body);
      })
      .catch((reason: unknown) => {
        if (mounted) {
          setError(
            reason instanceof Error
              ? reason.message
              : "Dashboard data could not be loaded.",
          );
        }
      });
    return () => {
      mounted = false;
    };
  }, [refreshKey]);

  function refresh() {
    setError("");
    setRefreshKey((value) => value + 1);
  }

  async function createOrJoinTeam(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setTeamFormMessage("");
    setTeamFormError(false);
    const form = new FormData(event.currentTarget);
    const teamName = String(form.get("teamName") ?? "").trim();
    const code = String(form.get("inviteCode") ?? "").trim();
    const requestTeamId = String(form.get("teamId") ?? "").trim();

    try {
      if ([teamName, code, requestTeamId].filter(Boolean).length > 1) {
        throw new Error("Choose one team setup option at a time.");
      }
      if (requestTeamId) {
        const response = await fetch("/api/team/join-requests", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ teamId: requestTeamId }),
        });
        const body = (await response.json()) as {
          error?: string;
          request?: { teamName: string };
        };
        if (!response.ok) {
          throw new Error(body.error ?? "Team request could not be sent.");
        }
        setTeamFormMessage(
          `Your request to join ${body.request?.teamName ?? "the team"} was sent to its leader.`,
        );
        refresh();
        return;
      }

      const response = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(teamName ? { teamName } : {}),
          ...(code ? { inviteCode: code } : {}),
          ...(form.get("adminBootstrapToken")
            ? {
                adminBootstrapToken: String(
                  form.get("adminBootstrapToken"),
                ).trim(),
              }
            : {}),
        }),
      });
      const body = (await response.json()) as {
        error?: string;
        inviteCode?: string;
        role?: string;
        team?: { name: string };
      };
      if (!response.ok) throw new Error(body.error ?? "Team setup failed.");
      if (body.inviteCode) {
        setInviteCode(body.inviteCode);
        setShowTeamCode(true);
        setTeamCodeMessage("Share this code with teammates. Generating another code will invalidate it.");
      }
      setTeamFormMessage(
        body.role === "ADMIN"
          ? "Organizer access is ready."
          : body.inviteCode
            ? `Team ${body.team?.name ?? ""} created. Copy this one-time invite code: ${body.inviteCode}`
            : `You joined ${body.team?.name ?? "the team"}.`,
      );
      refresh();
    } catch (reason) {
      setTeamFormError(true);
      setTeamFormMessage(
        reason instanceof Error ? reason.message : "Team setup failed.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function decideJoinRequest(
    requestId: string,
    decision: "accept" | "deny",
  ) {
    setBusy(true);
    setTeamFormMessage("");
    setTeamFormError(false);
    try {
      const response = await fetch(`/api/team/join-requests/${requestId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(body.error ?? "Membership request could not be updated.");
      }
      setTeamFormMessage(
        decision === "accept"
          ? "Team member accepted."
          : "Team request declined.",
      );
      refresh();
    } catch (reason) {
      setTeamFormError(true);
      setTeamFormMessage(
        reason instanceof Error
          ? reason.message
          : "Membership request could not be updated.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function generateTeamCode() {
    if (inviteCode) {
      setShowTeamCode((visible) => !visible);
      return;
    }

    setShowTeamCode(true);
    setTeamCodeBusy(true);
    setTeamCodeError(false);
    setTeamCodeMessage("");

    try {
      const response = await fetch("/api/team/invite-code", { method: "POST" });
      const body = (await response.json()) as {
        error?: string;
        inviteCode?: string;
      };
      if (!response.ok) {
        throw new Error(body.error ?? "The team code could not be generated.");
      }
      if (!body.inviteCode) {
        throw new Error("The server did not return a team code.");
      }
      setInviteCode(body.inviteCode);
      setTeamCodeMessage("Share this code with teammates. Any previous code is now invalid.");
    } catch (reason) {
      setTeamCodeError(true);
      setTeamCodeMessage(
        reason instanceof Error
          ? reason.message
          : "The team code could not be generated.",
      );
    } finally {
      setTeamCodeBusy(false);
    }
  }

  if (error) {
    return (
      <main className="auth-layout">
        <section className="auth-card">
          <div className="brand">
            <BrandEmblem />
            <span>ctrl_z</span>
          </div>
          <h1>Dashboard unavailable</h1>
          <p className="message error">{error}</p>
          <p className="subtle">
            Check that the database is running and migrations and seed data have
            been applied.
          </p>
        </section>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="auth-layout">
        <p className="muted" role="status">COMPILING REALITY......99%</p>
      </main>
    );
  }

  const finalMissionComplete = data.finalMissionComplete;

  return (
    <div className="shell app-layout">
      <CompetitionNavigation
        activePage={view === "challenges" ? "challenges" : "dashboard"}
        userName={initialUser.name}
        teamName={data.team?.name ?? "Organizer"}
        role={data.user.role}
      >
        {data.team?.memberRole === "LEADER" && (
          <button
            className="btn-secondary side-team-code-button"
            type="button"
            aria-expanded={showTeamCode}
            aria-controls="team-code-panel"
            onClick={() => void generateTeamCode()}
            disabled={teamCodeBusy}
          >
            {teamCodeBusy ? "Loading code…" : "Team code"}
          </button>
        )}
      </CompetitionNavigation>
      <div className="app-content">

        {showTeamCode && (
          <section
            className="team-code-panel"
            id="team-code-panel"
            aria-live="polite"
          >
            <div>
              <div className="eyebrow">Team invite code</div>
              <p className={teamCodeError ? "message error" : "subtle"}>
                {teamCodeMessage ||
                  (teamCodeBusy ? "Generating a secure code…" : "")}
              </p>
            </div>
            {inviteCode && (
              <div className="team-code-actions">
                <code className="team-code-value">{inviteCode}</code>
                <button
                  className="btn-secondary"
                  type="button"
                  onClick={() => void navigator.clipboard.writeText(inviteCode)}
                >
                  Copy code
                </button>
              </div>
            )}
          </section>
        )}

        <main className="main-content" id="top">
          <section className="hero">
            <div>
              {view === "dashboard" ? (
                <h1>
                  Investigate the signal.
                  <br />
                  <span>Restore the story.</span>
                </h1>
              ) : (
                <h1>
                  Competition
                  <br />
                  <span>Challenges</span>
                </h1>
              )}
              <p className="hero-copy">
                {view === "dashboard"
                  ? "Follow the evidence across team-based rounds. Verified solves award points directly to your team."
                  : "Solve challenges together. Verified solves award points to your team automatically."}
              </p>
              <div className="button-row">
                {data.config.promoOneUrl && (
                  <a
                    className="btn-secondary"
                    href={data.config.promoOneUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Watch Promo 1
                  </a>
                )}
                {data.config.promoTwoUrl && (
                  <a
                    className="btn-secondary"
                    href={data.config.promoTwoUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Watch Promo 2
                  </a>
                )}
              </div>
            </div>
            <div className="hero-side">
              <div className="eyebrow">Team total</div>
              <div className="score-value">{data.team?.score ?? "—"}</div>
              <div className="subtle">
                {data.team
                  ? `${data.team.name} · ${data.team.memberRole.toLowerCase()}`
                  : "Create or join a team to compete"}
              </div>
            </div>
          </section>

          {data.needsTeam && (
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <div className="eyebrow">Team setup</div>
                  <h2>Create a team or join your teammates</h2>
                </div>
                <span className="badge gray">Up to 4 members</span>
              </div>
              <form className="form-grid" onSubmit={createOrJoinTeam}>
                <div className="field">
                  <label htmlFor="dashboard-team-name">Create team</label>
                  <input
                    className="input"
                    id="dashboard-team-name"
                    name="teamName"
                    minLength={2}
                    maxLength={40}
                    placeholder="Team name"
                  />
                </div>
                <div className="field">
                  <label htmlFor="dashboard-team-selection">
                    Request to join a team
                  </label>
                  <select
                    className="select"
                    id="dashboard-team-selection"
                    name="teamId"
                    value={selectedTeamId}
                    onChange={(event) => setSelectedTeamId(event.target.value)}
                    disabled={data.ownJoinRequests.some(
                      (joinRequest) => joinRequest.status === "PENDING",
                    )}
                  >
                    <option value="">Choose a team</option>
                    {data.availableTeams.map((team) => (
                      <option key={team.id} value={team.id}>
                        {team.name} · {team.availableSlots}{" "}
                        {team.availableSlots === 1 ? "spot" : "spots"}
                      </option>
                    ))}
                  </select>
                  <span className="subtle">
                    The team leader must approve your request before you join.
                  </span>
                </div>
                <div className="field">
                  <label htmlFor="dashboard-invite-code">Join by invite code</label>
                  <input
                    className="input"
                    id="dashboard-invite-code"
                    name="inviteCode"
                    placeholder="Invite code from your team leader"
                  />
                </div>
                <div className="field full">
                  <label htmlFor="admin-bootstrap-token">
                    Organizer bootstrap token (organizers only)
                  </label>
                  <input
                    className="input"
                    id="admin-bootstrap-token"
                    name="adminBootstrapToken"
                    type="password"
                    autoComplete="off"
                  />
                </div>
                <div className="full form-actions">
                  <button className="btn" disabled={busy} type="submit">
                    Create team, request to join, or use invite code
                  </button>
                  {teamFormMessage && (
                    <div
                      className={`message${teamFormError ? " error" : ""}`}
                      role="status"
                    >
                      {teamFormMessage}
                    </div>
                  )}
                  {inviteCode && (
                    <button
                      className="btn-secondary"
                      onClick={() => void navigator.clipboard.writeText(inviteCode)}
                      type="button"
                    >
                      Copy invite code
                    </button>
                  )}
                </div>
              </form>
              {data.ownJoinRequests.length > 0 && (
                <div className="stack" style={{ marginTop: 16 }}>
                  <strong>Your recent team requests</strong>
                  {data.ownJoinRequests.map((joinRequest) => (
                    <div className="link-card" key={joinRequest.id}>
                      <span>
                        {joinRequest.teamName} ·{" "}
                        {formatEventTime(
                          joinRequest.createdAt,
                          EVENT_TIME_ZONE,
                        )}{" "}
                        IST
                      </span>
                      <span className="badge">
                        {joinRequest.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}
          {data.incomingJoinRequests.length > 0 && (
            <section className="panel" aria-labelledby="team-requests-heading">
              <div className="eyebrow">Team leader</div>
              <h2 id="team-requests-heading">Membership requests</h2>
              <p className="subtle">
                Review requests to join {data.team?.name}. Teams are limited to
                four active members.
              </p>
              <div className="card-list">
                {data.incomingJoinRequests.map((joinRequest) => (
                  <div className="link-card" key={joinRequest.id}>
                    <div>
                      <strong>{joinRequest.participantName}</strong>
                      <span className="subtle">
                        Requested{" "}
                        {formatEventTime(
                          joinRequest.createdAt,
                          EVENT_TIME_ZONE,
                        )}{" "}
                        IST
                      </span>
                    </div>
                    <div className="button-row">
                      <button
                        className="btn"
                        disabled={busy}
                        onClick={() =>
                          void decideJoinRequest(joinRequest.id, "accept")
                        }
                        type="button"
                      >
                        Accept
                      </button>
                      <button
                        className="btn-secondary"
                        disabled={busy}
                        onClick={() =>
                          void decideJoinRequest(joinRequest.id, "deny")
                        }
                        type="button"
                      >
                        Deny
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
          {data.membershipRemoved && (
            <section className="panel" role="status">
              <p className="message error">
                {data.teamDisqualified
                  ? "Your team was disqualified by an organizer. Challenge access is disabled; contact the organizers if you believe this is a mistake."
                  : "Your team membership was removed by an organizer. Contact the organizers if you believe this is a mistake."}
              </p>
            </section>
          )}

          {view === "dashboard" && (
            <section className="section-grid">
              <Link className="panel span-6" href="/challenges">
                <div className="eyebrow">Competition workspace</div>
                <h2>Challenges</h2>
                <p className="subtle">
                  Open the Round 1 contest link and view available Round 2 and
                  Round 3 challenges.
                </p>
                <span className="btn">Open Challenges</span>
              </Link>
              <Link className="panel span-6" href="/leaderboard">
                <div className="eyebrow">Team standings</div>
                <h2>Leaderboard</h2>
                <p className="subtle">
                  View the ranked team scores and points graph.
                </p>
                <span className="btn-secondary">Open Leaderboard</span>
              </Link>
            </section>
          )}

          {view === "challenges" && (
          <div className="section-grid">
            <section className="panel span-12">
              <div className="panel-heading">
                <div>
                  <div className="eyebrow">Investigation timeline</div>
                  <h2>Three stages. One shared mission.</h2>
                </div>
                <span className="badge gray">All scores are team-based</span>
              </div>
              <div className="card-list">
                {data.rounds.map((round) => {
                  const externalOnly =
                    round.number === 1;

                  if (externalOnly) {
                    return (
                      <article className="round-card" key={round.id}>
                        {data.config.externalContestUrl ? (
                          <a
                            className="btn"
                            href={data.config.externalContestUrl}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Open Round 1 external contest
                          </a>
                        ) : (
                          <p className="subtle">
                            The Round 1 external contest URL is not configured.
                          </p>
                        )}
                      </article>
                    );
                  }

                  return (
                  <article className="round-card" key={round.id}>
                    <div className="panel-heading">
                      <div>
                        <div className="challenge-meta">
                          <span className="badge">ROUND {round.number}</span>
                          <span
                            className={`badge ${
                              round.available ? "green" : "gray"
                            }`}
                          >
                            {round.available ? "OPEN" : round.status}
                          </span>
                        </div>
                        <h3>{round.name}</h3>
                      </div>
                      {round.available && !externalOnly && (
                        <span className="subtle">
                          {round.challenges.length} challenge
                          {round.challenges.length === 1 ? "" : "s"}
                        </span>
                      )}
                    </div>
                    {round.available && !externalOnly && round.description && (
                      <p className="subtle">{round.description}</p>
                    )}
                    {!externalOnly &&
                      round.progress &&
                      round.progress.total > 0 && (
                      <div className="stack">
                        <div className="challenge-meta">
                          <span>Team progress</span>
                          <span>
                            {round.progress.solved}/{round.progress.total} solved
                          </span>
                        </div>
                        <progress
                          className="progress"
                          max={round.progress.total}
                          value={round.progress.solved}
                          aria-label={`${round.progress.solved} of ${round.progress.total} challenges solved`}
                        />
                      </div>
                    )}
                    {round.availabilityMessage && !round.available && (
                      <p className="subtle">{round.availabilityMessage}</p>
                    )}
                    {(round.available || data.user.role === "MAIN_ADMIN") &&
                      !externalOnly && (
                      <div className="card-list">
                        {round.challenges.length === 0 && (
                          <p className="subtle">
                            {round.availabilityMessage ??
                              "Challenge materials will appear here when published."}
                          </p>
                        )}
                        {round.challenges.map((challenge) => (
                          <article
                            className={`challenge-card${
                              challenge.solved ? " solved" : ""
                            }`}
                            key={challenge.id}
                          >
                            <div className="panel-heading">
                              <div>
                                <h3>{challenge.title}</h3>
                                <div className="challenge-meta">
                                  <span>{challenge.pointValue} points</span>
                                  <span>{challenge.solveCount} team solves</span>
                                  {challenge.isFinalMission && (
                                    <span className="badge">FINAL MISSION</span>
                                  )}
                                  {!challenge.enabled && (
                                    <span className="badge yellow">UNPUBLISHED</span>
                                  )}
                                  {challenge.solved && (
                                    <span className="badge green" title={challenge.solvedByName ? `Completed by ${challenge.solvedByName}` : "Completed"}>
                                      ✓ Completed{challenge.solvedByName ? ` by ${challenge.solvedByName}` : ""}
                                    </span>
                                  )}
                                  {challenge.solved && challenge.solveElapsedSeconds !== null && (
                                    <span className="badge" title="Time your team took to solve this challenge">
                                      ⏱ {Math.floor(challenge.solveElapsedSeconds / 60)}m {challenge.solveElapsedSeconds % 60}s
                                    </span>
                                  )}
                                </div>
                              </div>
                              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                                {(data.user.role === "ADMIN" || data.user.role === "MAIN_ADMIN") && (
                                  <>
                                    <button
                                      className={`btn-secondary`}
                                      style={{ fontSize: 12, padding: "4px 10px" }}
                                      title={challenge.enabled ? "Hide this challenge from participants" : "Show this challenge to participants"}
                                      type="button"
                                      onClick={() => {
                                        void fetch(`/api/admin/challenges/${challenge.id}`, {
                                          method: "PATCH",
                                          headers: { "Content-Type": "application/json" },
                                          body: JSON.stringify({ enabled: !challenge.enabled }),
                                        }).then((res) => {
                                          if (res.ok) window.location.reload();
                                          else void res.json().then((e) => alert((e as { error?: string }).error ?? "Failed"));
                                        });
                                      }}
                                    >
                                      {challenge.enabled ? "🙈 Hide" : "👁 Show"}
                                    </button>
                                    <button
                                      className="btn-secondary"
                                      style={{ fontSize: 12, padding: "4px 10px" }}
                                      title="View participants and teams who solved this challenge"
                                      type="button"
                                      onClick={() => void toggleSolveDetails(challenge.id)}
                                    >
                                      {expandedSolves[challenge.id]
                                        ? "Hide solves"
                                        : `📊 Solves (${challenge.solveCount})`}
                                    </button>
                                  </>
                                )}
                                <Link
                                  className={
                                    challenge.solved ? "btn-secondary" : "btn"
                                  }
                                  href={`/challenges/${challenge.id}`}
                                  aria-disabled={
                                    !data.team &&
                                    data.user.role !== "MAIN_ADMIN"
                                  }
                                  onClick={(event) => {
                                    if (
                                      !data.team &&
                                      data.user.role !== "MAIN_ADMIN"
                                    ) {
                                      event.preventDefault();
                                    }
                                  }}
                                >
                                  {challenge.solved ? "Review" : "Investigate"}
                                </Link>
                              </div>
                            </div>
                            <p className="subtle">{challenge.description}</p>
                            {expandedSolves[challenge.id] && (
                              <div
                                style={{
                                  marginTop: 12,
                                  borderTop: "1px solid var(--border, rgba(255,255,255,0.1))",
                                  paddingTop: 10,
                                }}
                              >
                                <div
                                  style={{
                                    display: "flex",
                                    justifyContent: "space-between",
                                    alignItems: "center",
                                    marginBottom: 8,
                                  }}
                                >
                                  <strong style={{ fontSize: 13 }}>
                                    Solvers ({challengeResults[challenge.id]?.totalSolved ?? challenge.solveCount} teams)
                                  </strong>
                                  <span className="subtle" style={{ fontSize: 12 }}>Timezone: IST</span>
                                </div>
                                {loadingResults[challenge.id] ? (
                                  <p className="subtle" style={{ margin: 0, fontSize: 13 }}>
                                    Loading solver history…
                                  </p>
                                ) : challengeResults[challenge.id]?.solves?.length ? (
                                  <div className="table-wrap" style={{ maxHeight: 240, overflowY: "auto" }}>
                                    <table className="data-table" style={{ fontSize: 12 }}>
                                      <thead>
                                        <tr>
                                          <th>Team</th>
                                          <th>Solver</th>
                                          <th>Time taken</th>
                                          <th>Solved at (IST)</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {challengeResults[challenge.id].solves.map((solve) => (
                                          <tr key={`${solve.teamName}-${solve.solvedAt}`}>
                                            <td><strong>{solve.teamName}</strong></td>
                                            <td>
                                              {solve.solverName}
                                              <span className="subtle" style={{ display: "block", fontSize: 11 }}>
                                                {solve.solverEmail}
                                              </span>
                                            </td>
                                            <td>
                                              <span className="badge" style={{ fontSize: 11 }}>
                                                {solve.elapsedSeconds === null
                                                  ? "Timer unavailable"
                                                  : `⏱ ${Math.floor(solve.elapsedSeconds / 60)}m ${
                                                      solve.elapsedSeconds % 60
                                                    }s`}
                                              </span>
                                            </td>
                                            <td style={{ whiteSpace: "nowrap" }}>
                                              {formatEventTime(
                                                solve.solvedAt,
                                                data.config.eventTimezone || EVENT_TIME_ZONE,
                                              )}
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                ) : (
                                  <p className="subtle" style={{ margin: 0, fontSize: 13 }}>
                                    No team has solved this challenge yet.
                                  </p>
                                )}
                              </div>
                            )}
                          </article>
                        ))}
                      </div>
                    )}
                    {!externalOnly && round.revealVideoUrl && (
                      <p style={{ marginBottom: 0 }}>
                        <a
                          href={round.revealVideoUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Watch the Round {round.number} story reveal
                        </a>
                      </p>
                    )}
                  </article>
                  );
                })}
              </div>
            </section>

            <section className="panel span-12">
              <div className="eyebrow">Competition rules</div>
              <h2>AI-use policy</h2>
              {data.config.aiPolicy.trim() ? (
                <div className="policy">{data.config.aiPolicy}</div>
              ) : (
                <div className="policy-pending">
                  The official AI-use policy has not been published yet.
                  Organizers must configure the rules before the competition
                  begins. Suspected violations require a documented human
                  review; writing style or detector output alone is not proof.
                </div>
              )}
            </section>
          </div>
          )}

          {finalMissionComplete && (
            <section className="restoration">
              <div className="restoration-orb" aria-hidden="true" />
              <div className="eyebrow">Mission complete</div>
              <h2>System restoration sequence</h2>
              <p className="subtle">
                Incident status: resolved.
              </p>
              <div className="status-lights" aria-label="All system indicators normal">
                <span />
                <span />
                <span />
              </div>
              {data.config.climaxAvailable && data.config.climaxVideoUrl && (
                <p>
                  <a
                    className="btn"
                    href={data.config.climaxVideoUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Watch the final climax
                  </a>
                </p>
              )}
            </section>
          )}

          {view === "dashboard" && data.admin && (
            <AdminConsole
              admin={data.admin}
              rounds={data.rounds.filter((r) => r.number > 1)}
              isMainAdmin={data.admin.isMainAdmin}
              onUpdated={refresh}
            />
          )}
        </main>
      </div>
    </div>
  );
}
