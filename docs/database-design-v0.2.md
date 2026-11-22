# Interview Me Database Design (v0.2, MongoDB Atlas)

Draft v0.2 · November 14, 2026 · Replaces v0.1 (Postgres). Companion to System Design v0.1 and API Design v0.1.

Database: MongoDB Atlas. Access through the official Node.js driver, with zod schemas validating documents in the app.

## 1. Conventions and key decisions

- **Driver and validation:** native `mongodb` driver plus zod. Mongoose is an acceptable alternative; decide once in M0 and keep it consistent.
- **Field names:** `snake_case`, matching the API, so no mapping layer is needed. Collection names are `snake_case`.
- **IDs:** `_id` is a MongoDB `ObjectId`. The API exposes it as a 24-character hex string. Exception: `app_users._id` equals the auth library’s user id, so no extra lookup is needed per request (confirm its type when the auth library is chosen).
- **Times:** stored as `Date` (UTC).
- **Embedded turns:** each interview document contains its `turns` array. An interview has at most about 40 turns of up to 2,000 characters, far below the 16 MB document limit. One read returns the whole conversation, and appends are atomic.
- **No foreign keys and no row-level security.** Ownership is enforced in application code (section 5). Cascading deletes are done by a deletion function (section 7).
- **Schema versions:** documents carry `schema_version` where their shape may change.
- **Indexes:** created by a setup script kept in version control and run on deploy. There are no SQL-style migrations.

## 2. Collections overview

| Collection | Purpose |
|---|---|
| `app_users` | App data per user: quota and consent history |
| `candidate_profiles` | Structured resume and GitHub summaries |
| `interviews` | One interview: plan, state, embedded transcript, usage totals |
| `reports` | Feedback report, scores, and validated JSON |
| `usage_events` | Per-call usage and cost records (short retention) |
| `rate_limit_counters` | Fixed-window rate limiting with automatic expiry |

The auth library creates its own collections (for example users, accounts, and sessions). Leave them alone and do not store app data in them.

## 3. Collection definitions

### 3.1 `app_users`

```json
{
  "_id": "<auth user id>",
  "display_name": "Riya",
  "free_interviews_used": 0,
  "paid_interview_credits": 0,
  "consents": [
    {
      "version": "2026-11-v1",
      "processors": ["llm_provider", "deepgram", "github"],
      "accepted_at": "2026-11-14T10:00:00Z"
    }
  ],
  "created_at": "2026-11-14T10:00:00Z"
}
```

Indexes: `_id` only.

### 3.2 `candidate_profiles`

```json
{
  "_id": "ObjectId",
  "user_id": "<app_users id>",
  "status": "ready",
  "summary": {},
  "github_username": "riya-dev",
  "github_summary": {},
  "job_description": null,
  "error_code": null,
  "schema_version": 1,
  "created_at": "2026-11-14T10:00:00Z",
  "updated_at": "2026-11-14T10:00:00Z"
}
```

`status` is one of `processing`, `ready`, `failed`. Indexes: `{ user_id: 1, created_at: -1 }`.

### 3.3 `interviews`

```json
{
  "_id": "ObjectId",
  "user_id": "<app_users id>",
  "profile_id": "ObjectId or null",
  "role": "frontend",
  "level": "fresher",
  "duration_seconds": 300,
  "mode": "voice",
  "status": "in_progress",
  "end_reason": null,
  "plan": {},
  "prompt_version": "0.1",
  "rubric_version": "0.1",
  "models": {"plan": "model-name", "turn": "model-name", "report": "model-name", "stt": "nova-3", "tts": "aura-voice-name"},
  "slot_source": "free",
  "started_at": "2026-11-14T10:00:00Z",
  "ends_at": "2026-11-14T10:05:00Z",
  "ended_at": null,
  "turn_count": 2,
  "turns": [
    {
      "seq": 0,
      "speaker": "interviewer",
      "kind": "speech",
      "text": "Hi Riya, ...",
      "t_offset_ms": 0,
      "client_turn_id": null,
      "created_at": "2026-11-14T10:00:01Z"
    }
  ],
  "usage_totals": {
    "llm_input_tokens": 0,
    "llm_output_tokens": 0,
    "stt_seconds": 0,
    "tts_characters": 0,
    "est_cost_usd": 0
  },
  "expire_at": "2026-12-14T10:00:00Z",
  "created_at": "2026-11-14T10:00:00Z"
}
```

Allowed values:

