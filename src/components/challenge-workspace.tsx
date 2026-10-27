"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { CompetitionNavigation } from "@/components/competition-navigation";
import { EVENT_TIME_ZONE, formatEventTime } from "@/lib/time";

type OpenChallenge = {
  challenge: {
    id: string;
    title: string;
    description: string;
    evidenceText: string;
    hints: string[];
    pointValue: number;
    isFinalMission: boolean;
    files: { id: string; fileName: string; byteLength: number }[];
  };
  firstOpenedAt: string;
  elapsedSeconds: number;
};

type WriteupState = {
  solved: boolean;
  solvedByName?: string | null;
  solveElapsedSeconds?: number | null;
  writeup: { content: string; updatedAt: string } | null;
};

type ChallengeSolveItem = {
  teamName: string;
  solverName: string;
  solverEmail: string;
  pointsAwarded: number;
  solvedAt: string;
  openedAt: string | null;
  elapsedSeconds: number | null;
  incorrectAttempts: number;
};

type ChallengeHistoryData = {
  totalSolved: number;
  totalIncorrectAttempts: number;
  solves: ChallengeSolveItem[];
  writeups: {
    teamName: string;
    participantName: string;
    participantEmail: string;
    content: string;
    updatedAt: string;
  }[];
};

export function ChallengeWorkspace({
  challengeId,
  userName,
  teamName,
  role,
  canViewClue,
}: {
  challengeId: string;
  userName: string;
  teamName: string;
  role: string;
  canViewClue: boolean;
}) {
  const isAdmin = role === "ADMIN" || role === "MAIN_ADMIN";
  const [challenge, setChallenge] = useState<OpenChallenge | null>(null);
  const [writeupState, setWriteupState] = useState<WriteupState | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [flag, setFlag] = useState("");
  const [writeup, setWriteup] = useState("");
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [clue, setClue] = useState<string | null>(null);
  const [clueLoading, setClueLoading] = useState(false);
  const [clueError, setClueError] = useState("");
  const [history, setHistory] = useState<ChallengeHistoryData | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [historyError, setHistoryError] = useState("");

  async function toggleHistory() {
    if (showHistory) {
      setShowHistory(false);
      return;
    }
    setShowHistory(true);
    if (!history) {
      setHistoryLoading(true);
      setHistoryError("");
      try {
        const response = await fetch(`/api/admin/challenges/${challengeId}/results`, {
          cache: "no-store",
        });
        const body = (await response.json()) as ChallengeHistoryData & {
          error?: string;
        };
        if (!response.ok) {
          throw new Error(body.error ?? "Solver history could not be loaded.");
        }
        setHistory(body);
      } catch (reason) {
        setHistoryError(
          reason instanceof Error ? reason.message : "Solver history could not be loaded.",
        );
      } finally {
        setHistoryLoading(false);
      }
    }
  }

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const response = await fetch(`/api/challenges/${challengeId}/open`, {
          method: "POST",
        });
        const result = (await response.json()) as OpenChallenge & {
          error?: string;
        };
        if (!response.ok) {
          throw new Error(result.error ?? "Challenge is unavailable.");
        }
        if (!active) return;
        setChallenge(result);
        setElapsed(result.elapsedSeconds);

        if (canViewClue) {
          setWriteupState({ solved: false, writeup: null });
        } else {
          const writeupResponse = await fetch(
            `/api/challenges/${challengeId}/writeup`,
            { cache: "no-store" },
          );
          const writeupResult = (await writeupResponse.json()) as WriteupState & {
            error?: string;
          };
          if (!writeupResponse.ok) {
            throw new Error(writeupResult.error ?? "Writeup status could not be loaded.");
          }
          if (!active) return;
          setWriteupState(writeupResult);
          setWriteup(writeupResult.writeup?.content ?? "");
        }
      } catch (reason) {
        if (!active) return;
        setIsError(true);
        setMessage(
          reason instanceof Error ? reason.message : "Challenge is unavailable.",
        );
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, [challengeId, canViewClue]);

  useEffect(() => {
    if (!challenge || writeupState?.solved) return;
    const timer = window.setInterval(() => {
      setElapsed((seconds) => seconds + 1);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [challenge, writeupState?.solved]);

  async function submitFlag(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!challenge) return;
    setBusy(true);
    setIsError(false);
    setMessage("");
    try {
      const response = await fetch(`/api/challenges/${challengeId}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ flag }),
      });
      const result = (await response.json()) as {
        alreadySolved?: boolean;
        adminPracticeSolve?: boolean;
        pointsAwarded?: number;
        solvedByName?: string;
        error?: string;
      };
      if (!response.ok) {
        throw new Error(result.error ?? "Flag submission failed.");
      }
      setMessage(
        result.adminPracticeSolve
          ? "Correct flag. Main-admin practice solve recorded; no team points were awarded."
          : `Correct flag! Challenge completed by ${result.solvedByName || userName}. ${result.pointsAwarded ?? 0} points awarded to your team.`,
      );
      setFlag("");
      if (result.adminPracticeSolve) return;
      const writeupResponse = await fetch(
        `/api/challenges/${challengeId}/writeup`,
        { cache: "no-store" },
      );
      const writeupResult = (await writeupResponse.json()) as WriteupState & {
        error?: string;
      };
      if (!writeupResponse.ok) {
        throw new Error(writeupResult.error ?? "Writeup status could not be loaded.");
      }
      setWriteupState(writeupResult);
      setWriteup(writeupResult.writeup?.content ?? "");
    } catch (reason) {
      setIsError(true);
      setMessage(
        reason instanceof Error ? reason.message : "Flag submission failed.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function submitWriteup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setIsError(false);
    setMessage("");
    try {
      const response = await fetch(`/api/challenges/${challengeId}/writeup`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: writeup }),
      });
      const result = (await response.json()) as {
        writeup?: WriteupState["writeup"];
        error?: string;
      };
      if (!response.ok) {
        throw new Error(result.error ?? "Writeup could not be saved.");
      }
      setWriteupState((current) =>
        current ? { ...current, solved: true, writeup: result.writeup ?? null } : current,
      );
      setMessage("Writeup saved.");
    } catch (reason) {
      setIsError(true);
      setMessage(
        reason instanceof Error ? reason.message : "Writeup could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function toggleClue() {
    if (clue !== null) {
      setClue(null);
      setClueError("");
      return;
    }

    setClueLoading(true);
    setClueError("");
    try {
      const response = await fetch(
        `/api/admin/challenges/${challengeId}/answer`,
        { cache: "no-store" },
      );
      const result = (await response.json()) as {
        answer?: string | null;
        error?: string;
      };
      if (!response.ok) {
        throw new Error(result.error ?? "Clue could not be loaded.");
      }
      setClue(result.answer ?? "");
    } catch (reason) {
      setClueError(
        reason instanceof Error ? reason.message : "Clue could not be loaded.",
      );
    } finally {
      setClueLoading(false);
    }
  }

  return (
    <div className="shell app-layout">
      <CompetitionNavigation
        activePage="challenges"
        userName={userName}
        teamName={teamName}
        role={role}
      />
      <main className="main-content">
        <div className="challenge-page">
          <Link className="btn-secondary" href="/challenges">
            Back to challenges
          </Link>
          {loading && (
            <section className="panel" role="status">
              COMPILING REALITY......99%
            </section>
          )}
          {message && (
            <p className={`message${isError ? " error" : ""}`} role="status">
              {message}
            </p>
          )}
          {challenge && (
            <>
              <section className="panel">
                <div className="panel-heading">
                  <div>
                    <div className="eyebrow">Shared team challenge</div>
                    <h1>{challenge.challenge.title}</h1>
                  </div>
                  {writeupState?.solved ? (
                    <span className="badge green" title={writeupState.solvedByName ? `Completed by ${writeupState.solvedByName}` : "Completed"}>
                      ✓ Completed{writeupState.solvedByName ? ` by ${writeupState.solvedByName}` : ""}
                      {typeof writeupState.solveElapsedSeconds === "number" &&
                        ` · ⏱ ${Math.floor(writeupState.solveElapsedSeconds / 60)}m ${
                          writeupState.solveElapsedSeconds % 60
                        }s`}
                    </span>
                  ) : (
                    <span className="badge">
                      {Math.floor(elapsed / 60)
                        .toString()
                        .padStart(2, "0")}
                      :{(elapsed % 60).toString().padStart(2, "0")} elapsed
                    </span>
                  )}
                </div>
                {writeupState?.solved && (
                  <div
                    style={{
                      marginTop: 12,
                      padding: "10px 14px",
                      borderRadius: "var(--radius, 6px)",
                      backgroundColor: "rgba(16, 185, 129, 0.12)",
                      border: "1px solid rgba(16, 185, 129, 0.35)",
                      fontSize: 14,
                    }}
                  >
                    ✓ <strong>Completed by {writeupState.solvedByName || "a team member"}</strong>
                    {typeof writeupState.solveElapsedSeconds === "number" && (
                      <> in <strong>{Math.floor(writeupState.solveElapsedSeconds / 60)}m {writeupState.solveElapsedSeconds % 60}s</strong></>
                    )}
                    . This challenge has been solved for your team and cannot be solved again.
                  </div>
                )}
                <p>{challenge.challenge.description}</p>
                <div className="challenge-meta">
                  <span>{challenge.challenge.pointValue} points</span>
                  {challenge.challenge.isFinalMission && (
                    <span className="badge">FINAL MISSION</span>
                  )}
                </div>
                {isAdmin && (
                  <div style={{ marginTop: 16, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                    {canViewClue && (
                      <button
                        className="btn-secondary"
                        disabled={clueLoading}
                        onClick={() => void toggleClue()}
                        type="button"
                      >
                        {clueLoading
                          ? "Loading clue..."
                          : clue === null
                            ? "🔑 View Clue (Answer Key)"
                            : "Hide clue"}
                      </button>
                    )}
                    <button
                      className="btn-secondary"
                      disabled={historyLoading}
                      onClick={() => void toggleHistory()}
                      type="button"
                    >
                      {historyLoading
                        ? "Loading history…"
                        : showHistory
                          ? "Hide solver history"
                          : `📊 Solvers & History (${history?.totalSolved ?? "..."})`}
                    </button>
                  </div>
                )}
                {canViewClue && clueError && (
                  <p className="message error" role="alert" style={{ marginTop: 8 }}>
                    {clueError}
                  </p>
                )}
                {canViewClue && clue !== null && (
                  <div className="field" style={{ marginTop: 12 }}>
                    <span className="label">Answer key · main admins only</span>
                    {clue ? (
                      <code className="answer-key-value">{clue}</code>
                    ) : (
                      <span className="message">
                        This challenge has no recoverable answer key.
                      </span>
                    )}
                  </div>
                )}
                {historyError && (
                  <p className="message error" role="alert" style={{ marginTop: 8 }}>
                    {historyError}
                  </p>
                )}
                {showHistory && history && (
                  <section
                    className="panel"
                    style={{
                      marginTop: 16,
                      backgroundColor: "rgba(255, 255, 255, 0.02)",
                      borderColor: "var(--border, rgba(255, 255, 255, 0.15))",
                    }}
                  >
                    <div className="eyebrow">Administrator-only solve history</div>
                    <h3 style={{ margin: "8px 0 12px" }}>
                      {history.totalSolved} teams solved · {history.totalIncorrectAttempts} incorrect attempts
                    </h3>
                    {history.solves.length > 0 ? (
                      <div className="table-wrap">
                        <table className="data-table">
                          <thead>
                            <tr>
                              <th>Team</th>
                              <th>Solver</th>
                              <th>Points</th>
                              <th>Time taken to solve</th>
                              <th>Incorrect attempts</th>
                              <th>Solved at (IST)</th>
                            </tr>
                          </thead>
                          <tbody>
                            {history.solves.map((solve) => (
                              <tr key={`${solve.teamName}-${solve.solvedAt}`}>
                                <td><strong>{solve.teamName}</strong></td>
                                <td>
                                  {solve.solverName}
                                  <span className="subtle" style={{ display: "block", fontSize: 11 }}>
                                    {solve.solverEmail}
                                  </span>
                                </td>
                                <td>{solve.pointsAwarded}</td>
                                <td>
                                  <span className="badge">
                                    {solve.elapsedSeconds === null
                                      ? "Timer unavailable"
                                      : `⏱ ${Math.floor(solve.elapsedSeconds / 60)}m ${
                                          solve.elapsedSeconds % 60
                                        }s`}
                                  </span>
                                </td>
                                <td>{solve.incorrectAttempts}</td>
                                <td style={{ whiteSpace: "nowrap" }}>
                                  {formatEventTime(solve.solvedAt, EVENT_TIME_ZONE)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <p className="subtle">No team has solved this challenge yet.</p>
                    )}
                    {history.writeups.length > 0 && (
                      <div style={{ marginTop: 16 }}>
                        <h4>Participant writeups ({history.writeups.length})</h4>
                        <div className="card-list" style={{ marginTop: 8 }}>
                          {history.writeups.map((w, idx) => (
                            <article className="link-card" key={`${w.participantEmail}-${idx}`}>
                              <div>
                                <strong>{w.teamName} · {w.participantName}</strong>
                                <span className="subtle" style={{ display: "block" }}>
                                  {w.participantEmail} · Updated {formatEventTime(w.updatedAt, EVENT_TIME_ZONE)} IST
                                </span>
                              </div>
                              <pre className="evidence-text" style={{ marginTop: 8 }}>{w.content}</pre>
                            </article>
                          ))}
                        </div>
                      </div>
                    )}
                  </section>
                )}
              </section>
              {challenge.challenge.evidenceText && (
                <section className="panel">
                  <h2>Challenge details</h2>
                  <pre className="evidence-text">
                    {challenge.challenge.evidenceText}
                  </pre>
                </section>
              )}
              {challenge.challenge.files.length > 0 && (
                <section className="panel">
                  <h2>Evidence files</h2>
                  <div className="card-list">
                    {challenge.challenge.files.map((file) => (
                      <a
                        href={`/api/evidence/${file.id}`}
                        key={file.id}
                        rel="noreferrer"
                        target="_blank"
                      >
                        {file.fileName} · {Math.ceil(file.byteLength / 1024)} KB
                      </a>
                    ))}
                  </div>
                </section>
              )}
              {challenge.challenge.hints.length > 0 && (
                <section className="panel">
                  <details className="details">
                    <summary>Available hints</summary>
                    <ol>
                      {challenge.challenge.hints.map((hint, index) => (
                        <li key={`${index}-${hint}`}>{hint}</li>
                      ))}
                    </ol>
                  </details>
                </section>
              )}
              {!writeupState?.solved && (
                <section className="panel">
                  <form className="form-grid" onSubmit={submitFlag}>
                    <div className="field full">
                      <label htmlFor="challenge-flag">Submit challenge flag</label>
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
              {writeupState?.solved && (
                <section className="panel">
                  <h2>Challenge writeup</h2>
                  <p className="subtle">
                    Record your approach after your team solves this challenge.
                    Only you and the organizers can view your writeup.
                  </p>
                  <form className="form-grid" onSubmit={submitWriteup}>
                    <div className="field full">
                      <label htmlFor="challenge-writeup">Your writeup</label>
                      <textarea
                        className="textarea"
                        id="challenge-writeup"
                        value={writeup}
                        onChange={(event) => setWriteup(event.target.value)}
                        maxLength={10000}
                        minLength={1}
                        required
                      />
                    </div>
                    <button className="btn" disabled={busy} type="submit">
                      Save writeup
                    </button>
                  </form>
                </section>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
