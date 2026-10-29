# Mullwell

An all-in-one study app for classes. Give it notes, PDFs, photos of handwritten pages, a live lecture or just a topic, and it quizzes you on your own material, checks every answer key against that material, and schedules reviews up to your test date. It runs on the student's own ChatGPT or Grok subscription through [shared-ai-auth](https://github.com/neelsatyavolu/shared-ai-auth), so there is no AI bill. You sign in with a Mullwell account, and your study data syncs across your devices.

Live at https://mullwell.xanom.co.

## What it does

- **Classes, sets and tests.** Each class holds study sets (a lecture, a chapter, a topic) and upcoming tests.
- **Practice first.** A set opens straight into questions (short answer, multiple choice, fill-in-the-blank) that stream in while you work. You pick how sure you are, check your answer, and see the verdict next to the quote from your notes that supports it. Misses ask you to explain the idea back.
- **Accuracy checks.** Every question must quote its source. Questions whose quote isn't in your material are dropped, and a second, independent model pass answers each question from the source before you can check it. Questions that fail are removed and counted on screen.
- **Spaced review.** FSRS schedules every question. Confident misses and lucky guesses come back sooner. Review is today's session: due cards from all classes mixed together, plus a few new questions a day (both limits are in Settings).
- **Test prep.** For each test: counts of what you recalled, what's shaky and what you haven't tried, a daily review plan built from what you'd likely forget by test day, and timed-style practice tests weighted toward your misses.
- **Notes, tutor and extras.** Cited study notes (with math and tables), a tutor that guides with questions before giving answers, a two-voice audio recap read by the device, and a concept map. Extras are made only when asked.
- **Inputs.** Pasted text, PDFs (read in the browser), up to 6 photos (transcribed by the model), live lecture transcription (browser speech recognition), and topic-only sets researched on the web and labelled "From the web".

## Run it

```bash
pnpm install
echo "MULLWELL_SECRET=$(openssl rand -base64 32)" > .env.local
pnpm dev
```

Open Settings, connect ChatGPT or Grok, and paste back the callback link or code.

`MULLWELL_SECRET` (16+ characters) signs the session cookie and encrypts the AI token cookies. Locally, accounts and synced data go to an on-disk PGlite database in `.data/`, so no other services are needed.

In production, also set `DATABASE_URL` (Postgres; tables are created on first use), `APP_URL` (the site's address) and, for password reset email, `RESEND_API_KEY`.

## Checks

```bash
pnpm test        # unit tests (vitest)
pnpm typecheck
pnpm lint
pnpm build
pnpm smoke       # opt-in live check of the prompts on a real ChatGPT account; see smoke/live.test.ts
```

## How it fits together

- `lib/ai/`: server only. OAuth wrapper, sealed cookie sessions, Responses API streaming, and `tasks.ts`, which holds every prompt and validates every task input.
- `app/api/ai/`: connect, disconnect, status, and `run` (streams one task as NDJSON).
- `app/api/account/`, `app/api/sync/`: sign-up, sign-in and password reset, and syncing the library across devices.
- `lib/account/`, `lib/db/`, `lib/mail/`, `lib/server/`: server only. Accounts and sessions, Postgres (PGlite locally) with last-write-wins sync records, reset emails through Resend, config and rate limits.
- `lib/study/`: pure logic shared by both sides: chunking, quote matching, question validation, local grading, FSRS scheduling, test prep.
- `lib/client/`: browser-only. IndexedDB library and its sync queue, background generation jobs, file extraction, speech.
- `DESIGN.md`: the visual system.

Study data is kept in the browser (IndexedDB) so it works offline, and is synced to your account on the server. Material is also sent with each AI request to the provider you connected. Settings has backup and restore.

Released under the MIT license.
