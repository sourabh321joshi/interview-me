# Interview Me — PRD and Architecture (v1)

Draft v0.4 · November 14, 2026 · Solo build, low-cost v1

**What changed in v0.4:** the database is now MongoDB Atlas instead of Supabase Postgres. Authentication is chosen in M1 (M0 uses a single development user).

**What changed in v0.2:** stack decisions locked (Next.js, JavaScript-first, Deepgram for voice, OpenAI behind a model wrapper), live captions added, architecture and cost sections added, and milestones reordered so interview quality is tested before any heavy building.

## 1. Problem

Developers with 0–3 years of experience go through many interview rounds and are usually rejected without feedback. Existing mock-interview tools are generic: they ask everyone the same questions and don’t probe a candidate’s own projects, which is where real interviewers spend most of their time.

## 2. Target user

- Developers with 0–3 years of experience (students, freshers, early-career)
- Preparing for JavaScript-based roles first (frontend, backend with Node, full-stack)
- Has a resume and ideally a public GitHub profile

## 3. Goal of v1

Prove that an AI interviewer that reads a candidate’s resume and GitHub, asks and cross-questions by voice, and gives specific feedback is useful enough that people finish the interview, come back for another, and are willing to pay.

## 4. Decisions log

| Area | Decision | Reason |
|---|---|---|
| App stack | Next.js (App Router) with TypeScript on a serverless host | Solo-friendly; short streaming HTTP requests fit it well |
| Topics | JavaScript, React, and Node first | A narrow scope gives better question quality |
| Language | English by default; short Hinglish clarifications only when the candidate struggles | Matches the audience while keeping practice in English |
| Default duration | 5 minutes (Quick), with longer options later | Keeps cost and testing time low |
| Captions | Live captions on by default, with a toggle to turn them off | Catches speech-recognition errors and helps accessibility; off-mode practices listening |
| Voice | Deepgram for speech-to-text and text-to-speech; browser speech APIs as fallback | One $200 credit covers both; one vendor to integrate |
| LLM | OpenAI small-tier model for interview turns, stronger model for plan and report, behind a thin wrapper | $5 credit is enough to prototype; wrapper allows swapping providers |
| Gemini | Development experiments only on the free tier; no real user data | Free-tier content may be used to improve Google products |
| ElevenLabs | Deferred | Free plan is non-commercial; revisit if voice quality becomes a selling point |
| Database | MongoDB Atlas, accessed with the Node.js driver and zod | Document model suits transcripts and JSON summaries |
| Authentication | Auth library with a MongoDB adapter (Better Auth or Auth.js) or Clerk, decided in M1 | M0 runs with a single development user |

## 5. v1 scope

- Context from resume PDF, GitHub username, and an optional job description
- Role and level selection (frontend / backend / full-stack; fresher / 1–3 years)
- Selectable interview duration, with 5 minutes as the default
- AI interviewer with voice, live captions, text fallback, and cross-questioning
- Feedback report with scores, top fixes, and transcript evidence
- Attempt history
- Basic accounts, free-interview limit, consent screen, and data deletion

## 6. Non-goals for v1

- LinkedIn scraping (against its terms and unreliable)
- Video, proctoring, or cheating detection
- System design and behavioral rounds
- Employer dashboard, matching, or marketplace
- Full speech-to-speech realtime with interruption handling
- Languages other than JavaScript for coding questions

## 7. Core user flow

1. Sign up with email or Google and accept the consent screen.
2. Add context: upload resume PDF, enter GitHub username, optionally paste a job description.
3. Choose role, level, and duration (default 5 minutes).
4. The system builds a candidate profile and an interview plan in the background.
5. The interview starts: the AI asks questions by voice, captions show the text, the candidate answers by voice (or text), and the AI cross-questions based on the answers.
6. The interview ends at the time limit or when the candidate ends it, with a warning shortly before the limit.
7. A feedback report is generated and saved to history.

## 8. Interview duration options

| Option | Content | Availability |
|---|---|---|
| Quick, 5 min (default) | Project and resume discussion with cross-questions, plus 1–2 fundamentals questions. No coding. | v1 |
| Standard, 10 min | Everything in Quick, plus one small JavaScript coding problem in the browser editor | v1 if time allows, otherwise v1.1 |
| Full, 20 min | Longer project deep dive, coding, and CS fundamentals | Later |

