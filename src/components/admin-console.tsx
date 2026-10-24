"use client";

import { FormEvent, useState } from "react";
import { eventTimeInput, eventTimeIso, formatEventTime } from "@/lib/time";

type RoundInput = {
  id: string;
  number: number;
  name: string;
  description: string;
  status: string;
  enabled: boolean;
  opensAt: string | null;
  closesAt: string | null;
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
  config: ConfigInput;
};

export function AdminConsole({
  admin,
  rounds,
  onUpdated,
}: {
  admin: AdminInput;
  rounds: RoundInput[];
  onUpdated: () => void;
}) {
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [latestChallengeId, setLatestChallengeId] = useState("");
  const [config, setConfig] = useState<ConfigInput>(admin.config);
  const [climaxTimeInput, setClimaxTimeInput] = useState(
    eventTimeInput(admin.config.climaxAvailableAt, admin.config.eventTimezone),
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
    const result = (await response.json()) as Record<string, unknown> & {
      error?: string;
    };
    if (!response.ok) {
      throw new Error(result.error ?? "The organizer action failed.");
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

  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <div className="eyebrow">Organizer workspace</div>
          <h2>Event controls and audit</h2>
        </div>
        <span className="badge">ADMIN</span>
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
            <label htmlFor="eventTimezone">Event timezone (IANA)</label>
            <input
              className="input"
              id="eventTimezone"
              value={config.eventTimezone}
              onChange={(event) =>
                setConfig({ ...config, eventTimezone: event.target.value })
              }
              placeholder="Asia/Kolkata"
              required
            />
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
            <label htmlFor="climaxAvailableAt">Climax availability (your local time)</label>
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
            <button className="btn" disabled={busy} type="submit">
              Save event configuration
            </button>
          </div>
        </form>
      </details>

      <details className="details">
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

      <details className="details">
        <summary>Create challenges and add protected evidence files</summary>
        <form className="form-grid" onSubmit={createChallenge} style={{ marginTop: 14 }}>
          <div className="field">
            <label htmlFor="challenge-round">Round</label>
            <select className="select" id="challenge-round" name="roundId" required>
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
          <div className="full form-actions">
            <button className="btn" disabled={busy} type="submit">
              Save challenge (disabled until published)
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
                timeZone={config.eventTimezone}
                busy={busy}
                request={request}
                runAction={runAction}
              />
            )),
          )}
        </div>
      </details>

      <details className="details">
        <summary>Manual team score adjustment</summary>
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
                  {!member.removedAt && (
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

      <details className="details">
        <summary>Append-only activity history</summary>
        <div className="table-wrap" style={{ marginTop: 14 }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Team / participant</th>
                <th>Role</th>
                <th>Activity</th>
                <th>Challenge or event</th>
                <th>Points / details</th>
              </tr>
            </thead>
            <tbody>
              {admin.activity.map((entry) => (
                <tr key={entry.id}>
                  <td>
                    {formatEventTime(entry.createdAt, config.eventTimezone)}
                  </td>
                  <td>
                    {entry.team?.name ?? "—"}
                    <br />
                    {entry.actor?.name ?? "System"}
                  </td>
                  <td>{entry.participantRole}</td>
                  <td>{entry.action}</td>
                  <td>
                    {entry.challenge?.title ??
                      entry.round?.name ??
                      "Competition"}
                  </td>
                  <td>
                    <code>{JSON.stringify(entry.details)}</code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {admin.activity.length === 0 && (
            <p className="subtle">No recorded activity yet.</p>
          )}
        </div>
      </details>
    </section>
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
  const [revealAvailableAt, setRevealAvailableAt] = useState("");
  const [opensAt, setOpensAt] = useState(
    eventTimeInput(round.opensAt, timeZone),
  );
  const [closesAt, setClosesAt] = useState(
    eventTimeInput(round.closesAt, timeZone),
  );
  const path = `/api/admin/rounds/${round.id}`;

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
            disabled={busy || round.status === "CLOSED"}
            onClick={() =>
              void runAction(() => request(path, "PATCH", { action: "start" }))
            }
            type="button"
          >
            Start now
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
            onChange={(event) => setOpensAt(event.target.value)}
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
            onChange={(event) => setClosesAt(event.target.value)}
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
              onChange={(event) => setRevealAvailableAt(event.target.value)}
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
  timeZone,
  busy,
  request,
  runAction,
}: {
  challenge: RoundInput["challenges"][number];
  roundName: string;
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

  return (
    <details className="list-card">
      <summary>
        {challenge.title} · {roundName} · {challenge.pointValue} points
        {challenge.enabled ? " · published" : " · unpublished"}
      </summary>
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
            defaultValue={eventTimeInput(challenge.opensAt, timeZone)}
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
            defaultValue={eventTimeInput(challenge.closesAt, timeZone)}
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
        <div className="full form-actions">
          <button className="btn-secondary" disabled={busy} type="submit">
            Save challenge settings
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
            {new Date(review.createdAt).toLocaleString()}
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
