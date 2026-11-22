# Interview Me

A text-only prototype for AI mock interviews: upload a resume (and optionally a GitHub username), get a short AI interview, then a feedback report with evidence from your own answers.

Docs are in `docs/`. Rules for coding agents are in `AGENTS.md`. Progress is in `docs/progress.md`. The M0 checkpoint guide is `docs/m0-checkpoint.md`.

## What you need

- Node.js 22 (current LTS) and npm
- A MongoDB Atlas cluster (the free one is fine). In Atlas, add your IP address under Network Access and create a database user.
- An OpenAI API key and model names your account can use
- Optional: a GitHub token (higher API limits when reading repos)

## Set up

1. `npm install`
2. Copy `.env.example` to `.env.local` and fill it in:

| Variable | Purpose |
|---|---|
| `MONGODB_URI` | Atlas connection string |
| `MONGODB_DB` | Database name (default `interview_app`) |
| `OPENAI_API_KEY` | Your OpenAI key |
| `MODEL_PLAN`, `MODEL_TURN`, `MODEL_REPORT` | Model names for planning, interview turns, and the report. Check OpenAI's current model list; older small models are being retired. |
| `MODEL_PROFILE` | Optional. Falls back to `MODEL_TURN`. |
| `MODEL_PRICES_JSON` | Optional prices (USD per 1M tokens) so cost estimates are not zero, for example `{"model-name":{"input":0.2,"output":1.25}}` |
| `GITHUB_TOKEN` | Optional |
| `FREE_INTERVIEW_LIMIT` | Free interviews per user. Use a high number such as 100 while testing (default 1). |
| `RATE_GENERAL_PER_MINUTE`, `RATE_PROFILES_PER_DAY` | Rate limits (defaults 60 and 5). Raise them while testing. |

3. `npm run db:indexes` once to create the database indexes.
4. `npm run dev`, then open http://localhost:3000/api/v1/health. You should see `{"status":"ok", ...}`.
5. Open http://localhost:3000/interview, upload a PDF resume, and start an interview.

## Using it

- The interview runs at `/interview?interview=<id>`. Refreshing the page restores the conversation.
- **End and get feedback** closes the interview and opens `/report?interview=<id>`. The report appears in under a minute.
- There is no login in M0. Everything runs as one fixed development user.

## Useful commands

| Command | What it does |
|---|---|
| `npm run dev` | Start the app locally |
| `npm run typecheck`, `npm run lint`, `npm test` | Checks (all should pass before you commit) |
| `npm run build` | Production build |
| `npm run db:indexes` | Create or update indexes |
| `npm run export:interview -- <id>` | Print an interview's transcript, report, and estimated cost. Local tool for the checkpoint. |

## How it is built

- `app/api/v1/...` route handlers. Every route checks the rate limit and filters data by the signed-in user.
- `lib/` holds the logic: `llm/` (model wrapper and usage logging), `profile-builder.ts`, `interview-service.ts`, `turn-service.ts`, `report-service.ts`, and the `*-store.ts` files that talk to MongoDB.
- `prompts/` holds the versioned prompts. Resume, README, and transcript text is always wrapped as untrusted data.
- Tests run against in-memory stores and a fake model, so they need no database or keys.

## Known limits of M0

- Text only. No voice, no login, no payments, no code editor.
- The tests never touch a real database or the real OpenAI API. Run a real interview to check those paths.
- Scanned PDFs are rejected. Complex two-column resumes may extract in a messy order.

## Before deploying anywhere

- The `prompts/` folder must be included in the deployed build, because prompts are read from disk.
- Serverless hosts may limit request body size (Vercel is around 4.5 MB, below the 5 MB resume limit). Check your host.
- Atlas blocks unknown IP addresses. Serverless hosts use changing addresses, so review network access and use a strong password.
- Some hosting plans are for non-commercial use only. Check the terms before charging users.
- Add real authentication (M1) before real users. The fixed development user must never be used in production.

## M1 sign-in

Set BETTER_AUTH_URL to the app origin and BETTER_AUTH_SECRET to a random secret of at least 32 characters in .env.local. For local development use http://localhost:3000. Email/password registration is available at /sign-in. Google sign-in appears when GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are set. Register the callback http://localhost:3000/api/auth/callback/google in Google Cloud for local use. Signed-in accounts own their new interviews. Old shared development records stay with their original owner.