Duration is an input to the interview-plan generator, so adding options later is configuration, not a rebuild. The timer is a hard stop; the AI wraps up gracefully before it.

## 9. Functional requirements

### 9.1 Context ingestion

- Parse the resume PDF with an LLM into a structured summary (skills, projects, experience), then discard the PDF.
- Use the GitHub public API to pick the top 3–5 repos by recent activity, then summarize README, languages, and structure once and cache the result. Do not send raw code wholesale to the LLM.
- Accept an optional job description to tailor questions.
- If GitHub is missing or thin, fall back to resume only.
- Combine everything into one candidate profile reused across sessions.

### 9.2 Interview engine

- Generate an interview plan per session: topics, difficulty for the chosen level, and follow-up directions, adjusted for the chosen duration.
- Cross-question based on the candidate’s previous answer.
- Only ask about details present in the profile or standard JavaScript, React, and Node fundamentals. Never invent project details.
- Be time-aware and wrap up when time is nearly out.
- Language rule in the system prompt: English by default; short Hinglish clarification only if the candidate seems stuck or asks.

### 9.3 Voice and captions

- Speech-to-text and text-to-speech via Deepgram, with browser speech APIs as a fallback.
- Live captions for both the interviewer and the candidate, on by default, toggleable.
- Candidate can see what the system heard and correct it before sending, if auto-send is off.
- No interruption handling in v1.
- Store transcripts only, not audio.

### 9.4 Code editor (Standard option)

- Monaco editor in the browser. JavaScript runs in a sandboxed iframe or Web Worker on the user’s machine, so there is no server-side execution.
- The AI can see the code and its output, and asks why the candidate made certain choices.

### 9.5 Feedback report

- Scores for problem solving, communication, technical depth, and fundamentals, plus code quality when coding was part of the session.
- Top 3 things to fix, each backed by quotes from the transcript.
- A fixed, versioned rubric and schema-validated JSON output so similar answers get similar scores.

### 9.6 Accounts, limits, and history

- One free interview per account; paid interview packs later.
- History page with past reports and score trends.
- Option to delete all personal data.

## 10. Architecture

### 10.1 Components

- **Browser client (Next.js):** microphone capture, live captions, audio playback, timer, and later the code editor.
- **Next.js route handlers:** profile builder, interview turn (streaming), report generator, voice proxy, and a token endpoint for Deepgram.
- **Third-party services:** LLM API, GitHub API, Deepgram.
- **Data:** MongoDB Atlas.

### 10.2 Interview turn loop

1. The server mints a short-lived Deepgram token. The browser streams microphone audio to Deepgram over WebSocket, so the API key never reaches the client and no WebSocket runs through the serverless host.
2. The final transcript appears as a caption and is sent, with elapsed time, to the interview-turn endpoint.
3. The server builds the prompt from a fixed prefix (system prompt, candidate profile, interview plan) plus the transcript so far, calls the LLM, and streams the reply.
4. The client shows reply text as it arrives. Each completed sentence is sent to the voice proxy for text-to-speech and queued for playback, so audio starts before the full reply is finished.
5. The server saves each turn to the database and stays stateless.
6. At the time limit the AI wraps up, and the report generator runs.

### 10.3 Voice

- Speech-to-text: Deepgram Nova-3 streaming. Test keyterm prompting with terms from the candidate’s profile.
- Text-to-speech: Deepgram Aura. Choose the voice after listening tests with Indian-English phrasing.
- Fallback: browser speech APIs when Deepgram is unavailable or credit runs out.
- Must test before committing: accuracy on Indian-accented English, technical terms, and Hinglish phrases.

### 10.4 Models

- A thin wrapper with three roles (plan, turn, report). Model names live in config, not code.
- Use prompt caching on the fixed prefix where the provider supports it.
- Reports are structured JSON validated with a schema.
- Log tokens, characters, and minutes per call to a usage table.
- Model lineups change quickly, so re-check available models and prices before each milestone.

### 10.5 Data model

Collections in MongoDB Atlas:

- **app_users:** account data, consent history, free-interview count.
- **candidate_profiles:** structured resume summary and cached GitHub repo summaries.
- **interviews:** role, level, duration, plan, status, timestamps, the embedded transcript (turns), and usage totals.
- **reports:** scores, top fixes, rubric version.
- **usage_events:** per-call usage and estimated cost, kept for a short period.
- **rate_limit_counters:** rate limiting with automatic expiry.