- `role`: `frontend`, `backend`, `fullstack`
- `level`: `fresher`, `junior`
- `mode`: `voice`, `text`
- `status`: `created`, `plan_ready`, `in_progress`, `wrapping_up`, `completed`, `abandoned`, `failed`
- `end_reason`: `model_finished`, `user_ended`, `timeout`, `error`
- `slot_source`: `free`, `paid`
- `turns[].speaker`: `interviewer`, `candidate`; `turns[].kind`: `speech`, `text`, `code`, `system`

`turn_count` always equals the number of turns and is the next `seq`. `expire_at` is set on creation and updated on start and completion (see retention below).

Indexes:

- `{ user_id: 1, created_at: -1 }` for history
- `{ status: 1, ends_at: 1 }` for stale-interview checks
- TTL: `{ expire_at: 1 }` with `expireAfterSeconds: 0`, which removes expired interviews automatically

List queries must exclude the transcript with a projection (for example `{ turns: 0, plan: 0 }`) so history pages stay small.

### 3.4 `reports`

```json
{
  "_id": "ObjectId",
  "interview_id": "ObjectId",
  "user_id": "<app_users id>",
  "status": "ready",
  "rubric_version": "0.1",
  "summary": "Two or three sentences",
  "scores": {
    "problem_solving": 3,
    "technical_depth": 3,
    "fundamentals": null,
    "communication": 4
  },
  "details": {},
  "attempts": 1,
  "error_code": null,
  "model": "model-name",
  "created_at": "2026-11-14T10:08:00Z",
  "updated_at": "2026-11-14T10:08:30Z"
}
```

`status` is one of `pending`, `ready`, `failed`. `scores` values are 1–5 or `null` when evidence was insufficient; they are copied from `details.scores` when the report becomes `ready` so progress charts are simple queries. `details` holds the full validated report from the Rubric and Prompts document. `user_id` is stored here so ownership is a single filter.

Indexes: unique `{ interview_id: 1 }`, and `{ user_id: 1, created_at: -1 }`.

### 3.5 `usage_events`

```json
{
  "_id": "ObjectId",
  "user_id": "<app_users id or null>",
  "interview_id": "ObjectId or null",
  "provider": "deepgram",
  "kind": "tts",
  "role": "voice",
  "model": "aura-voice-name",
  "input_tokens": null,
  "output_tokens": null,
  "cached_input_tokens": null,
  "audio_seconds": null,
  "characters": 84,
  "latency_ms": 310,
  "est_cost_usd": 0.0025,
  "created_at": "2026-11-14T10:01:00Z"
}
```

`kind` is one of `llm`, `stt`, `tts`, `other`. `role` is one of `profile`, `plan`, `turn`, `report`, `voice`.

Each call also adds to `interviews.usage_totals` with `$inc`, so per-interview cost is a single read. Per-call events are only for debugging and tuning, so they expire after about 90 days.

Indexes: `{ interview_id: 1 }`, and TTL `{ created_at: 1 }` with `expireAfterSeconds: 7776000`.

### 3.6 `rate_limit_counters`

```json
{ "_id": "profiles:<user id>:28100000", "count": 3, "expire_at": "2026-11-14T10:10:00Z" }
```

The id combines the limit key and the window number. Index: TTL `{ expire_at: 1 }` with `expireAfterSeconds: 0`.

## 4. Key operations

### Reserve an interview slot (atomic)

```js
let r = await app_users.findOneAndUpdate(
  { _id: userId, free_interviews_used: { $lt: FREE_LIMIT } },
  { $inc: { free_interviews_used: 1 } },
  { returnDocument: "after" }
);
let source = "free";
if (!r) {
  r = await app_users.findOneAndUpdate(
    { _id: userId, paid_interview_credits: { $gt: 0 } },
    { $inc: { paid_interview_credits: -1 } },
    { returnDocument: "after" }
  );
  source = "paid";
}
if (!r) throw new QuotaExceeded();
```

### Start the interview, with refund on failure

```js
const res = await interviews.updateOne(
  { _id: interviewId, user_id: userId, status: "plan_ready" },
  {
    $set: { status: "in_progress", started_at, ends_at, slot_source: source },
    $unset: { expire_at: "" }
  }
);
if (res.matchedCount === 0) await refundSlot(userId, source);
```

Single-document operations are atomic, so this order (reserve, then start, then refund on failure) avoids needing multi-document transactions.

### Append a turn (ordering and idempotency)

```js
const res = await interviews.updateOne(
  {
    _id: interviewId,
    user_id: userId,
    status: { $in: ["in_progress", "wrapping_up"] },
    turn_count: expectedSeq,
    "turns.client_turn_id": { $ne: clientTurnId }
  },
  { $push: { turns: turn }, $inc: { turn_count: 1 } }
);
```

