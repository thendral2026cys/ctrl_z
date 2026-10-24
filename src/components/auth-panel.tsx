"use client";

import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { authClient } from "@/lib/auth-client";

type PublicContent = {
  promoOneUrl: string | null;
  promoTwoUrl: string | null;
  externalContestUrl: string | null;
  aiPolicy: string;
};

const signalStates = [
  "Awaiting investigator",
  "Evidence channel ready",
  "Team link standing by",
];

export function AuthPanel({ googleConfigured }: { googleConfigured: boolean }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);
  const [signalState, setSignalState] = useState(signalStates[0]);
  const [publicContent, setPublicContent] = useState<PublicContent | null>(null);
  const [publicError, setPublicError] = useState("");

  useEffect(() => {
    let mounted = true;
    fetch("/api/public", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Public event content is unavailable.");
        }
        const content = (await response.json()) as PublicContent;
        if (mounted) setPublicContent(content);
      })
      .catch((reason: unknown) => {
        if (mounted) {
          setPublicError(
            reason instanceof Error
              ? reason.message
              : "Public event content is unavailable.",
          );
        }
      });

    let stateIndex = 0;
    const interval = window.setInterval(() => {
      stateIndex = (stateIndex + 1) % signalStates.length;
      setSignalState(signalStates[stateIndex]);
    }, 3600);

    return () => {
      mounted = false;
      window.clearInterval(interval);
    };
  }, []);

  async function continueWithGoogle() {
    if (!googleConfigured || busy) return;
    setBusy(true);
    setMessage("");
    setError(false);

    try {
      const result = await authClient.signIn.social({
        provider: "google",
        callbackURL: "/",
      });
      if (result.error) {
        throw new Error(result.error.message ?? "Google sign-in could not start.");
      }
    } catch (reason) {
      setError(true);
      setMessage(
        reason instanceof Error
          ? reason.message
          : "Google sign-in could not start. Please try again.",
      );
      setBusy(false);
    }
  }

  return (
    <main className="auth-layout">
      <div className="auth-backdrop" aria-hidden="true">
        <span className="auth-orb auth-orb-one" />
        <span className="auth-orb auth-orb-two" />
        <span className="auth-grid" />
      </div>

      <div className="auth-shell">
        <header className="auth-topbar">
          <a className="brand" href="#entry">
            <span className="brand-mark">V</span>
            <span>VIPERWOLF</span>
          </a>
          <span className="connection-status">
            <span className="status-dot" />
            SECURE ENTRY
          </span>
        </header>

        <section className="auth-hero" id="entry">
          <div className="auth-copy">
            <div className="eyebrow">
              <span className="eyebrow-mark" />
              Story-driven cyber investigation
            </div>
            <h1 className="auth-title">
              The signal is
              <br />
              <span>waiting for you.</span>
            </h1>
            <p className="auth-description">
              Follow the evidence. Connect the clues with your team. Restore
              the story—one discovery at a time.
            </p>

            <div className="auth-steps" aria-label="Competition journey">
              <article className="auth-step">
                <span className="step-index">01</span>
                <span className="step-copy">
                  <strong>Investigate</strong>
                  <span>Explore the evidence</span>
                </span>
              </article>
              <span className="step-connector" aria-hidden="true" />
              <article className="auth-step">
                <span className="step-index">02</span>
                <span className="step-copy">
                  <strong>Collaborate</strong>
                  <span>Work as a team</span>
                </span>
              </article>
              <span className="step-connector" aria-hidden="true" />
              <article className="auth-step">
                <span className="step-index">03</span>
                <span className="step-copy">
                  <strong>Restore</strong>
                  <span>Complete the story</span>
                </span>
              </article>
            </div>

            <div className="auth-entry-card">
              <div className="auth-entry-heading">
                <div>
                  <div className="eyebrow">Investigator access</div>
                  <h2>Sign in securely</h2>
                </div>
                <span className="auth-lock" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none">
                    <path
                      d="M7.5 10V7a4.5 4.5 0 0 1 9 0v3m-10.25 0h11.5A1.25 1.25 0 0 1 19 11.25v8.5A1.25 1.25 0 0 1 17.75 21h-11.5A1.25 1.25 0 0 1 5 19.75v-8.5A1.25 1.25 0 0 1 6.25 10Z"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                    />
                    <circle cx="12" cy="15" r="1.2" fill="currentColor" />
                  </svg>
                </span>
              </div>
              <p className="entry-hint">
                Your Google account is used to verify your identity. No
                password is stored here.
              </p>
              <button
                className="google-button"
                disabled={!googleConfigured || busy}
                onClick={continueWithGoogle}
                type="button"
              >
                <span className="google-g" aria-hidden="true">
                  G
                </span>
                <span>{busy ? "Connecting to Google…" : "Continue with Google"}</span>
                {!busy && (
                  <svg
                    className="google-arrow"
                    viewBox="0 0 20 20"
                    fill="none"
                    aria-hidden="true"
                  >
                    <path
                      d="M4 10h12m-5-5 5 5-5 5"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
              </button>

              {!googleConfigured && (
                <div className="oauth-notice" role="status">
                  <span className="notice-mark" aria-hidden="true">
                    !
                  </span>
                  <span>
                    Google sign-in is not configured yet. Add
                    <code> GOOGLE_CLIENT_ID</code> and
                    <code> GOOGLE_CLIENT_SECRET</code> to your environment to
                    enable access.
                  </span>
                </div>
              )}
              {message && (
                <p className={`message${error ? " error" : ""}`} role="alert">
                  {message}
                </p>
              )}
              <div className="auth-assurance">
                <span>ENCRYPTED AUTHENTICATION</span>
                <span aria-hidden="true">·</span>
                <span>GOOGLE OAUTH 2.0</span>
              </div>
            </div>
          </div>

          <aside className="signal-panel" aria-label="Investigation signal">
            <div className="signal-panel-top">
              <span className="signal-label">SIGNAL MONITOR</span>
              <span className="signal-live">
                <span className="status-dot" />
                LIVE
              </span>
            </div>
            <div className="signal-radar" aria-hidden="true">
              <div className="radar-ring radar-ring-outer" />
              <div className="radar-ring radar-ring-middle" />
              <div className="radar-ring radar-ring-inner" />
              <div className="radar-sweep" />
              <span className="radar-point radar-point-one" />
              <span className="radar-point radar-point-two" />
              <span className="radar-point radar-point-three" />
              <span className="radar-center" />
            </div>
            <div className="signal-status">
              <span className="signal-status-key">SYSTEM STATUS</span>
              <span className="signal-status-value">
                <span className="status-dot" />
                {signalState}
              </span>
            </div>
            <div className="signal-wave" aria-hidden="true">
              {Array.from({ length: 42 }, (_, index) => (
                <span
                  key={index}
                  style={
                    {
                      "--bar-index": index,
                      "--bar-height": `${28 + ((index * 17) % 68)}%`,
                      "--bar-delay": `${((index * 37) % 600) / 1000}s`,
                    } as CSSProperties
                  }
                />
              ))}
            </div>
            <div className="signal-log">
              <span className="signal-log-prefix">&gt;</span>
              <span>Competition channel established</span>
              <span className="signal-caret" />
            </div>
            <div className="signal-panel-footer">
              <span>FREQUENCY</span>
              <span>SECURE / TEAM-BASED</span>
            </div>
          </aside>
        </section>

        <section className="auth-info-grid" aria-label="Event information">
          <article className="auth-info-card">
            <span className="info-card-index">01 / RULES</span>
            <h2>Play within the story</h2>
            {publicContent?.aiPolicy.trim() ? (
              <p className="policy-snippet">{publicContent.aiPolicy}</p>
            ) : (
              <p>
                {publicError
                  ? "Event information will be available when the event service is connected."
                  : "The organizer's official AI-use policy will appear here."}
              </p>
            )}
          </article>
          <article className="auth-info-card auth-links-card">
            <span className="info-card-index">02 / BRIEFING</span>
            <h2>Event links</h2>
            <div className="auth-link-list">
              {publicContent?.promoOneUrl && (
                <a href={publicContent.promoOneUrl} target="_blank" rel="noreferrer">
                  <span>Promotional video 01</span>
                  <span aria-hidden="true">↗</span>
                </a>
              )}
              {publicContent?.promoTwoUrl && (
                <a href={publicContent.promoTwoUrl} target="_blank" rel="noreferrer">
                  <span>Promotional video 02</span>
                  <span aria-hidden="true">↗</span>
                </a>
              )}
              {publicContent?.externalContestUrl && (
                <a href={publicContent.externalContestUrl} target="_blank" rel="noreferrer">
                  <span>External contest</span>
                  <span aria-hidden="true">↗</span>
                </a>
              )}
              {!publicContent?.promoOneUrl &&
                !publicContent?.promoTwoUrl &&
                !publicContent?.externalContestUrl && (
                  <p className="empty-links">
                    Event links will appear here when published.
                  </p>
                )}
            </div>
          </article>
        </section>

        <footer className="auth-footer">
          <span>VIPERWOLF</span>
          <span>Authorized fictional competition environment</span>
          <span>No real device or account access</span>
        </footer>
      </div>
    </main>
  );
}
