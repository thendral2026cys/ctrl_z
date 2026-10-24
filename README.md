# VIPERWOLF competition platform

A Next.js application for running the VIPERWOLF team competition. It provides Google OAuth sign-in, teams of up to four, organizer-configurable rounds and challenges, team-shared timers and scoring, private evidence and submissions, and an organizer audit console.

The application intentionally does not invent official story text, flags, AI policy, or video links. Organizers configure those materials in the admin console.

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

Open `http://localhost:3000` and choose **Continue with Google**. The Google account email must match `ADMIN_EMAIL` to complete the one-time organizer bootstrap with `ADMIN_BOOTSTRAP_TOKEN`. Participants sign in with Google, then create or join a team.

## Google OAuth credentials

1. Open the [Google Cloud Console](https://console.cloud.google.com/) and create or select a project.
2. Configure the OAuth consent screen under **Google Auth Platform**. Choose the audience that fits the event, add the app name and support email, and add any test users if the app remains in testing.
3. Create an OAuth client under **Google Auth Platform → Clients** (or **APIs & Services → Credentials → Create credentials → OAuth client ID**). Select **Web application**.
4. Add the exact callback URL to **Authorized redirect URIs**:
   - Local: `http://localhost:3000/api/auth/callback/google`
   - Production: `https://YOUR-DOMAIN/api/auth/callback/google`
5. Copy the generated client ID and client secret into `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `.env`, then restart the app. Keep the secret private. Both values are required; without them, the sign-in button stays disabled and no alternate login is offered.
6. In Google Cloud Console, add the deployed site to **Authorized JavaScript origins** as well (for example `http://localhost:3000` for local development). For production, use the same HTTPS origin as `APP_URL`.

Google OAuth is the only account sign-in method. No demo, password, or bypass login is provided.

## Organizer content and event preparation

Before opening registration or a round:

1. Publish the official AI policy in the admin console. Round 1 cannot open without it.
2. Configure the official story, challenge instructions, correct flags, evidence, point values, and availability windows. Flags are stored as keyed digests and are never returned to clients.
3. Configure promotional/reveal/climax URLs and event timezone. Use HTTPS video URLs.
4. Review team membership, scoring, rule reports, and final submissions from the organizer console.
5. Open rounds manually or schedule them. Rounds 2 and 3 remain gated until the preceding round is closed.
6. Enable final submissions when appropriate. A team must solve the Round 3 final mission before submitting its three HTTPS links.

The seed creates only round structure and default event configuration; it does not create placeholder answers, fictional story content, or videos.

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