- `turn_count: expectedSeq` is optimistic concurrency: if two requests race, only one matches.
- `"turns.client_turn_id": { $ne: ... }` stops the same candidate answer from being stored twice.
- If nothing matched, check whether that `client_turn_id` already exists. If so, replay the stored reply. Otherwise return a conflict.

### Add usage

```js
await interviews.updateOne(
  { _id: interviewId },
  { $inc: { "usage_totals.llm_input_tokens": n1, "usage_totals.llm_output_tokens": n2, "usage_totals.est_cost_usd": cost } }
);
await usage_events.insertOne(event);
```

### Rate limit

```js
const r = await rate_limit_counters.findOneAndUpdate(
  { _id: `${key}:${windowNumber}` },
  { $inc: { count: 1 }, $setOnInsert: { expire_at: windowEndPlusBuffer } },
  { upsert: true, returnDocument: "after" }
);
if (r.count > limit) throw new RateLimited();
```

## 5. Authorization rules (no row-level security)

- Every route reads the user id from the verified session, never from the request body.
- Every query on user data includes `user_id` in its filter. Use shared helpers such as `getOwnedInterview(userId, id)` and avoid raw `findOne({ _id })` in route code.
- Malformed or unowned ids return `404 not_found`.
- Write tests that confirm user B cannot read, update, or delete user A’s profile, interview, or report through any route.
- The connection string is used only on the server.

## 6. Main access patterns

| Use case | Query |
|---|---|
| History list | `reports` or `interviews` by `user_id`, newest first, projection without turns |
| Interview resume or review | `interviews` by `_id` and `user_id`, including `turns` |
| Progress chart | `reports` by `user_id` with `scores`, ordered by date |
| Cost per interview | `interviews.usage_totals.est_cost_usd` |
| Stale interview check | `interviews` where `status` is `in_progress` and `ends_at` is past plus grace |
| Report generation | `reports` by `interview_id` (unique) |

## 7. Retention and deletion

Proposed defaults, to be confirmed:

- Transcripts and reports are kept until the user deletes them.
- Interviews that never start are removed about 30 days after creation.
- When an interview starts, its transcript expires 30 days after the scheduled end if the interview is never closed. When it closes, the deadline is set to 30 days after completion.
- A report inherits its interview's deadline in `reports.expire_at`. Both collections have TTL indexes. The app blocks access at the deadline and MongoDB removes the documents in the background.
- `usage_events` expire after about 90 days. Cost totals stay on the interview.
- Profiles can be deleted at any time. Interviews keep their stored plan, so history still works (`profile_id` becomes `null`).
- Resume PDFs and audio are never stored.

Account deletion is one function that runs in this order and is safe to rerun:

1. Delete `reports` where `user_id` matches.
2. Delete `interviews` where `user_id` matches.
3. Delete `candidate_profiles` where `user_id` matches.
4. Set `user_id` to `null` in remaining `usage_events` for the user.
5. Delete the `app_users` document and the auth library’s user, account, and session records.

## 8. Atlas setup and operations

Free-tier facts below were checked on November 14, 2026. Re-check Atlas’s own limits page before relying on them.

- **Free cluster limits:** 512 MB storage, up to 500 connections, and a cap of about 100 operations per second. Atlas pauses free clusters after a period of inactivity. Current docs say 30 days; older sources said 60. Backup behavior on the free tier is described inconsistently, so plan your own periodic export regardless.
- **Connections from serverless functions:** create one `MongoClient` per server instance and reuse it (module-level or global cache), with a small `maxPoolSize`. Creating a client per request will exhaust connections quickly.
- **Network access:** Atlas blocks unknown IP addresses by default. Serverless hosts use changing addresses, so a common setup allows all IPs and relies on a strong password and TLS. Because this product stores personal data, look at private networking or static IP options before launch.
- **Access control:** create a dedicated database user with read and write access to one database only. Use separate databases or clusters for development, staging, and production.
- **Production:** move to a paid cluster before real users arrive, for backups, no pausing, and higher limits. Check current Atlas pricing then.

## 9. Size estimate

An interview document with its transcript is roughly 10–20 KB (rough estimate), plus about 5–8 KB for the report and a few KB for the profile. The 512 MB free tier would hold on the order of 10,000–30,000 interviews before counting indexes. Storage is not the early constraint. The pause behavior and the 100 operations-per-second cap matter more.

## 10. Open decisions

- Auth library and its MongoDB adapter (Better Auth, Auth.js, or Clerk), decided in M1. M0 uses a single development user.
- Native driver with zod, or Mongoose.
- Free interview limit per account (PRD says one).
- Transcript retention period.
- Whether users may keep several profiles or just one.
- Revisit embedded turns only if you later need analytics across individual turns of many interviews.
