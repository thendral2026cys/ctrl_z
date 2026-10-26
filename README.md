# VIPERWOLF competition platform

A Next.js application for running the VIPERWOLF team competition. It provides Google OAuth sign-in, teams of up to four, organizer-configurable rounds and challenges, team-shared timers and scoring, private evidence and submissions, and an organizer audit console.

The application intentionally does not invent official story text, flags, AI policy, or video links. Organizers configure those materials in the admin console. The verified `thendralcys@gmail.com` account is the designated main administrator; all other administrators have restricted organizer access.

## Requirements

- Node.js 22.6 or newer (Node.js 22 LTS or newer recommended)
- PostgreSQL 14 or newer
- A Google OAuth client for Google sign-in

## Local setup

1. Install dependencies and copy the environment template:

   ```powershell
   npm ci
   Copy-Item .env.example .env
   ```

2. Configure `.env`:

   | Variable | Purpose |
   | --- | --- |
   | `DATABASE_URL` | PostgreSQL connection URL. URL-encode special characters in credentials. |
   | `APP_URL` | Canonical application origin, such as `http://localhost:3000` locally. |
   | `BETTER_AUTH_SECRET` | Random secret of at least 32 characters for authentication. |
   | `FLAG_SECRET` | Separate random secret of at least 32 characters for keyed flag digests. |
   | `ADMIN_EMAIL` | Email address allowed to perform the one-time initial organizer setup. |
   | `ADMIN_BOOTSTRAP_TOKEN` | Long, random, one-time token for that setup. |
   | `GOOGLE_CLIENT_ID` | OAuth 2.0 client ID from Google Cloud Console. |
   | `GOOGLE_CLIENT_SECRET` | Secret for that Google OAuth client. |

   Generate independent secrets with:

   ```powershell
   node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
   ```

   Use one generated value for each secret, and supply a separate unpredictable value for the bootstrap token. Never commit `.env`, share production credentials, or reuse the flag/authentication secret.

3. Create the database, then apply the schema and seed the three structural rounds:

   ```powershell
   npm run db:generate
   npm run db:deploy
   npm run db:seed
   ```

   For local schema development, use `npm run db:migrate` instead of `db:deploy`.

## Docker PostgreSQL

The Windows development setup runs Docker Engine and Compose in Ubuntu on WSL2. Docker publishes PostgreSQL only on `127.0.0.1:5432` and keeps database files in a named Docker volume. The Compose credentials are generated from the PostgreSQL username, password, and database name already present in `DATABASE_URL`; the generated `.env.docker` file is git-ignored.

After Docker Engine is installed and running in WSL2, one command starts PostgreSQL, waits until it is healthy, applies the existing Prisma migrations, and seeds the structural event configuration:

   ```powershell
   npm run db:setup
   ```

Use these commands to start, stop, or inspect the database later:

   ```powershell
   npm run db:docker:up
   npm run db:docker:status
   npm run db:docker:down
   ```

Stopping the container preserves the named database volume. Do not delete that volume unless you intend to permanently erase the database.

Start the application:

   ```powershell
   npm run dev
   ```

Open `http://localhost:3000` and choose **Continue with Google** or sign in with an email/password login issued by the main administrator. The verified `thendralcys@gmail.com` account receives main-administrator access. Participants can create or join a team after signing in. Public email/password registration is disabled; only the main administrator can issue manual login credentials or grant administrator access.

Team leaders can use **Team code** in the dashboard navigation to display and copy an invite code. Generating a new code invalidates the team's previous invite code.

All event schedules and displayed timestamps permanently use India Standard Time (IST, `Asia/Kolkata`). Server-side availability checks compare the resulting timestamps against the current instant, regardless of the server's local timezone.

## Google OAuth credentials

