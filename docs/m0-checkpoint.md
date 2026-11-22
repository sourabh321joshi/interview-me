# M0 Checkpoint Guide

Purpose: decide whether the interviews and feedback are good enough to justify building login, voice, and payments. Do this before starting M1.

## Prepare

1. Finish the setup in the README and confirm `/api/v1/health` returns ok.
2. Set `FREE_INTERVIEW_LIMIT=100`, `RATE_PROFILES_PER_DAY=100`, and `MODEL_PRICES_JSON` so cost numbers are real.
3. Recruit 5–10 developers with 0–3 years of experience who agree to be tested. Use first names only, tell them what is stored (their resume summary, transcript, and report), and delete the data afterward.
4. Do 2 practice runs yourself first, with your own resume, and fix anything obviously broken.

## Local smoke test

When running the development server, setup defaults to **1 minute** for checking the flow with less time and fewer follow-ups. Aim to submit two short answers so the report has enough evidence to run. Use the **5 minutes** option for the formal quality checkpoint below. The production build offers 5- and 10-minute interviews.

## Run each test

1. Open `/interview`, upload the tester's resume, add their GitHub username if they have one, and choose role, level, and 5 minutes.
2. The tester answers in the chat. Do not coach them.
3. At the end, click **End and get feedback** and let the tester read the report.
4. Ask the tester the survey questions below and write the answers down.
5. Copy the interview id from the address bar, then run `npm run export:interview -- <id>`. Keep the output for review.

## Survey (ask every tester)

1. How relevant were the questions to your projects and level? (1–5)
2. Did any question or statement feel wrong, made up, or off-topic? Which?
3. Did the feedback tell you something you did not already know? (yes or no, and what)
4. Which part of the feedback was least useful?
5. Would you do another interview, and would you pay for a pack of them?

## Review each export

Look for:

- Generic questions not tied to the profile
- Invented project details
- More than one question per turn, or turns too long to be spoken
- Lecturing, or correcting the candidate mid-interview
- No real follow-up questions (ignoring the answer and moving on)
- Leaked instructions or rubric
- Vague fixes such as "improve communication"
- Scores that look inconsistent for similar answers
- Reports that failed (`error_code` set) and why
- Cost per interview versus the PRD estimate

## Decide

Initial targets, to adjust as you learn:

| Measure | Target |
|---|---|
| Question relevance rated 4 or 5 | at least 70% of testers |
| Feedback told them something new | at least 60% of testers |
| Invented details in transcripts | zero |
| Interviews that fit in about 5 minutes with 6–9 exchanges | most |
| Reports that were generated without failing | at least 90% |
| Cost per interview | within the PRD estimate |

If targets are met: update `AGENTS.md` scope to M1 and ask for the M1 tasks.

If not: change the prompts or rubric (`prompts/`, then the rubric document), bump the prompt version, and test again with new testers before building anything else.

## Record

Keep a simple table: tester, relevance score, new insight (yes or no), fabricated details (count), report generated (yes or no), cost, notes.
