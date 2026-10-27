"use client";

import { FormEvent, useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { BrandEmblem } from "@/components/brand-emblem";
import { authClient } from "@/lib/auth-client";

const signalStates = [
  "Awaiting investigator",
  "Evidence channel ready",
  "Team link standing by",
];

export function AuthPanel({ googleConfigured }: { googleConfigured: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [manualBusy, setManualBusy] = useState(false);
  const [message, setMessage] = useState(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const urlError = params.get("error") || params.get("error_description");
      if (urlError) return urlError.replace(/_/g, " ");
    }
    return "";
  });
  const [error, setError] = useState(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      return Boolean(params.get("error") || params.get("error_description"));
    }
    return false;
  });
  const [signalState, setSignalState] = useState(signalStates[0]);

  useEffect(() => {
    let stateIndex = 0;
    const interval = window.setInterval(() => {
      stateIndex = (stateIndex + 1) % signalStates.length;
      setSignalState(signalStates[stateIndex]);
    }, 3600);

    return () => {
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

  async function signInWithPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (manualBusy) return;
    setManualBusy(true);
    setMessage("");
    setError(false);
    const form = new FormData(event.currentTarget);
    try {
      const result = await authClient.signIn.email({
        email: String(form.get("email")).trim(),
        password: String(form.get("password")),
        callbackURL: "/",
      });
      if (result.error) {
        throw new Error(result.error.message ?? "Manual sign-in failed.");
      }
      router.replace("/");
      router.refresh();
    } catch (reason) {
      setError(true);
      setMessage(
        reason instanceof Error ? reason.message : "Manual sign-in failed.",
      );
      setManualBusy(false);
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
            <BrandEmblem />
            <span>ctrl_z</span>
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
                Sign in with Google, or use an email and password issued by
                your administrator. Public password registration is disabled.
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
              <div className="auth-assurance" style={{ marginTop: 22, marginBottom: 8 }}>
                <span>OR SIGN IN WITH ISSUED CREDENTIALS</span>
              </div>
              <form
                className="form-grid"
                onSubmit={signInWithPassword}
                style={{ marginTop: 10 }}
              >
                <div className="field">
                  <label htmlFor="manual-login-email">Manual Login ID (Email)</label>
                  <input
                    className="input"
                    id="manual-login-email"
                    name="email"
                    type="email"
                    placeholder="investigator@ctrl_z.ctf"
                    autoComplete="username"
                    required
                  />
                </div>
                <div className="field">
                  <label htmlFor="manual-login-password">Password</label>
                  <input
                    className="input"
                    id="manual-login-password"
                    name="password"
                    type="password"
                    placeholder="Enter password"
                    autoComplete="current-password"
                    required
                  />
                </div>
                <div className="full" style={{ marginTop: 4 }}>
                  <button
                    className="btn-secondary"
                    disabled={manualBusy}
                    style={{ width: "100%", justifyContent: "center" }}
                    type="submit"
                  >
                    {manualBusy ? "Authenticating…" : "Manual Sign-in"}
                  </button>
                </div>
              </form>
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

        <footer className="auth-footer">
          <span>ctrl_z</span>
        </footer>
      </div>
    </main>
  );
}