1. Open the [Google Cloud Console](https://console.cloud.google.com/) and create or select a project.
2. Configure the OAuth consent screen under **Google Auth Platform**. Choose the audience that fits the event, add the app name and support email, and add any test users if the app remains in testing.
3. Create an OAuth client under **Google Auth Platform → Clients** (or **APIs & Services → Credentials → Create credentials → OAuth client ID**). Select **Web application**.
4. Add the exact callback URL to **Authorized redirect URIs**:
   - Local: `http://localhost:3000/api/auth/callback/google`
   - Production: `https://YOUR-DOMAIN/api/auth/callback/google`
5. Copy the generated client ID and client secret into `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `.env`, then restart the app. Keep the secret private. Both values are required to enable Google sign-in; administrators can still use their separately provisioned email/password login.
6. In Google Cloud Console, add the deployed site to **Authorized JavaScript origins** as well (for example `http://localhost:3000` for local development). For production, use the same HTTPS origin as `APP_URL`.

Google OAuth remains available to participants. Email/password sign-in is available to provisioned participant and administrator accounts. Credentials are issued by the main administrator only. Public email/password sign-up is disabled.

## Organizer content and event preparation

Before opening registration or a round:

1. Publish the official AI policy in the admin console. Round 1 cannot open without it.
2. Configure the official story, challenge instructions, correct flags, evidence, point values, and availability windows. Flags are stored as keyed digests and are never returned to clients.
3. Configure promotional/reveal/climax URLs and event timezone. Use HTTPS video URLs.
4. Review team membership, scoring, rule reports, and final submissions from the organizer console.
5. Open rounds manually or schedule them. Rounds 2 and 3 remain gated until the preceding round is closed.
6. Enable final submissions when appropriate. A team must solve the Round 3 final mission before submitting its three HTTPS links.

The seed creates only round structure and default event configuration; it does not create placeholder answers, fictional story content, or videos.

### Scoring permissions

- Only authenticated administrators can open the organizer console or call manual score endpoints. Manual Round 1 team scores and administrator corrections require a reason and are recorded with the administrator, timestamp, previous score, and new score.
- Round 1 scores remain team totals for the leaderboard. Each entry also records an exact, equally divided share for every active team member in the append-only audit log.
- Participants see the Round 1 external contest link, not in-app Round 1 challenge content. The Round 2 and Round 3 organizer workspace provides three non-persistent setup slots per round; a challenge and its points are created only when an administrator saves it.
- Administrators can restart a Round 2 or Round 3 challenge to publish it immediately and clear its challenge-level schedule. The parent round must still be open or scheduled; restarting a challenge does not bypass round ordering or round closures.
- Administrators can restore removed participants, with any removal score deduction reversed and the action recorded in the audit log. Restoration is blocked when the team already has four active members.
- Only the main administrator can promote an existing account or create manual email/password logins for participants and administrators. Passwords are hashed by Better Auth and are not written to audit logs.
- The verified `thendralcys@gmail.com` account is the sole main administrator. Other admins can view team activity logs, manage challenges, and make audited team-score adjustments. Only the main administrator can configure rounds/events, enter Round 1 scores, manage users or members, review rule reports, view final submissions, or reset competition data. These boundaries are enforced by server-side authorization.
- Team names in the participant activity log filter to that team's full activity history, loaded in pages of 100 entries.
- The admin-only full competition reset removes teams, participant accounts, scores, challenge attempt/solve history, submissions, reviews, timers, and earlier activity logs. It preserves administrator accounts and event/challenge configuration, requires typing `RESET VIPERWOLF`, and writes a new audit entry for the reset.
- `/leaderboard` provides the full team ranking table and a top-10 score chart. Tied teams share competition ranks (for example, 1, 1, 3); display order within a tie is deterministic by team name.
- Rounds 2 and 3 award the configured challenge points only after the server verifies a correct flag. A challenge awards points once per team; repeat submissions do not award points again. The solve record identifies the team member and server-side solve time.
- Team members and team leaders cannot enter or modify scores. Round 1 and administrator adjustments are not participant-facing controls.

## Production deployment for 100–150 participants

- For production, deploy the PostgreSQL 17 container on a dedicated host with persistent storage, automated encrypted backups, tested restores, monitoring, and restricted private-network access; or use a managed PostgreSQL provider. Never expose PostgreSQL publicly without network controls and TLS. Use Docker secrets or the host's secret manager instead of a checked-in env file.
- Deploy the Next.js app on a supported Node.js runtime. Set `APP_URL` to the public HTTPS origin and configure the hosting provider’s trusted origin/security settings consistently.
- Use a managed PostgreSQL connection pooler when deploying serverless or horizontally scaled app instances. Size the pool and database for expected concurrent logins and challenge submissions; load-test with the deployment’s actual connection limits.
- Keep Google OAuth and application secrets in the hosting provider’s secret manager. Verify the production callback URL and consent-screen publishing/testing settings before the event.
- Apply migrations with `npm run db:deploy` and seed with `npm run db:seed` as controlled deployment steps. Run `npm run build` before release.
- Back up PostgreSQL and test restore procedures. Evidence files are stored in PostgreSQL; enforce reasonable upload limits and monitor database storage.
- Serve only over HTTPS, restrict access to deployment and database administration, and monitor application/database errors during the event. Audit rows are protected against ordinary updates and deletes by database triggers, but database administrators can still alter the database.
- Before the live event, rehearse team-cap enforcement, round transitions, simultaneous submissions, wrong-answer throttling, scoring adjustments, evidence permissions, and final-link submission with test accounts.

## Checks

```powershell
npm run db:generate
npm run typecheck
npm run lint
npm test
npm run build
```

The domain tests cover keyed flag digests, invite-code hashing, HTTPS URL checks, bootstrap-token comparison, timezone conversion, and daylight-saving gaps. Database-backed end-to-end checks require a running PostgreSQL instance.
