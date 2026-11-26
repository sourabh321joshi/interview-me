# Private staging for the M5 beta

The [product roadmap](ai-interview-platform-v1-prd.md) calls for testing Interview Me with 15 developers. Use a separate staging environment for initial verification and keep Razorpay in Test Mode.

## Set up the environment

1. Deploy the verified branch to an invite-only HTTPS staging URL on the chosen Node.js host. Check the host’s upload limit against the app’s 5 MB resume limit and keep the versioned `prompts/` files with the deployed app.
2. Create a separate MongoDB database and a database user scoped to it. Set `MONGODB_URI` and `MONGODB_DB` for staging, set `BETTER_AUTH_URL` to the exact HTTPS origin, and generate a new `BETTER_AUTH_SECRET`. Keep these values in the host's server-side environment. From the repo with staging variables loaded, run `node --import tsx scripts/db-indexes.ts` to install the indexes. Confirm `/api/v1/health` returns `ok`.
3. Configure a Google OAuth web client for staging. Add the exact staging origin under authorized JavaScript origins and that origin with `/api/auth/callback/google` appended under authorized redirect URIs. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.
4. Configure the staging model and voice credentials using the variables in [the environment template](../.env.example). Include the active unit rates so usage can be estimated before the beta. Keep provider secrets in the host’s environment settings.
5. Follow the [Razorpay sandbox guide](razorpay-sandbox.md) for the Test Mode keys. To verify deferred capture, configure the signed `payment.captured` webhook. If host-level access protection blocks Razorpay, allow access to that webhook path while keeping the rest of staging private.

## Verify the tester flow

- Sign in with Google and verify a new account sees one free 3-minute interview.
- Create and review a profile, run the free interview, and confirm the report opens from both the interview and History. Use a fictional profile for the first provider-backed staging check.
- Verify test checkout adds the correct duration credit, including after refresh. Verify a repeated callback or webhook delivery keeps the credit count unchanged.
- Use the PRD’s beta measures for completion, feedback usefulness, repeat interviews within a week, and cost per interview.

The local production smoke test covered database health and indexes, email signup, consent, saving and reloading a fictional profile, the free allowance, protected routes, and account deletion. Google and Razorpay settings were represented by placeholders to verify the UI. Hosted OAuth, webhook delivery, and a full provider-backed staging interview remain to be verified.