See Database Design v0.2 for fields and indexes. Resume PDFs and audio are not stored.

### 10.6 Security and privacy

- All provider keys stay server-side; the browser only receives short-lived Deepgram tokens.
- Rate limits and the free-interview cap enforced with database counters.
- MongoDB has no row-level security, so every database query is filtered by the signed-in user’s id through shared helper functions, and tests check that one user cannot reach another’s data.
- Consent screen names every processor (LLM provider, Deepgram, GitHub API) and what is stored.
- Review each provider’s data-use and retention settings and opt out of model-training use where offered.
- No real user data on any free tier that permits product-improvement use.
- Deletion on request, and a stated retention period for transcripts.

## 11. Cost model

Estimates from public price pages checked November 14, 2026. Sources disagree on some rates and promotions, so treat these as ranges and replace them with measured numbers.

| Item | Assumption | Estimated cost per 5-minute interview |
|---|---|---|
| Speech-to-text | 5 minutes of streaming | about 2–4 cents |
| Text-to-speech | about 2 minutes of AI speech, roughly 1,800 characters | about 3–5 cents |
| LLM | turns on a small model, plan and report on a stronger one | about 1–9 cents |
| **Total** | | **roughly 6–18 cents** |

Credit runway (rough): Deepgram $200 covers on the order of 2,000–4,000 interviews of voice. The OpenAI $5 credit covers dozens to a few hundred interviews, so it will run out first and is cheap to top up.

Controls: hard caps on session length, turns, and tokens; one free interview per account; cost logged per interview from the first prototype.

## 12. Success metrics

Initial targets, to be revised after the first 15 testers:

- At least 70% of started interviews are completed.
- At least 60% of testers say the feedback told them something new.
- At least 30% take a second interview within a week.
- Measured cost per interview stays within the budget set after the prototype.

## 13. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Generic or poor questions | Test in the M0 text prototype before building more; iterate on the plan prompt and rubric |
| AI invents project details | Constrain questions to the parsed profile; spot-check transcripts |
| Speech recognition struggles with accents or technical terms | Voice test early in M2; keyterm prompting; captions with correction |
| Hinglish handled badly | Keep English as the base language; test early; text fallback |
| Voice feels slow | Sentence-by-sentence text-to-speech, measure latency, text fallback |
| Free usage drains budget | One free interview, session caps, short default duration |
| Candidate data exposure | Server-side keys, consent, no PDFs or audio stored, no real data on free tiers |
| Model deprecations and price changes | Model wrapper, model names in config, re-check before each milestone |
| Atlas free cluster limits (storage, operations per second, inactivity pause) | One cached database client, move to a paid cluster before real users, regular exports |
| Thin GitHub profiles | Resume as the primary source, GitHub as a bonus |
| Inconsistent scoring | Fixed versioned rubric and schema-validated reports |

## 14. Milestones

The separate manual interview test and voice spike are folded into the build. Quality is checked in M0, and voice is checked at the start of M2.

1. **M0, text interview prototype:** Next.js skeleton, database, and model wrapper. Profile builder (resume and GitHub), plan, text-only interview, and report, using the prompts in the rubric document. Test with your own resume and a few friends using the survey and transcript checklist. **Checkpoint:** go or no-go on question and feedback quality before building more.
2. **M1, web app foundations:** auth, consent, database indexes and setup script, profile review and editing, usage logging, rate limits, and a basic history page.
3. **M2, voice:** start with a small voice test page inside the app (Deepgram speech-to-text on your accent, technical terms, and Hinglish; text-to-speech voice choice). **Checkpoint:** decide on settings, fallbacks, and latency. Then build the voice interview with live captions.
4. **M3:** Browser JavaScript editor and the 10-minute option.
5. **M4:** Progress history, free-interview limits, and payments.
6. **M5:** Test with 15 real developers and iterate.

## 15. Open questions

- Pricing model: interview packs or subscription.
- Rubric details: criteria, weights, and what each score level means.
- JavaScript, React, and Node question bank for the 0–3 year level.
- Which Deepgram text-to-speech voice fits best.
- Hosting and domain.
- Consent and privacy policy wording, and whether to get it reviewed.
- How to recruit the first 15 testers.
