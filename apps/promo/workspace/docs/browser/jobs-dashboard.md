# The Jobs dashboard

**Jobs** (`/admin/jobs`), last under Projects in the left menu, shows whether
the browser program is running, and lists every job it is doing, waiting to
do, or did lately.

Tyler asked for it on 13 Oct 2026: "should there be jobs visible somewhere in
the settings so I can see what's running?" His searches had sat waiting since
the evening before, with the keyword chip spinning, because the program that
runs them was not running. Nothing on screen could say so. It started as a
Settings tab, and the same day he asked for it to be "its own route and put it
under projects". The menu link is added by `drizzle/0113_promo_jobs_menu.sql`.

## Why there is a program to watch

Every search, post read, rules read, comment, warm-up and health check is a
row in `promo_jobs`. Pressing a button only adds the row. A separate program,
started with `npm run social:browser`, opens the browsers and works through
the rows ([Why it runs in its own process](isolated-sessions.md)). The website
runs without it, so a stopped program is invisible unless something says so.

## Is it running

The program checks in every 15 seconds, writing the time to
`promo_browser_program`, one row per running copy
(`drizzle/0112_promo_browser_program.sql`). It counts as running while its
newest check-in is under two minutes old (`PROGRAM_STALE_MS` in
`src/lib/social/job-words.ts`). Two minutes is eight missed check-ins, so one
slow database answer never reads as a stop.

- **A copy stopped cleanly** deletes its own row on the way out.
- **A copy that was killed** leaves its row, which goes stale and reads as
  stopped. The next copy to start deletes rows over a day old.
- **The first card** on the dashboard says "Running since today at 9:36", or "Not
  running, so nothing is searched, read or posted. 22 jobs are waiting." in
  red, with how to start it: open a terminal in `apps/promo`, run
  `npm run social:browser`, and leave the terminal open. The command reads
  `.env.local` itself (`node --env-file-if-exists`), so it finds this app's
  database; before 13 Oct 2026 it did not, and on this Mac it looked for a
  database on port 54320 that is not there.
- **The Projects dashboard** reads the same answer through its job counts
  (`programRunning` on `JobCounts` in `src/server/social/jobs.ts`). While the
  program is stopped and jobs wait, it shows a red line under the keyword chips
  linking here (**See the jobs**), and a waiting chip says "· waiting" instead of spinning.

## The list

Three tabs: **Running and waiting** (oldest first, the order they run in),
**Done** in the last day, and **Failed** in the last week (both newest first).
Each row says what the job does and what it is about, who it works as and in
which browser profile, and where it has got to:

- **Waiting. The browser program is not running.** when nothing will start it.
- **Waits until today at 15:00** for a job held for later, such as a comment
  pressed outside the account's waking hours or the daily warm-up.
- **Waits for the job ahead of it in the same browser**, because one browser
  runs one job at a time.
- **Try 2 of 3 next. Last try: …** after a failed go that will be tried again.
- **Running for 1m**, **Done**, or the reason a job failed.

A search for a keyword that has since been removed says "a keyword since
deleted": the job outlives the keyword. When it runs it fails at once with
"That keyword is no longer saved.", on the first try rather than three
(a refusal, in `src/server/social/reddit/search.ts`). A post read for a
deleted post does the same.

## Cancel and Try again

- **Cancel**, on a row or for ticked rows, takes waiting jobs off the queue. A
  running job is never stopped part-way, because a comment half typed may
  already be on Reddit; it is counted as "already running" and left alone.
- **Try again** puts a failed job back on the queue for a fresh three goes. It
  is offered only for jobs that read. A comment, an answer, a post of your own,
  a delete or an edit may have reached Reddit before it failed, so those are
  tried again from the Comments screen's Failed tab, where the words go back in
  the box and Post still needs a press.

The list loads with the page, then is read again every five seconds while the
page is open.

## Where the code is

- `src/routes/_authenticated/admin/jobs.tsx`: the page.
- `src/components/social/jobs/jobs-dashboard.tsx`: the card and the table.
- `src/server/social/job-list.ts`: the list, Cancel and Try again.
- `src/server/social/browser-program.ts`: check-in, check-out and the reading.
- `worker/src/social-browser.ts`: checks in each time it matches its lanes to
  the open-browser limit and the phones-working limit, every 15 seconds. Phone
  jobs run in this same program, on lanes of their own
  ([Jobs on phones](../phones/phone-jobs.md)).
- `src/lib/social/job-words.ts`: every sentence the dashboard shows.
