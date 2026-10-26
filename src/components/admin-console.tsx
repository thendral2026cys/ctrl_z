"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import {
  EVENT_TIME_ZONE,
  eventTimeInput,
  eventTimeIso,
  formatEventTime,
} from "@/lib/time";

type RoundInput = {
  id: string;
  number: number;
  name: string;
  description: string;
  status: string;
  enabled: boolean;
  opensAt: string | null;
  closesAt: string | null;
  revealAvailableAt: string | null;
  revealVideoUrl: string | null;
  challenges: {
    id: string;
    title: string;
    slug: string;
    description: string;
    evidenceText: string;
    hints: string[];
    pointValue: number;
    enabled: boolean;
    isFinalMission: boolean;
    opensAt: string | null;
    closesAt: string | null;
    files: {
      id: string;
      fileName: string;
      byteLength: number;
    }[];
  }[];
};
type ConfigInput = {
  promoOneUrl: string | null;
  promoTwoUrl: string | null;
  externalContestUrl: string | null;
  aiPolicy: string;
  eventTimezone: string;
  climaxVideoUrl: string | null;
  climaxAvailableAt: string | null;
  finalSubmissionEnabled: boolean;
  finalLinkOneLabel: string;
  finalLinkOneDescription: string;
  finalLinkTwoLabel: string;
  finalLinkTwoDescription: string;
  finalLinkThreeLabel: string;
  finalLinkThreeDescription: string;
};
type AdminInput = {
  isMainAdmin: boolean;
  teams: {
    id: string;
    name: string;
    score: number;
    roundOneScore: number;
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
  users: {
    id: string;
    name: string;
    email: string;
    role: string;
  }[];
  config: ConfigInput;
};

export function AdminConsole({
  admin,
  rounds,
  isMainAdmin,
  onUpdated,
}: {
  admin: AdminInput;
  rounds: RoundInput[];
  isMainAdmin: boolean;
  onUpdated: () => void;
}) {
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [latestChallengeId, setLatestChallengeId] = useState("");
  const [selectedChallengeRoundId, setSelectedChallengeRoundId] = useState(
    () => rounds.find((round) => round.number === 2)?.id ?? rounds[0]?.id ?? "",
  );
  const [selectedParticipantLogTeamId, setSelectedParticipantLogTeamId] =
    useState("");
  const [selectedTeamActivity, setSelectedTeamActivity] = useState<
    AdminInput["activity"] | null
  >(null);
  const [teamActivityCursor, setTeamActivityCursor] = useState<string | null>(
    null,
  );
  const [teamActivityLoading, setTeamActivityLoading] = useState(false);
  const [teamActivityError, setTeamActivityError] = useState("");
  const teamActivityRequestId = useRef(0);
  const [config, setConfig] = useState<ConfigInput>({
    ...admin.config,
    eventTimezone: EVENT_TIME_ZONE,
  });
  const [climaxTimeInput, setClimaxTimeInput] = useState(
    eventTimeInput(admin.config.climaxAvailableAt, EVENT_TIME_ZONE),
  );

  async function request(
    path: string,
    method: string,
    body?: unknown,
  ): Promise<Record<string, unknown>> {
    const response = await fetch(path, {
      method,
      headers: body instanceof FormData ? undefined : { "Content-Type": "application/json" },
      body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
    });
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("application/json")) {
      throw new Error(
        response.ok
          ? "The server returned an unexpected response."
          : `The server could not complete the request (HTTP ${response.status}).`,
      );
    }
    const result = (await response.json()) as Record<string, unknown> & {
      error?: string;
      details?: { field?: string; message?: string }[];
    };
    if (!response.ok) {
      const validationDetails = result.details
        ?.slice(0, 3)
        .map(({ field, message }) =>
          [field, message].filter(Boolean).join(": "),
        )
        .filter(Boolean)
        .join(" ");
      throw new Error(
        [result.error ?? "The organizer action failed.", validationDetails]
          .filter(Boolean)
          .join(" "),
      );
    }
    onUpdated();
    return result;
  }

  async function runAction(action: () => Promise<unknown>) {
    setBusy(true);
    setMessage("");
    setError(false);
    try {
      await action();
      setMessage("Saved. Changes are active.");
    } catch (reason) {
      setError(true);
      setMessage(
        reason instanceof Error ? reason.message : "The action could not be completed.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function saveConfig(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await runAction(() =>
      request("/api/admin/config", "PUT", {
        ...config,
          climaxAvailableAt: eventTimeIso(
            climaxTimeInput,
            config.eventTimezone,
          ),
      }),
    );
  }

  async function createChallenge(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const hints = String(form.get("hints") ?? "")
      .split(/\r?\n/)
      .map((hint) => hint.trim())
      .filter(Boolean);
    await runAction(async () => {
      const result = await request("/api/admin/challenges", "POST", {
        roundId: String(form.get("roundId")),
        slug: String(form.get("slug")),
        title: String(form.get("title")),
        description: String(form.get("description")),
        evidenceText: String(form.get("evidenceText")),
        flag: String(form.get("flag")),
        pointValue: Number(form.get("pointValue")),
        hints,
        isFinalMission: form.get("isFinalMission") === "on",
        enabled: form.get("enabled") === "on",
        opensAt: form.get("opensAt")
          ? eventTimeIso(String(form.get("opensAt")), config.eventTimezone)
          : "",
        closesAt: form.get("closesAt")
          ? eventTimeIso(String(form.get("closesAt")), config.eventTimezone)
          : "",
      });
      const created = result.challenge as { id: string };
      setLatestChallengeId(created.id);
      formElement.reset();
    });
  }

  async function uploadEvidence(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    form.set("challengeId", String(form.get("challengeId") || latestChallengeId));
    await runAction(async () => {
      await request("/api/admin/evidence", "POST", form);
      formElement.reset();
    });
  }

  async function adjustScore(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    await runAction(async () => {
      await request("/api/admin/scores", "POST", {
        teamId: String(form.get("teamId")),
        delta: Number(form.get("delta")),
        reason: String(form.get("reason")),
      });
      formElement.reset();
    });
  }

  async function setRoundOneScore(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    await runAction(async () => {
      await request("/api/admin/scores", "POST", {
        teamId: String(form.get("teamId")),
        score: Number(form.get("score")),
        reason: String(form.get("reason")),
      });
      formElement.reset();
    });
  }

  async function createReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    await runAction(async () => {
      await request("/api/admin/reviews", "POST", {
        teamId: String(form.get("teamId")),
        participantId: String(form.get("participantId") ?? "") || undefined,
        concern: String(form.get("concern")),
        evidence: String(form.get("evidence")),
      });
      formElement.reset();
    });
  }

  async function removeMember(
    event: FormEvent<HTMLFormElement>,
    membershipId: string,
  ) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    if (
      !window.confirm(
        "Remove this participant from the team? This will not reopen solved challenges.",
      )
    ) {
      return;
    }
    await runAction(async () => {
      await request(`/api/admin/members/${membershipId}/remove`, "POST", {
        contributionPolicy: String(form.get("contributionPolicy")),
        reason: String(form.get("reason")),
      });
      formElement.reset();
    });
  }

  async function restoreMember(
    event: FormEvent<HTMLFormElement>,
    membershipId: string,
  ) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    await runAction(async () => {
      await request(`/api/admin/members/${membershipId}/restore`, "POST", {
        reason: String(form.get("reason")),
      });
      formElement.reset();
    });
  }

  async function createManualAdmin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    await runAction(async () => {
      await request("/api/admin/users/manual", "POST", {
        name: String(form.get("name")),
        email: String(form.get("email")),
        password: String(form.get("password")),
        role: String(form.get("role")),
      });
      formElement.reset();
    });
  }

  async function promoteUser(userId: string) {
    if (!window.confirm("Grant this account administrator access?")) return;
    await runAction(() =>
      request("/api/admin/users/role", "POST", { userId }),
    );
  }

  async function resetCompetition() {
    const confirmation = window.prompt(
      "This permanently removes teams, participant accounts, scores, challenge attempts/solves, submissions, reviews, timers, and prior activity logs. Administrator accounts and event/challenge configuration are preserved. Type RESET VIPERWOLF to continue.",
    );
    if (confirmation !== "RESET VIPERWOLF") return;
    await runAction(() =>
      request("/api/admin/reset", "POST", {
        confirmation,
      }),
    );
  }

  async function loadTeamActivity(
    teamId: string,
    cursor?: string,
    append = false,
  ) {
    const requestId = ++teamActivityRequestId.current;
    if (!teamId) {
      setSelectedParticipantLogTeamId("");
      setSelectedTeamActivity(null);
      setTeamActivityCursor(null);
      setTeamActivityError("");
      setTeamActivityLoading(false);
      return;
    }

    if (!append) {
      setSelectedParticipantLogTeamId(teamId);
      setSelectedTeamActivity([]);
      setTeamActivityCursor(null);
      setTeamActivityError("");
    }
    setTeamActivityLoading(true);
    try {
      const query = new URLSearchParams({ teamId });
      if (cursor) query.set("cursor", cursor);
      const response = await fetch(`/api/admin/activity?${query}`, {
        cache: "no-store",
      });
      const result = (await response.json()) as {
        entries?: AdminInput["activity"];
        nextCursor?: string | null;
        error?: string;
      };
      if (!response.ok) {
        throw new Error(result.error ?? "Team activity could not be loaded.");
      }
      if (requestId !== teamActivityRequestId.current) return;
      setSelectedTeamActivity((current) =>
        append ? [...(current ?? []), ...(result.entries ?? [])] : result.entries ?? [],
      );
      setTeamActivityCursor(result.nextCursor ?? null);
    } catch (reason) {
      if (requestId !== teamActivityRequestId.current) return;
      setTeamActivityError(
        reason instanceof Error
          ? reason.message
          : "Team activity could not be loaded.",
      );
    } finally {
      if (requestId === teamActivityRequestId.current) {
        setTeamActivityLoading(false);
      }
    }
  }

  const participantActivity = admin.activity.filter(
    (entry) =>
      entry.participantRole !== "ADMIN" &&
      entry.participantRole !== "MAIN_ADMIN" &&
      !entry.action.startsWith("CHALLENGE_") &&
      !entry.action.startsWith("ROUND_") &&
      !entry.action.startsWith("CONFIG_") &&
      !entry.action.startsWith("SCORE_") &&
      !entry.action.startsWith("MEMBER_") &&
      !entry.action.startsWith("EVIDENCE_") &&
      entry.action !== "ADMIN_BOOTSTRAP" &&
      entry.action !== "RULE_REVIEW_DECIDED",
  );
  const filteredParticipantActivity = participantActivity.filter(
    (entry) =>
      !selectedParticipantLogTeamId ||
      entry.team?.id === selectedParticipantLogTeamId,
  );
  const participantLogEntries =
    selectedTeamActivity ?? filteredParticipantActivity;
  const selectedTeamName = admin.teams.find(
    (team) => team.id === selectedParticipantLogTeamId,
  )?.name;

  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <div className="eyebrow">Organizer workspace</div>
          <h2>{isMainAdmin ? "Main administrator workspace" : "Admin workspace"}</h2>
        </div>
        <span className="badge">{isMainAdmin ? "MAIN ADMIN" : "ADMIN"}</span>
      </div>
      <p className="subtle">
        This workspace contains private team activity. Do not publish evidence
        or answer keys here.
      </p>
      {message && (
        <p className={`message${error ? " error" : ""}`} role="status">
          {message}
        </p>
      )}

      {isMainAdmin && (
      <>
      <details className="details">
        <summary>Administrator access and manual login accounts</summary>
        <p className="subtle" style={{ marginTop: 10 }}>
          Create participant or admin login IDs and passwords here. Only the
          main administrator can grant admin access. Public password
          registration is disabled.
        </p>
        <form
          className="form-grid"
          onSubmit={createManualAdmin}
          style={{ marginTop: 14 }}
        >
          <div className="field">
            <label htmlFor="admin-login-name">Account name</label>
            <input
              className="input"
              id="admin-login-name"
              name="name"
              maxLength={100}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="admin-login-email">Manual login ID (email)</label>
            <input
              className="input"
              id="admin-login-email"
              name="email"
              type="email"
              maxLength={254}
              autoComplete="off"
              required
            />
          </div>
          <div className="field">
            <label htmlFor="admin-login-password">Temporary password</label>
            <input
              className="input"
              id="admin-login-password"
              name="password"
              type="password"
              minLength={12}
              maxLength={128}
              autoComplete="new-password"
              required
            />
            <span className="subtle">At least 12 characters.</span>
          </div>
          <div className="field">
            <label htmlFor="admin-login-role">Account access</label>
            <select
              className="select"
              id="admin-login-role"
              name="role"
              defaultValue="PARTICIPANT"
            >
              <option value="PARTICIPANT">Participant</option>
              <option value="ADMIN">Administrator</option>
            </select>
          </div>
          <div className="full form-actions">
            <button className="btn" disabled={busy} type="submit">
              Create manual login
            </button>
          </div>
        </form>
        <h3 style={{ marginTop: 20 }}>Existing accounts</h3>
        <div className="card-list">
          {admin.users.map((user) => (
            <div className="link-card" key={user.id}>
              <div>
                <strong>{user.name}</strong>
                <span className="subtle">{user.email}</span>
              </div>
              {user.role === "MAIN_ADMIN" ? (
                <span className="badge">MAIN ADMIN</span>
              ) : user.role === "ADMIN" ? (
                <span className="badge">ADMIN</span>
              ) : (
                <button
                  className="btn-secondary"
                  disabled={busy}
                  onClick={() => void promoteUser(user.id)}
                  type="button"
                >
                  Make administrator
                </button>
              )}
            </div>
          ))}
          {admin.users.length === 0 && (
            <p className="subtle">No user accounts are available.</p>
          )}
        </div>
      </details>

      <details className="details">
        <summary>Danger zone · full competition reset</summary>
        <p className="subtle" style={{ marginTop: 10 }}>
          Removes teams, participant accounts, scores, submissions, challenge
          history, reviews, timers, and previous activity logs. Administrator
          accounts, event settings, schedules, and challenge definitions remain.
          The reset itself is recorded in a new audit entry.
        </p>
        <button
          className="btn-danger"
          disabled={busy}
          onClick={() => void resetCompetition()}
          style={{ marginTop: 10 }}
          type="button"
        >
          Reset competition data
        </button>
      </details>
      </>
      )}

      {isMainAdmin && (
      <details className="details" open>
        <summary>Event content, links, policy, and final submission</summary>
        <form className="form-grid" onSubmit={saveConfig} style={{ marginTop: 14 }}>
          <div className="field">
            <label htmlFor="promoOneUrl">Promo 1 URL</label>
            <input
              className="input"
              id="promoOneUrl"
              type="url"
              value={config.promoOneUrl ?? ""}
              onChange={(event) =>
                setConfig({ ...config, promoOneUrl: event.target.value || null })
              }
            />
          </div>
          <div className="field">
            <label htmlFor="promoTwoUrl">Promo 2 URL</label>
            <input
              className="input"
              id="promoTwoUrl"
              type="url"
              value={config.promoTwoUrl ?? ""}
              onChange={(event) =>
                setConfig({ ...config, promoTwoUrl: event.target.value || null })
              }
            />
          </div>
          <div className="field">
            <label htmlFor="externalContestUrl">External contest URL</label>
            <input
              className="input"
              id="externalContestUrl"
              type="url"
              value={config.externalContestUrl ?? ""}
              onChange={(event) =>
                setConfig({
                  ...config,
                  externalContestUrl: event.target.value || null,
                })
              }
            />
          </div>
          <div className="field">
            <span className="label">Permanent event timezone</span>
            <span className="subtle">
              All schedules, activity timestamps, and displayed event times use
              India Standard Time (IST, Asia/Kolkata).
            </span>
          </div>
          <div className="field full">
            <label htmlFor="aiPolicy">Official AI-use policy</label>
            <textarea
              className="textarea"
              id="aiPolicy"
              value={config.aiPolicy}
              onChange={(event) =>
                setConfig({ ...config, aiPolicy: event.target.value })
              }
              placeholder="Publish the official organizer-approved policy before the event."
            />
            <span className="subtle">
              Do not claim that detector scores or writing style alone prove AI use.
            </span>
          </div>
          <div className="field">
            <label htmlFor="climaxVideoUrl">Final climax video URL</label>
            <input
              className="input"
              id="climaxVideoUrl"
              type="url"
              value={config.climaxVideoUrl ?? ""}
              onChange={(event) =>
                setConfig({ ...config, climaxVideoUrl: event.target.value || null })
              }
            />
          </div>
          <div className="field">
            <label htmlFor="climaxAvailableAt">
              Climax availability ({config.eventTimezone})
            </label>
            <input
              className="input"
              id="climaxAvailableAt"
              type="datetime-local"
              value={climaxTimeInput}
              onChange={(event) =>
                setClimaxTimeInput(event.target.value)
              }
            />
          </div>
          {(
            [
              ["finalLinkOneLabel", "Final link 1 label"],
              ["finalLinkOneDescription", "Final link 1 description"],
              ["finalLinkTwoLabel", "Final link 2 label"],
              ["finalLinkTwoDescription", "Final link 2 description"],
              ["finalLinkThreeLabel", "Final link 3 label"],
              ["finalLinkThreeDescription", "Final link 3 description"],
            ] as const
          ).map(([key, label]) => (
            <div className="field" key={key}>
              <label htmlFor={key}>{label}</label>
              <input
                className="input"
                id={key}
                value={config[key]}
                maxLength={key.includes("Label") ? 120 : 500}
                onChange={(event) =>
                  setConfig({ ...config, [key]: event.target.value })
                }
              />
            </div>
          ))}
          <label className="field full">
            <span>Final links</span>
            <span className="inline-form">
              <input
                checked={config.finalSubmissionEnabled}
                onChange={(event) =>
                  setConfig({
                    ...config,
                    finalSubmissionEnabled: event.target.checked,
                  })
                }
                type="checkbox"
              />
              Open the three-link final submission page
            </span>
          </label>
          <div className="full form-actions">
            <button
              className="btn"
              disabled={busy}
              type="submit"
            >
              Save event configuration
            </button>
          </div>
        </form>
      </details>
      )}

      {isMainAdmin && (
      <details className="details" open>
        <summary>Round schedule and story-reveal videos</summary>
        <div className="card-list" style={{ marginTop: 14 }}>
          {rounds.map((round) => (
            <RoundControls
              key={round.id}
              round={round}
              timeZone={config.eventTimezone}
              busy={busy}
              request={request}
              runAction={runAction}
            />
          ))}
        </div>
      </details>
      )}

      <details className="details">
        <summary>Create challenges and add protected evidence files</summary>
        <p className="subtle">
          These setup slots are visible only to administrators. They do not
          create challenges or affect scores until you save a challenge.
        </p>
        <div className="card-list" style={{ marginTop: 14 }}>
          {[2, 3].map((roundNumber) => {
            const round = rounds.find((item) => item.number === roundNumber);
            if (!round) return null;

            const placeholderCount = Math.max(
              0,
              3 - round.challenges.length,
            );
            return Array.from(
              { length: placeholderCount },
              (_, index) => (
                <div
                  className="link-card"
                  key={`${round.id}-placeholder-${index}`}
                >
                  <div>
                    <strong>
                      Round {roundNumber} · Challenge slot{" "}
                      {round.challenges.length + index + 1}
                    </strong>
                    <span className="subtle">
                      Setup slot only; no challenge or points have been created.
                    </span>
                  </div>
                  <button
                    className="btn-secondary"
                    disabled={busy}
                    onClick={() => {
                      setSelectedChallengeRoundId(round.id);
                      document.getElementById("challenge-slug")?.focus();
                    }}
                    type="button"
                  >
                    Configure challenge
                  </button>
                </div>
              ),
            );
          })}
        </div>
        <form className="form-grid" onSubmit={createChallenge} style={{ marginTop: 14 }}>
          <div className="field">
            <label htmlFor="challenge-round">Round</label>
            <select
              className="select"
              id="challenge-round"
              name="roundId"
              onChange={(event) => setSelectedChallengeRoundId(event.target.value)}
              required
              value={selectedChallengeRoundId}
            >
              {rounds.map((round) => (
                <option key={round.id} value={round.id}>
                  {round.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="challenge-slug">Challenge slug</label>
            <input
              className="input"
              id="challenge-slug"
              name="slug"
              maxLength={80}
              pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
              placeholder="device-log-review"
              required
            />
          </div>
          <div className="field">
            <label htmlFor="challenge-title">Title</label>
            <input
              className="input"
              id="challenge-title"
              name="title"
              maxLength={120}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="challenge-points">Points</label>
            <input
              className="input"
              id="challenge-points"
              name="pointValue"
              type="number"
              min={1}
              max={100000}
              defaultValue={100}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="challenge-opens">
              Challenge opens ({config.eventTimezone}, optional)
            </label>
            <input
              className="input"
              id="challenge-opens"
              name="opensAt"
              type="datetime-local"
            />
          </div>
          <div className="field">
            <label htmlFor="challenge-closes">
              Challenge closes ({config.eventTimezone}, optional)
            </label>
            <input
              className="input"
              id="challenge-closes"
              name="closesAt"
              type="datetime-local"
            />
          </div>
          <div className="field full">
            <label htmlFor="challenge-description">Description</label>
            <textarea
              className="textarea"
              id="challenge-description"
              name="description"
              maxLength={10000}
            />
          </div>
          <div className="field full">
            <label htmlFor="challenge-evidence">Evidence / organizer notes</label>
            <textarea
              className="textarea"
              id="challenge-evidence"
              name="evidenceText"
              maxLength={20000}
            />
          </div>
          <div className="field">
            <label htmlFor="challenge-flag">Correct flag (never shown to teams)</label>
            <input
              className="input"
              id="challenge-flag"
              name="flag"
              type="password"
              autoComplete="new-password"
              maxLength={500}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="challenge-hints">Hints (one per line)</label>
            <textarea
              className="textarea"
              id="challenge-hints"
              name="hints"
              maxLength={10000}
            />
          </div>
          <label className="field full">
            <span>Final mission</span>
            <span className="inline-form">
              <input name="isFinalMission" type="checkbox" />
              Mark as the one Round 3 device-unlocking challenge
            </span>
          </label>
          <label className="field full">
            <span>Publication</span>
            <span className="inline-form">
              <input defaultChecked name="enabled" type="checkbox" />
              Publish immediately when the round is open
            </span>
          </label>
          <div className="full form-actions">
            <button className="btn" disabled={busy} type="submit">
              Create challenge
            </button>
          </div>
        </form>

        {latestChallengeId && (
          <form className="inline-form" onSubmit={uploadEvidence}>
            <div className="field">
              <label htmlFor="evidence-upload">
                Upload evidence for new challenge
              </label>
              <input
                className="input"
                id="evidence-upload"
                name="file"
                type="file"
                accept=".txt,.csv,.pdf,.jpg,.jpeg,.png,.gif"
                required
              />
              <input
                name="challengeId"
                type="hidden"
                value={latestChallengeId}
              />
            </div>
            <button className="btn-secondary" disabled={busy} type="submit">
              Upload private evidence
            </button>
          </form>
        )}
        <div className="card-list" style={{ marginTop: 14 }}>
          {rounds.flatMap((round) =>
            round.challenges.map((challenge) => (
              <ChallengeEditor
                key={challenge.id}
                challenge={challenge}
                roundName={round.name}
                roundNumber={round.number}
                roundStatus={round.status}
                timeZone={config.eventTimezone}
                busy={busy}
                request={request}
                runAction={runAction}
              />
            )),
          )}
        </div>
      </details>

      {isMainAdmin && (
      <details className="details">
        <summary>Round 1 manual team score entry</summary>
        <p className="subtle">
          Round 1 scores are entered by administrators only. The team total is
          retained for leaderboard scoring, and an equal share for each active
          team member is recorded in the audit log.
        </p>
        <form className="form-grid" onSubmit={setRoundOneScore}>
          <div className="field">
            <label htmlFor="round-one-score-team">Team</label>
            <select
              className="select"
              id="round-one-score-team"
              name="teamId"
              required
            >
              {admin.teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name} (Round 1: {team.roundOneScore}; total: {team.score})
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="round-one-score">Round 1 team score</label>
            <input
              className="input"
              id="round-one-score"
              name="score"
              type="number"
              min={0}
              max={100000}
              required
            />
          </div>
          <div className="field full">
            <label htmlFor="round-one-score-reason">Reason (required)</label>
            <input
              className="input"
              id="round-one-score-reason"
              name="reason"
              minLength={3}
              maxLength={500}
              required
            />
          </div>
          <div className="full form-actions">
            <button className="btn" disabled={busy} type="submit">
              Save Round 1 score
            </button>
          </div>
        </form>
      </details>
      )}

      <details className="details">
        <summary>Administrator team score adjustment</summary>
        <p className="subtle">
          A reason is required, the operation is audited, and team totals never
          fall below zero.
        </p>
        <form className="form-grid" onSubmit={adjustScore}>
          <div className="field">
            <label htmlFor="score-team">Team</label>
            <select className="select" id="score-team" name="teamId" required>
              {admin.teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name} ({team.score} points)
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="score-delta">Points to add or deduct</label>
            <input
              className="input"
              id="score-delta"
              name="delta"
              type="number"
              min={-100000}
              max={100000}
              required
            />
          </div>
          <div className="field full">
            <label htmlFor="score-reason">Reason (required)</label>
            <input
              className="input"
              id="score-reason"
              name="reason"
              minLength={3}
              maxLength={500}
              required
            />
          </div>
          <div className="full form-actions">
            <button className="btn" disabled={busy} type="submit">
              Record score adjustment
            </button>
          </div>
        </form>
      </details>

      {isMainAdmin && (
      <details className="details">
        <summary>Team roster and participant removal</summary>
        <div className="card-list" style={{ marginTop: 14 }}>
          {admin.teams.map((team) => (
            <div className="list-card" key={team.id}>
              <h3>
                {team.name} · {team.score} points
              </h3>
              {team.members.map((member) => (
                <div className="link-card" key={member.id}>
                  <div>
                    <strong>{member.name} · {member.role.toLowerCase()}</strong>
                    <span className="subtle">
                      {member.email}
                      {member.removedAt ? " · removed" : ""}
                    </span>
                  </div>
                  {member.removedAt ? (
                    <form
                      className="inline-form"
                      onSubmit={(event) =>
                        void restoreMember(event, member.id)
                      }
                    >
                      <div className="field">
                        <label htmlFor={`restore-reason-${member.id}`}>
                          Restore reason (required)
                        </label>
                        <input
                          className="input"
                          id={`restore-reason-${member.id}`}
                          name="reason"
                          minLength={3}
                          maxLength={500}
                          required
                        />
                      </div>
                      <button
                        className="btn-secondary"
                        disabled={busy}
                        type="submit"
                      >
                        Restore participant and reverse removal
                      </button>
                    </form>
                  ) : (
                    <details className="details">
                      <summary>Remove participant</summary>
                      <form
                        className="field-group"
                        onSubmit={(event) =>
                          void removeMember(event, member.id)
                        }
                      >
                        <div className="field">
                          <label htmlFor={`policy-${member.id}`}>
                            Previous challenge contributions
                          </label>
                          <select
                            className="select"
                            id={`policy-${member.id}`}
                            name="contributionPolicy"
                          >
                            <option value="RETAIN">Retain in team score</option>
                            <option value="EXCLUDE">Exclude from team score</option>
                          </select>
                        </div>
                        <div className="field">
                          <label htmlFor={`reason-${member.id}`}>
                            Removal decision reason
                          </label>
                          <input
                            className="input"
                            id={`reason-${member.id}`}
                            name="reason"
                            minLength={3}
                            maxLength={500}
                            required
                          />
                        </div>
                        <button className="btn-danger" disabled={busy} type="submit">
                          Confirm removal
                        </button>
                      </form>
                    </details>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      </details>
      )}

      {isMainAdmin && (
      <details className="details">
        <summary>Documented rules review</summary>
        <p className="subtle">
          Reviews are human-led. An AI detector result or writing style alone
          must not trigger a penalty or disqualification.
        </p>
        <form className="form-grid" onSubmit={createReview}>
          <div className="field">
            <label htmlFor="review-team">Team</label>
            <select className="select" id="review-team" name="teamId" required>
              {admin.teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="review-participant">Participant ID (optional)</label>
            <input
              className="input"
              id="review-participant"
              name="participantId"
            />
          </div>
          <div className="field full">
            <label htmlFor="review-concern">Concern to review</label>
            <input
              className="input"
              id="review-concern"
              name="concern"
              minLength={3}
              maxLength={1000}
              required
            />
          </div>
          <div className="field full">
            <label htmlFor="review-evidence">
              Observable evidence (not detector scores alone)
            </label>
            <textarea
              className="textarea"
              id="review-evidence"
              name="evidence"
              minLength={3}
              maxLength={10000}
              required
            />
          </div>
          <div className="full form-actions">
            <button className="btn" disabled={busy} type="submit">
              Open documented review
            </button>
          </div>
        </form>
        {admin.reviews.length > 0 && (
          <div className="card-list" style={{ marginTop: 16 }}>
            {admin.reviews.map((review) => (
              <ReviewCard
                key={review.id}
                review={review}
                busy={busy}
                runAction={runAction}
                request={request}
              />
            ))}
          </div>
        )}
      </details>
      )}

      {isMainAdmin && (
      <details className="details">
        <summary>Final team submissions ({admin.finalSubmissions.length})</summary>
        <div className="card-list" style={{ marginTop: 14 }}>
          {admin.finalSubmissions.map((submission) => (
            <div className="list-card" key={submission.id}>
              <strong>{submission.team.name}</strong>
              <div className="stack">
                {[submission.firstUrl, submission.secondUrl, submission.thirdUrl].map(
                  (url) => (
                    <a href={url} key={url} target="_blank" rel="noreferrer">
                      {url}
                    </a>
                  ),
                )}
              </div>
              <span className="subtle">
                {formatEventTime(submission.submittedAt, config.eventTimezone)}
              </span>
            </div>
          ))}
          {admin.finalSubmissions.length === 0 && (
            <p className="subtle">No final submissions yet.</p>
          )}
        </div>
      </details>
      )}

      {/* Separate Admin and Participant Log Spaces */}
      <details className="details">
        <summary>
          🛡️ Admin &amp; Organizer Activity Log (
          {
            admin.activity.filter(
              (a) =>
                a.participantRole === "ADMIN" ||
                a.participantRole === "MAIN_ADMIN" ||
                a.action.startsWith("CHALLENGE_") ||
                a.action.startsWith("ROUND_") ||
                a.action.startsWith("CONFIG_") ||
                a.action.startsWith("SCORE_") ||
                a.action.startsWith("MEMBER_") ||
                a.action.startsWith("EVIDENCE_") ||
                a.action === "ADMIN_BOOTSTRAP" ||
                a.action === "RULE_REVIEW_DECIDED",
            ).length
          }{" "}
          events)
        </summary>
        <p className="subtle" style={{ marginTop: 8 }}>
          Administrative events performed by organizers: challenge management, round scheduling, score adjustments, evidence uploads, and configuration changes.
        </p>
        <ActivityTable
          emptyMessage="No administrative actions recorded yet."
          entries={admin.activity.filter(
            (a) =>
              a.participantRole === "ADMIN" ||
              a.participantRole === "MAIN_ADMIN" ||
              a.action.startsWith("CHALLENGE_") ||
              a.action.startsWith("ROUND_") ||
              a.action.startsWith("CONFIG_") ||
              a.action.startsWith("SCORE_") ||
              a.action.startsWith("MEMBER_") ||
              a.action.startsWith("EVIDENCE_") ||
              a.action === "ADMIN_BOOTSTRAP" ||
              a.action === "RULE_REVIEW_DECIDED",
          )}
          timeZone={config.eventTimezone}
        />
      </details>

      <details className="details">
        <summary>
          👥 Participant &amp; Team Activity Log
          {selectedTeamName ? ` · ${selectedTeamName}` : ""} (
          {participantLogEntries.length} loaded events)
        </summary>
        <p className="subtle" style={{ marginTop: 8 }}>
          Live participant and team actions: challenge investigations, flag
          submissions, challenge solves, and team updates. Click a team name to
          view its complete history.
        </p>
        <div className="field" style={{ marginTop: 12, maxWidth: 420 }}>
          <label htmlFor="participant-log-team">Filter by team</label>
          <select
            className="select"
            id="participant-log-team"
            onChange={(event) => void loadTeamActivity(event.target.value)}
            value={selectedParticipantLogTeamId}
          >
            <option value="">All teams</option>
            {admin.teams.map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
              </option>
            ))}
          </select>
        </div>
        {teamActivityError && (
          <p className="message error" role="alert">
            {teamActivityError}
          </p>
        )}
        <ActivityTable
          emptyMessage={
            teamActivityLoading
              ? "Loading team activity…"
              : selectedParticipantLogTeamId
                ? "No participant activity is recorded for this team."
                : "No participant activity recorded yet."
          }
          entries={participantLogEntries}
          onTeamClick={(teamId) => void loadTeamActivity(teamId)}
          timeZone={config.eventTimezone}
        />
        {selectedParticipantLogTeamId && teamActivityCursor && (
          <button
            className="btn-secondary"
            disabled={teamActivityLoading}
            onClick={() =>
              void loadTeamActivity(
                selectedParticipantLogTeamId,
                teamActivityCursor,
                true,
              )
            }
            style={{ marginTop: 12 }}
            type="button"
          >
            {teamActivityLoading ? "Loading…" : "Load older activity"}
          </button>
        )}
      </details>
    </section>
  );
}

function ActivityTable({
  entries,
  timeZone,
  emptyMessage,
  onTeamClick,
}: {
  entries: AdminInput["activity"];
  timeZone: string;
  emptyMessage: string;
  onTeamClick?: (teamId: string) => void;
}) {
  if (entries.length === 0) {
    return (
      <p className="subtle" style={{ marginTop: 14 }}>
        {emptyMessage}
      </p>
    );
  }

  return (
    <div className="table-wrap" style={{ marginTop: 14 }}>
      <table className="data-table">
        <thead>
          <tr>
            <th>Timestamp</th>
            <th>Team / User</th>
            <th>Role</th>
            <th>Action</th>
            <th>Target</th>
            <th>Details</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => {
            const team = entry.team;
            return (
              <tr key={entry.id}>
                <td>{formatEventTime(entry.createdAt, timeZone)}</td>
                <td>
                  <strong>{entry.actor?.name ?? "System"}</strong>
                  {team?.name && (
                    <div className="subtle">
                      Team:{" "}
                      {onTeamClick ? (
                        <button
                          className="btn-secondary"
                          onClick={() => onTeamClick(team.id)}
                          style={{ padding: "2px 6px", fontSize: 12 }}
                          type="button"
                        >
                          {team.name}
                        </button>
                      ) : (
                        team.name
                      )}
                    </div>
                  )}
                </td>
                <td>
                  <span
                    className={`badge ${
                      entry.participantRole === "ADMIN" ||
                      entry.participantRole === "MAIN_ADMIN"
                        ? ""
                        : "green"
                    }`}
                  >
                    {entry.participantRole}
                  </span>
                </td>
                <td>
                  <code>{entry.action}</code>
                </td>
                <td>
                  {entry.challenge?.title ??
                    entry.round?.name ??
                    "Competition"}
                </td>
                <td>
                  <pre
                    style={{
                      margin: 0,
                      fontSize: "11px",
                      maxWidth: 320,
                      overflow: "auto",
                    }}
                  >
                    {JSON.stringify(entry.details, null, 2)}
                  </pre>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function RoundControls({
  round,
  timeZone,
  busy,
  request,
  runAction,
}: {
  round: RoundInput;
  timeZone: string;
  busy: boolean;
  request: (
    path: string,
    method: string,
    body?: unknown,
  ) => Promise<Record<string, unknown>>;
  runAction: (action: () => Promise<unknown>) => Promise<void>;
}) {
  const [name, setName] = useState(round.name);
  const [description, setDescription] = useState(round.description);
  const [revealVideoUrl, setRevealVideoUrl] = useState(
    round.revealVideoUrl ?? "",
  );
  const [revealAvailableAt, setRevealAvailableAt] = useState(
    eventTimeInput(round.revealAvailableAt, timeZone),
  );
  const [opensAt, setOpensAt] = useState(
    eventTimeInput(round.opensAt, timeZone),
  );
  const [closesAt, setClosesAt] = useState(
    eventTimeInput(round.closesAt, timeZone),
  );
  const editedTimes = useRef({
    opensAt: false,
    closesAt: false,
    revealAvailableAt: false,
  });
  const previousTimeZone = useRef(timeZone);
  const path = `/api/admin/rounds/${round.id}`;

  useEffect(() => {
    const previous = previousTimeZone.current;
    if (previous === timeZone) return;
    const convert = (
      value: string,
      storedValue: string | null,
      edited: boolean,
    ) => {
      if (!value) return "";
      if (!edited && storedValue) return eventTimeInput(storedValue, timeZone);
      try {
        return eventTimeInput(eventTimeIso(value, previous), timeZone);
      } catch {
        return value;
      }
    };
    setOpensAt((value) =>
      convert(value, round.opensAt, editedTimes.current.opensAt),
    );
    setClosesAt((value) =>
      convert(value, round.closesAt, editedTimes.current.closesAt),
    );
    setRevealAvailableAt((value) =>
      convert(
        value,
        round.revealAvailableAt,
        editedTimes.current.revealAvailableAt,
      ),
    );
    previousTimeZone.current = timeZone;
  }, [round.closesAt, round.opensAt, round.revealAvailableAt, timeZone]);

  async function updateContent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await runAction(() =>
      request(path, "PATCH", {
        action: "content",
        name,
        description,
        revealVideoUrl,
        revealAvailableAt: eventTimeIso(revealAvailableAt, timeZone),
      }),
    );
  }

  async function schedule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await runAction(() =>
      request(path, "PATCH", {
        action: "schedule",
        opensAt: eventTimeIso(opensAt, timeZone),
        closesAt: closesAt ? eventTimeIso(closesAt, timeZone) : "",
      }),
    );
  }

  return (
    <article className="round-card">
      <div className="panel-heading">
        <div>
          <div className="challenge-meta">
            <span className="badge">ROUND {round.number}</span>
            <span className={`badge ${round.enabled ? "green" : "gray"}`}>
              {round.status}
            </span>
          </div>
          <h3>{round.name}</h3>
          <span className="subtle">{round.challenges.length} challenges</span>
        </div>
        <div className="button-row">
          <button
            className="btn"
            disabled={busy || round.status === "OPEN"}
            onClick={() =>
              void runAction(() => request(path, "PATCH", { action: "start" }))
            }
            type="button"
          >
            {round.status === "CLOSED" ? "Reopen round" : "Start now"}
          </button>
          <button
            className="btn-secondary"
            disabled={busy || round.status === "CLOSED"}
            onClick={() =>
              void runAction(() => request(path, "PATCH", { action: "close" }))
            }
            type="button"
          >
            End round
          </button>
        </div>
      </div>
      <form className="form-grid" onSubmit={schedule}>
        <div className="field">
          <label htmlFor={`opens-${round.id}`}>Scheduled start ({timeZone})</label>
          <input
            className="input"
            id={`opens-${round.id}`}
            type="datetime-local"
            value={opensAt}
            onChange={(event) => {
              editedTimes.current.opensAt = true;
              setOpensAt(event.target.value);
            }}
            required
          />
        </div>
        <div className="field">
          <label htmlFor={`closes-${round.id}`}>Scheduled end ({timeZone}, optional)</label>
          <input
            className="input"
            id={`closes-${round.id}`}
            type="datetime-local"
            value={closesAt}
            onChange={(event) => {
              editedTimes.current.closesAt = true;
              setClosesAt(event.target.value);
            }}
          />
        </div>
        <div className="full form-actions">
          <button className="btn-secondary" disabled={busy} type="submit">
            Schedule / postpone
          </button>
        </div>
      </form>
      <details className="details">
        <summary>Round description and reveal video</summary>
        <form className="field-group" onSubmit={updateContent}>
          <div className="field">
            <label htmlFor={`name-${round.id}`}>Stage name</label>
            <input
              className="input"
              id={`name-${round.id}`}
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={120}
            />
          </div>
          <div className="field">
            <label htmlFor={`desc-${round.id}`}>Stage description</label>
            <textarea
              className="textarea"
              id={`desc-${round.id}`}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              maxLength={10000}
            />
          </div>
          <div className="field">
            <label htmlFor={`reveal-${round.id}`}>Reveal video URL</label>
            <input
              className="input"
              id={`reveal-${round.id}`}
              type="url"
              value={revealVideoUrl}
              onChange={(event) => setRevealVideoUrl(event.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor={`reveal-at-${round.id}`}>Reveal release time ({timeZone})</label>
            <input
              className="input"
              id={`reveal-at-${round.id}`}
              type="datetime-local"
              value={revealAvailableAt}
              onChange={(event) => {
                editedTimes.current.revealAvailableAt = true;
                setRevealAvailableAt(event.target.value);
              }}
            />
          </div>
          <button className="btn-secondary" disabled={busy} type="submit">
            Save round content
          </button>
        </form>
      </details>
    </article>
  );
}

function ChallengeEditor({
  challenge,
  roundName,
  roundNumber,
  roundStatus,
  timeZone,
  busy,
  request,
  runAction,
}: {
  challenge: RoundInput["challenges"][number];
  roundName: string;
  roundNumber: number;
  roundStatus: string;
  timeZone: string;
  busy: boolean;
  request: (
    path: string,
    method: string,
    body?: unknown,
  ) => Promise<Record<string, unknown>>;
  runAction: (action: () => Promise<unknown>) => Promise<void>;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [opensAt, setOpensAt] = useState(
    eventTimeInput(challenge.opensAt, timeZone),
  );
  const [closesAt, setClosesAt] = useState(
    eventTimeInput(challenge.closesAt, timeZone),
  );
  const editedTimes = useRef({ opensAt: false, closesAt: false });
  const previousTimeZone = useRef(timeZone);

  useEffect(() => {
    const previous = previousTimeZone.current;
    if (previous === timeZone) return;
    const convert = (
      value: string,
      storedValue: string | null,
      edited: boolean,
    ) => {
      if (!value) return "";
      if (!edited && storedValue) return eventTimeInput(storedValue, timeZone);
      try {
        return eventTimeInput(eventTimeIso(value, previous), timeZone);
      } catch {
        return value;
      }
    };
    setOpensAt((value) =>
      convert(value, challenge.opensAt, editedTimes.current.opensAt),
    );
    setClosesAt((value) =>
      convert(value, challenge.closesAt, editedTimes.current.closesAt),
    );
    previousTimeZone.current = timeZone;
  }, [challenge.closesAt, challenge.opensAt, timeZone]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const hints = String(form.get("hints") ?? "")
      .split(/\r?\n/)
      .map((hint) => hint.trim())
      .filter(Boolean);
    const flag = String(form.get("flag") ?? "");
    await runAction(() =>
      request(`/api/admin/challenges/${challenge.id}`, "PATCH", {
        title: String(form.get("title")),
        description: String(form.get("description")),
        evidenceText: String(form.get("evidenceText")),
        pointValue: Number(form.get("pointValue")),
        hints,
        enabled: form.get("enabled") === "on",
        isFinalMission: form.get("isFinalMission") === "on",
        opensAt: form.get("opensAt")
          ? eventTimeIso(String(form.get("opensAt")), timeZone)
          : "",
        closesAt: form.get("closesAt")
          ? eventTimeIso(String(form.get("closesAt")), timeZone)
          : "",
        ...(flag ? { flag } : {}),
      }),
    );
  }

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData();
    form.set("challengeId", challenge.id);
    if (file) form.set("file", file);
    await runAction(() => request("/api/admin/evidence", "POST", form));
    setFile(null);
    formElement.reset();
  }

  async function restartChallenge() {
    await runAction(() =>
      request(`/api/admin/challenges/${challenge.id}/restart`, "POST"),
    );
  }

  async function deleteChallenge() {
    if (
      !window.confirm(
        `Are you sure you want to permanently delete challenge "${challenge.title}"? This cannot be undone.`,
      )
    ) {
      return;
    }
    await runAction(() =>
      request(`/api/admin/challenges/${challenge.id}`, "DELETE"),
    );
  }

  return (
    <details className="list-card">
      <summary>
        {challenge.title} · {roundName} · {challenge.pointValue} points
        {challenge.enabled ? " · published" : " · unpublished"}
      </summary>
      {[2, 3].includes(roundNumber) && (
        <p className="subtle" style={{ marginTop: 12 }}>
          Restarting immediately publishes this challenge and clears its
          challenge-level open and close times. The parent round must still
          be open; round scheduling and round closures remain in effect.
        </p>
      )}
      <div className="button-row" style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
        {[2, 3].includes(roundNumber) && (
          <button
            className="btn-secondary"
            disabled={busy || !["OPEN", "SCHEDULED"].includes(roundStatus)}
            onClick={() => void restartChallenge()}
            type="button"
          >
            Restart challenge now (admin override)
          </button>
        )}
        <button
          className="btn-danger"
          disabled={busy}
          onClick={() => void deleteChallenge()}
          type="button"
        >
          Delete challenge
        </button>
      </div>
      <form className="form-grid" onSubmit={save} style={{ marginTop: 12 }}>
        <div className="field">
          <label htmlFor={`edit-title-${challenge.id}`}>Challenge title</label>
          <input
            className="input"
            id={`edit-title-${challenge.id}`}
            name="title"
            defaultValue={challenge.title}
            maxLength={120}
            required
          />
        </div>
        <div className="field">
          <label htmlFor={`edit-points-${challenge.id}`}>Point value</label>
          <input
            className="input"
            id={`edit-points-${challenge.id}`}
            name="pointValue"
            type="number"
            min={1}
            max={100000}
            defaultValue={challenge.pointValue}
            required
          />
        </div>
        <div className="field">
          <label htmlFor={`edit-opens-${challenge.id}`}>
            Opens ({timeZone}, optional)
          </label>
          <input
            className="input"
            id={`edit-opens-${challenge.id}`}
            name="opensAt"
            type="datetime-local"
            value={opensAt}
            onChange={(event) => {
              editedTimes.current.opensAt = true;
              setOpensAt(event.target.value);
            }}
          />
        </div>
        <div className="field">
          <label htmlFor={`edit-closes-${challenge.id}`}>
            Closes ({timeZone}, optional)
          </label>
          <input
            className="input"
            id={`edit-closes-${challenge.id}`}
            name="closesAt"
            type="datetime-local"
            value={closesAt}
            onChange={(event) => {
              editedTimes.current.closesAt = true;
              setClosesAt(event.target.value);
            }}
          />
        </div>
        <div className="field full">
          <label htmlFor={`edit-description-${challenge.id}`}>Description</label>
          <textarea
            className="textarea"
            id={`edit-description-${challenge.id}`}
            name="description"
            defaultValue={challenge.description}
            maxLength={10000}
          />
        </div>
        <div className="field full">
          <label htmlFor={`edit-evidence-${challenge.id}`}>Evidence text</label>
          <textarea
            className="textarea"
            id={`edit-evidence-${challenge.id}`}
            name="evidenceText"
            defaultValue={challenge.evidenceText}
            maxLength={20000}
          />
        </div>
        <div className="field">
          <label htmlFor={`edit-hints-${challenge.id}`}>Hints (one per line)</label>
          <textarea
            className="textarea"
            id={`edit-hints-${challenge.id}`}
            name="hints"
            defaultValue={challenge.hints.join("\n")}
          />
        </div>
        <div className="field">
          <label htmlFor={`edit-flag-${challenge.id}`}>
            Replace correct flag (leave blank to keep current)
          </label>
          <input
            className="input"
            id={`edit-flag-${challenge.id}`}
            name="flag"
            type="password"
            autoComplete="new-password"
          />
        </div>
        <label className="field">
          <span>Publication</span>
          <span className="inline-form">
            <input
              defaultChecked={challenge.enabled}
              name="enabled"
              type="checkbox"
            />
            Publish to teams when the round is open
          </span>
        </label>
        <label className="field">
          <span>Mission completion</span>
          <span className="inline-form">
            <input
              defaultChecked={challenge.isFinalMission}
              name="isFinalMission"
              type="checkbox"
            />
            This is the final mission
          </span>
        </label>
        <div className="full form-actions" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <button className="btn-secondary" disabled={busy} type="submit">
            Save challenge settings
          </button>
          <button
            className="btn-danger"
            disabled={busy}
            onClick={() => void deleteChallenge()}
            type="button"
          >
            Delete challenge
          </button>
        </div>
      </form>
      <div className="stack" style={{ marginTop: 14 }}>
        <strong>Protected evidence files</strong>
        {challenge.files.map((item) => (
          <span className="subtle" key={item.id}>
            {item.fileName} · {Math.ceil(item.byteLength / 1024)} KB
          </span>
        ))}
        <form className="inline-form" onSubmit={upload}>
          <input
            className="input"
            type="file"
            accept=".txt,.csv,.pdf,.jpg,.jpeg,.png,.gif"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            required
          />
          <button className="btn-secondary" disabled={busy || !file} type="submit">
            Add evidence file
          </button>
        </form>
      </div>
    </details>
  );
}

function ReviewCard({
  review,
  busy,
  runAction,
  request,
}: {
  review: AdminInput["reviews"][number];
  busy: boolean;
  runAction: (action: () => Promise<unknown>) => Promise<void>;
  request: (
    path: string,
    method: string,
    body?: unknown,
  ) => Promise<Record<string, unknown>>;
}) {
  const [status, setStatus] = useState(review.status);
  const [decision, setDecision] = useState(review.decision ?? "");

  return (
    <div className="list-card">
      <div className="panel-heading">
        <div>
          <strong>{review.team.name} · {review.concern}</strong>
          <div className="subtle">
            Opened by {review.createdBy.name} ·{" "}
            {formatEventTime(review.createdAt, EVENT_TIME_ZONE)} IST
          </div>
        </div>
        <span className="badge gray">{review.status}</span>
      </div>
      <p>{review.evidence}</p>
      <form
        className="form-grid"
        onSubmit={(event) => {
          event.preventDefault();
          void runAction(() =>
            request(`/api/admin/reviews/${review.id}`, "PATCH", {
              status,
              decision,
            }),
          );
        }}
      >
        <div className="field">
          <label htmlFor={`review-status-${review.id}`}>Review status</label>
          <select
            className="select"
            id={`review-status-${review.id}`}
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            <option value="OPEN">Open</option>
            <option value="REVIEWED">Reviewed</option>
            <option value="CLOSED">Closed</option>
          </select>
        </div>
        <div className="field full">
          <label htmlFor={`review-decision-${review.id}`}>
            Documented decision
          </label>
          <textarea
            className="textarea"
            id={`review-decision-${review.id}`}
            value={decision}
            onChange={(event) => setDecision(event.target.value)}
            minLength={3}
            maxLength={5000}
            required
          />
        </div>
        <div className="full">
          <button className="btn-secondary" disabled={busy} type="submit">
            Save review outcome
          </button>
        </div>
      </form>
    </div>
  );
}
