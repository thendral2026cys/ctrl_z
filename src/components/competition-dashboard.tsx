"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AdminConsole } from "@/components/admin-console";
import { authClient } from "@/lib/auth-client";
import { formatEventTime } from "@/lib/time";

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
  available: boolean;
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
  finalSubmissionEnabled: boolean;
  finalLinkOneLabel: string;
  finalLinkOneDescription: string;
  finalLinkTwoLabel: string;
  finalLinkTwoDescription: string;
  finalLinkThreeLabel: string;
  finalLinkThreeDescription: string;
};
type DashboardData = {
  user: UserInfo;
  needsTeam: boolean;
  membershipRemoved: boolean;
  team: { id: string; name: string; memberRole: string; score: number } | null;
  config: Config;
  rounds: Round[];
  leaderboard: { id: string; name: string; score: number }[];
  finalMissionComplete: boolean;
  finalSubmission: {
    firstUrl: string;
    secondUrl: string;
    thirdUrl: string;
    submittedAt: string;
  } | null;
  admin: AdminData | null;
};
type AdminData = {
  teams: {
    id: string;
    name: string;
    score: number;
    members: {
      id: string;
      userId: string;
      name: string;
      email: string;
      role: string;
      removedAt: string | null;
    }[];
  }[];
  activity: {
    id: string;
    actor: { name: string; role: string } | null;
    participantRole: string;
    team: { name: string } | null;
    round: { name: string } | null;
    challenge: { title: string } | null;
    action: string;
    details: unknown;
    createdAt: string;
  }[];
  finalSubmissions: {
    id: string;
    firstUrl: string;
    secondUrl: string;
    thirdUrl: string;
    submittedAt: string;
    team: { name: string };
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
  config: Config & { climaxAvailableAt: string | null };
};
type OpenChallenge = {
  challenge: Challenge;
  firstOpenedAt: string;
  elapsedSeconds: number;
};

export function CompetitionDashboard({
  initialUser,
}: {
  initialUser: UserInfo;
}) {
  const router = useRouter();
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [teamFormMessage, setTeamFormMessage] = useState("");
  const [teamFormError, setTeamFormError] = useState(false);
  const [inviteCode, setInviteCode] = useState("");
  const [openChallenge, setOpenChallenge] = useState<OpenChallenge | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [flag, setFlag] = useState("");
  const [submitMessage, setSubmitMessage] = useState("");
  const [submitError, setSubmitError] = useState(false);
  const [busy, setBusy] = useState(false);

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

  useEffect(() => {
    if (!openChallenge) return;
    const timer = window.setInterval(() => setElapsed((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [openChallenge]);

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

    try {
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
      if (body.inviteCode) setInviteCode(body.inviteCode);
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

  async function openChallengeById(challengeId: string) {
    setBusy(true);
    setSubmitMessage("");
    try {
      const response = await fetch(`/api/challenges/${challengeId}/open`, {
        method: "POST",
      });
      const body = (await response.json()) as OpenChallenge & { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Challenge is unavailable.");
      setOpenChallenge(body);
      setElapsed(body.elapsedSeconds);
      setFlag("");
    } catch (reason) {
      setSubmitError(true);
      setSubmitMessage(
        reason instanceof Error ? reason.message : "Challenge is unavailable.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function submitFlag(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!openChallenge) return;
    setBusy(true);
    setSubmitMessage("");
    setSubmitError(false);
    try {
      const response = await fetch(
        `/api/challenges/${openChallenge.challenge.id}/submit`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ flag }),
        },
      );
      const body = (await response.json()) as {
        correct?: boolean;
        alreadySolved?: boolean;
        pointsAwarded?: number;
        error?: string;
      };
      if (!response.ok) throw new Error(body.error ?? "Flag submission failed.");
      setSubmitMessage(
        body.alreadySolved
          ? "Your team already solved this challenge. No additional points were awarded."
          : `Correct flag. ${body.pointsAwarded ?? 0} points awarded to your team.`,
      );
      setFlag("");
      refresh();
    } catch (reason) {
      setSubmitError(true);
      setSubmitMessage(
        reason instanceof Error ? reason.message : "Flag submission failed.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    await authClient.signOut();
    router.refresh();
  }

  if (error) {
    return (
      <main className="auth-layout">
        <section className="auth-card">
          <div className="brand">
            <span className="brand-mark">V</span>
            <span>VIPERWOLF</span>
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
        <p className="muted" role="status">Loading secure event workspace…</p>
      </main>
    );
  }

  const finalMissionComplete = data.finalMissionComplete;

  return (
    <>
      <div className="shell">
        <header className="topbar">
          <a className="brand" href="#top">
            <span className="brand-mark">V</span>
            <span>VIPERWOLF</span>
          </a>
          <div className="user-area">
            <span className="subtle">
              {initialUser.name} · {data.team?.name ?? "Organizer"}
            </span>
            {initialUser.role === "ADMIN" && <span className="badge">ADMIN</span>}
            <button className="btn-secondary" onClick={signOut} type="button">
              Sign out
            </button>
          </div>
        </header>

        <main className="main-content" id="top">
          <section className="hero">
            <div>
              <div className="eyebrow">Authorized competition environment</div>
              <h1>
                Investigate the signal.
                <br />
                <span>Restore the story.</span>
              </h1>
              <p className="hero-copy">
                Follow the evidence across three team-based rounds. Every
                challenge is fictional and designed for this competition only.
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
                {data.config.externalContestUrl && (
                  <a
                    className="btn"
                    href={data.config.externalContestUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    External contest
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
                    Continue
                  </button>
                  {teamFormMessage && (
                    <div
                      className={`message${teamFormError ? " error" : ""}`}
                      role="status"
                    >
                      {teamFormMessage}
                    </div>
                  )}
                  {data.membershipRemoved && (
                    <div className="message error" role="status">
                      Your team membership was removed by an organizer. Contact the
                      organizers if you believe this is a mistake.
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
            </section>
          )}

          <div className="section-grid">
            <section className="panel span-8">
              <div className="panel-heading">
                <div>
                  <div className="eyebrow">Investigation timeline</div>
                  <h2>Three stages. One shared mission.</h2>
                </div>
                <span className="badge gray">All scores are team-based</span>
              </div>
              <div className="card-list">
                {data.rounds.map((round) => (
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
                      {round.available && (
                        <span className="subtle">
                          {round.challenges.length} challenge
                          {round.challenges.length === 1 ? "" : "s"}
                        </span>
                      )}
                    </div>
                    {round.available && round.description && (
                      <p className="subtle">{round.description}</p>
                    )}
                    {round.progress && round.progress.total > 0 && (
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
                    {round.available && (
                      <div className="card-list">
                        {round.challenges.length === 0 && (
                          <p className="subtle">
                            Challenge materials will appear here when published.
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
                                  {challenge.isFinalMission && (
                                    <span className="badge">FINAL MISSION</span>
                                  )}
                                  {challenge.solved && (
                                    <span className="badge green">SOLVED</span>
                                  )}
                                </div>
                              </div>
                              <button
                                className={
                                  challenge.solved ? "btn-secondary" : "btn"
                                }
                                disabled={busy || !data.team}
                                onClick={() =>
                                  void openChallengeById(challenge.id)
                                }
                                type="button"
                              >
                                {challenge.solved ? "Review" : "Investigate"}
                              </button>
                            </div>
                            <p className="subtle">{challenge.description}</p>
                          </article>
                        ))}
                      </div>
                    )}
                    {round.revealVideoUrl && (
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
                ))}
              </div>
              {submitMessage && (
                <p
                  className={`message${submitError ? " error" : ""}`}
                  role="status"
                  style={{ marginTop: 14 }}
                >
                  {submitMessage}
                </p>
              )}
              {openChallenge && (
                <section className="challenge-detail" aria-live="polite">
                  <div className="panel-heading">
                    <div>
                      <div className="eyebrow">Shared team timer</div>
                      <h2>{openChallenge.challenge.title}</h2>
                    </div>
                    <span className="badge">
                      {Math.floor(elapsed / 60)
                        .toString()
                        .padStart(2, "0")}
                      :
                      {(elapsed % 60).toString().padStart(2, "0")} elapsed
                    </span>
                  </div>
                  <p>{openChallenge.challenge.description}</p>
                  {openChallenge.challenge.evidenceText && (
                    <pre className="evidence-text">
                      {openChallenge.challenge.evidenceText}
                    </pre>
                  )}
                  {openChallenge.challenge.files.length > 0 && (
                    <div className="stack">
                      <strong>Evidence files</strong>
                      {openChallenge.challenge.files.map((file) => (
                        <a
                          href={`/api/evidence/${file.id}`}
                          key={file.id}
                          rel="noreferrer"
                          target="_blank"
                        >
                          {file.fileName} ·{" "}
                          {Math.ceil(file.byteLength / 1024)} KB
                        </a>
                      ))}
                    </div>
                  )}
                  {openChallenge.challenge.hints.length > 0 && (
                    <details className="details">
                      <summary>Available hints</summary>
                      <ol>
                        {openChallenge.challenge.hints.map((hint, index) => (
                          <li key={`${index}-${hint}`}>{hint}</li>
                        ))}
                      </ol>
                    </details>
                  )}
                  <form className="inline-form" onSubmit={submitFlag}>
                    <div className="field" style={{ flex: "1 1 260px" }}>
                      <label htmlFor="challenge-flag">Submit team flag</label>
                      <input
                        className="input"
                        id="challenge-flag"
                        name="flag"
                        autoComplete="off"
                        value={flag}
                        onChange={(event) => setFlag(event.target.value)}
                        maxLength={500}
                        required
                      />
                    </div>
                    <button className="btn" disabled={busy} type="submit">
                      Submit flag
                    </button>
                  </form>
                </section>
              )}
            </section>

            <aside className="panel span-4">
              <div className="panel-heading">
                <div>
                  <div className="eyebrow">Live standings</div>
                  <h2>Team leaderboard</h2>
                </div>
              </div>
              {data.leaderboard.length === 0 ? (
                <p className="subtle">Scores appear after a valid solve.</p>
              ) : (
                <div className="table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Team</th>
                        <th>Points</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.leaderboard.map((team, index) => (
                        <tr key={team.id}>
                          <td className="rank">{index + 1}</td>
                          <td>{team.name}</td>
                          <td>{team.score}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="subtle" style={{ marginBottom: 0 }}>
                Public standings show team names and totals only.
              </p>
            </aside>

            <section className="panel span-6">
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

            {data.team && (
              <section className="panel span-6">
                <div className="eyebrow">Team submission</div>
                <h2>Three story links</h2>
                {!data.config.finalSubmissionEnabled ? (
                  <p className="subtle">
                    The organizers have not opened the final submission yet.
                  </p>
                ) : (
                  <div className="stack">
                    <p className="subtle">
                      The three-link submission is independent of the
                      restoration animation. Your team can update its links
                      until organizers close the page.
                    </p>
                    {data.finalSubmission && (
                      <p className="subtle">
                        Last submitted{" "}
                        {formatEventTime(
                          data.finalSubmission.submittedAt,
                          data.config.eventTimezone,
                        )}
                        .
                      </p>
                    )}
                    <a className="btn" href="/final-submission">
                      Open final-submission page
                    </a>
                  </div>
                )}
              </section>
            )}
          </div>

          {finalMissionComplete && (
            <section className="restoration">
              <div className="restoration-orb" aria-hidden="true" />
              <div className="eyebrow">Mission complete</div>
              <h2>System restoration sequence</h2>
              <p className="subtle">
                The fictional device is secure again. Incident status: resolved.
                This visual simulation does not interact with real devices.
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

          {data.admin && (
            <AdminConsole
              admin={data.admin}
              rounds={data.rounds}
              onUpdated={refresh}
            />
          )}
        </main>
        <footer className="footer">
          VIPERWOLF · Authorized, fictional competition environment · No real
          device access
        </footer>
      </div>
    </>
  );
}

export type FinalLinkConfig = Pick<
  Config,
  | "finalLinkOneLabel"
  | "finalLinkOneDescription"
  | "finalLinkTwoLabel"
  | "finalLinkTwoDescription"
  | "finalLinkThreeLabel"
  | "finalLinkThreeDescription"
  | "eventTimezone"
>;

export function FinalSubmissionForm({
  config,
  submission,
  onSaved,
}: {
  config: Config;
  submission: DashboardData["finalSubmission"];
  onSaved: () => void;
}) {
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [values, setValues] = useState({
    firstUrl: submission?.firstUrl ?? "",
    secondUrl: submission?.secondUrl ?? "",
    thirdUrl: submission?.thirdUrl ?? "",
  });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    setError(false);
    try {
      const response = await fetch("/api/team/final-submission", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const body = (await response.json()) as {
        error?: string;
        submittedAt?: string;
      };
      if (!response.ok) throw new Error(body.error ?? "Submission failed.");
      setMessage(
        `All three links were saved for your team at ${new Date(
          body.submittedAt ?? "",
        ).toLocaleString()}.`,
      );
      onSaved();
    } catch (reason) {
      setError(true);
      setMessage(
        reason instanceof Error ? reason.message : "Submission failed.",
      );
    } finally {
      setBusy(false);
    }
  }

  const fields = [
    {
      key: "firstUrl" as const,
      label: config.finalLinkOneLabel,
      description: config.finalLinkOneDescription,
    },
    {
      key: "secondUrl" as const,
      label: config.finalLinkTwoLabel,
      description: config.finalLinkTwoDescription,
    },
    {
      key: "thirdUrl" as const,
      label: config.finalLinkThreeLabel,
      description: config.finalLinkThreeDescription,
    },
  ];

  return (
    <form className="field-group" onSubmit={submit}>
      <p className="subtle">
        Submit exactly three HTTPS video links. A URL does not confirm that a
        team watched its video.
      </p>
      {fields.map((field) => (
        <div className="field" key={field.key}>
          <label htmlFor={field.key}>{field.label}</label>
          {field.description && <span className="subtle">{field.description}</span>}
          <input
            className="input"
            id={field.key}
            type="url"
            inputMode="url"
            autoComplete="url"
            placeholder="https://"
            maxLength={2048}
            value={values[field.key]}
            onChange={(event) =>
              setValues((previous) => ({
                ...previous,
                [field.key]: event.target.value,
              }))
            }
            required
          />
        </div>
      ))}
      {submission && (
        <div className="subtle">
          Last saved{" "}
          {formatEventTime(submission.submittedAt, config.eventTimezone)}.
        </div>
      )}
      {message && (
        <div className={`message${error ? " error" : ""}`} role="status">
          {message}
        </div>
      )}
      <button className="btn" disabled={busy} type="submit">
        {busy ? "Saving…" : "Save three links"}
      </button>
    </form>
  );
}

export function FinalSubmissionPageClient({
  config,
  submission,
}: {
  config: FinalLinkConfig;
  submission: DashboardData["finalSubmission"];
}) {
  const router = useRouter();

  return (
    <FinalSubmissionForm
      config={{
        promoOneUrl: null,
        promoTwoUrl: null,
        externalContestUrl: null,
        aiPolicy: "",
        climaxVideoUrl: null,
        climaxAvailable: false,
        finalSubmissionEnabled: true,
        ...config,
      }}
      submission={submission}
      onSaved={() => router.refresh()}
    />
  );
}
