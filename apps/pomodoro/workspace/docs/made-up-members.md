# Made-up members

Pomoder can fill itself with made-up member accounts that focus every day, so
a visitor finds people on /users, names on the leaderboard and hours on the
front page. They are ordinary accounts in every table a member's screen reads,
so they show everywhere a real member shows. Only the admin can tell them
apart.

Tyler asked for this on 9 Oct 2026: "I need to create a task that auto
populate the app with users so that the app appears more busy", and then "We
just need real accounts that mimic live activities." Rooms, chat, follows and
the admin's controls over all of it are tasks 02 to 05 in
`workspace/tasks/live-activity/`; this page covers the accounts and their
working days.

## Tyler's rules

His decisions, 9 Oct 2026. They outrank the code.

- **Forty to start**, each focusing two to four hours a day.
- **The busiest never over three hours a day**, so a real member can reach the
  top of the leaderboard.
- **Timezones spread across the world**, so somebody is always "Online now".
- **Two to three months of history when they are made, never more.** Tyler, 9
  Oct 2026: "Since its a new app, we don't want there to be stats dating back
  too far. Make it date back about 2-3 months". This replaced his first
  decision the same day, ninety days with a full year for a dozen.
- **Nobody can sign in as one and no email ever goes to one.**
- **The admin lists mark them** so Tyler can tell them apart. **Real members
  never see any mark.**
- No line about them on the Terms page (declined, 9 Oct 2026).

## The tab

Settings → App settings → Made-up members, at
`/admin/settings/pomodoro-made-up-members`. Like every Pomoder settings tab it
saves itself with no Save button ([Admin settings](admin-settings.md)).

- **The count line** says "6 made, 2 focusing now". While a batch is being
  made it says "32 of 40 made" and reads the count again every 3 seconds.
- **How many** (0 to 200, 40 to start) is how many there should be. Lowering
  it never removes anybody; it only stops new ones.
- **Hours a day** (1 to 6, 3 to start) is the most any of them focuses in one
  day. No account ever plans more, and the worker shortens or skips a session
  that would take today past it, even on a day the number was lowered half way
  through.
- **Pause everything** stops the worker starting new sessions and stops new
  faces arriving. Sessions already running finish. Make them now still works.
- **Make them now** queues the work and answers at once. The worker makes up
  to ten accounts every 15 seconds until the count is met, so forty take
  about a minute and a half-made batch is harmless. Measured locally on 9 Oct
  2026: six accounts in 6 to 12 seconds. With the count
  already met it says so and makes nothing.
- **Remove all** asks first ("Removes 40 made-up accounts and everything they
  did. Real members are untouched.") and then deletes every account named in
  `pomodoro_simulated_accounts`, with everything they own. It never picks
  accounts by email address. It also cancels a Make them now still going.
- **Every press is in the audit log**, resource `simulated`:
  `simulated_make`, `simulated_remove` (with every id removed) and
  `simulated_pause`. How many and Hours a day write `setting_simulated.accounts`
  like any setting.
- **Nothing is ever made by itself before the first Make them now.** A fresh
  database or a deploy makes no accounts.

## What a made-up account is

- **A row in `pomodoro_simulated_accounts`** (migration 0129) is the only thing
  that says an account is made up. `users` is a shell table and has no column
  for it. The row holds the habit (below), a one-line personality for the room
  chat in task 03, and `claimed_at` for the worker.
- **A shell account with no password.** Nothing typed can match a missing
  password, so sign-in always fails. The email is
  `<handle>@simulated.pomoder.com`. The address counts as confirmed, which is
  what stops the shell's "confirm your address" reminder.
- **Written by Pomoder itself, not by the shell's "add a person".** The shell's
  `createAccountByAdmin` emails a set-your-password link when there is no
  password, and the shell's delete emails an "account closed" receipt. So
  `src/server/pomodoro/simulated-accounts.ts` writes the account row itself and
  Remove all deletes the rows itself, the same delete the shell's purge runs.
  No password link is made and nothing is queued to send.
- **A public profile with every switch on**: public, listed on /users, on the
  leaderboard, figures, badges, year grid, projects, "Focusing now", room, and
  the task shared in rooms. Cheers are on.
- **A name, handle and bio that fit one place.** Nineteen cities from Lisbon to
  Auckland, each with its own first names, surnames and side projects, in
  `src/lib/pomodoro/simulated-people.ts`. A new account goes to whichever city
  has fewest so far, so forty land two or three to a city. The display name is
  the full name, the first name and an initial, or the first name alone. No two
  accounts share a name, and a handle that is taken or reserved tries another
  shape and then gets digits.
- **Coloured initials, no photo.** The shell only lets an account use a
  picture it uploaded itself.
- **A banner** from the free Live themes, and **up to three pinned badges** from
  the ones its history earned.
- **Three to five projects**, two of them public, from the person's work and
  their city ("Moot court", "Client memo", "Surf trip plan"), so the profile's
  "This week's work" has something to show and the admin Projects page lists
  them.

The names, bios and projects come from the bundled list. The task file also
asks for names and bios written by the AI when the key from task 03 is set;
task 03 is not built, so that branch does not exist yet.

## The working day

A habit is a small piece of JSON per account: timezone, start hour (between
7am and 1pm local), hours a day (2 to 4), days off (most take the weekend and
some a weekday as well), the range a session is drawn from (such as 20 to 55
minutes) and the range a break is drawn from (such as 5 to 20).

`planSimulatedDay` in `src/lib/pomodoro/simulated-days.ts` turns a habit and a
date into that day's sessions and tasks. A day is worked out, never stored: the
same account and date always give the same day. That is why the history
written when an account is made and the worker that runs today follow the same
rules, and why a worker that restarts mid-day carries on where it was.

- **Every session is drawn fresh** from the habit's range, and the gaps too,
  with a lunch break most days. Two days never look the same and nobody runs
  25-minute sessions back to back.
- **A day lands near its hours.** A three-hour habit gives between 2.5 and 3
  hours under a cap of three. The last stretch is folded into the last session
  rather than left as a ten-minute stub.
- **One to three tasks a day** from the person's own titles ("Draft the Q3
  deck", "Reply to Ana's notes"). Each task takes a run of the day's sessions;
  most are ticked after their last session and now and then one is left over.
- **Lives change.** Each month the start moves by up to two hours either way
  and the hours move a little, inside the cap. One month in eight has a week
  off. One account in twenty goes quiet for a whole month. About one working
  day in fourteen is skipped for no stated reason. Over three months at most
  half the accounts keep an unbroken streak.
- **Every city works in its own daytime.** A Tokyo account focuses in Tokyo's
  morning and afternoon.

## The worker

`pomodoro-simulated-days` in `src/app/server-options.ts`, ticked every 15
seconds with the app's other workers.

- **Once a minute** it claims every made-up account with `FOR UPDATE SKIP
  LOCKED` and a five-minute `claimed_at` timeout, so two server copies never
  look after one account at once. For each one it finishes any session whose
  time is up through the timer's own `completeProductivitySession`, ticks the
  task when the day says so, and checks badges with `awardAchievements`, the
  same calls a real member's finished focus makes. Then, unless paused, it
  starts the session the day says is due through `startProductivitySession`.
  Each planned session has its own key (`simulated:<date>:<n>`), so it can
  only ever be started once.
- **Every tick, while Make them now is going**, it makes up to ten accounts.
  Making and Remove all share one database lock, so Remove all can never race
  a half-made batch.
- **While the count is under How many and no batch is going**, a new face
  arrives three to five days after the newest one, so one or two a week. A new
  face joins today with no history, so it tops the Newest tab on /users.
  An account from Make them now joins one to seven days before its history
  starts, so "member since" agrees with its year grid.

## The history

When Make them now makes an account it writes every day before today, using
the same day plan: completed sessions, the day's tasks (ticked or left over),
and the day rows that the leaderboard, the year grid, streaks and History
read. Days off stay empty, so the year grid has gaps. Each account's history
goes back a number of days drawn between 60 and 90 (`HISTORY_MIN_DAYS` and
`HISTORY_MAX_DAYS`), so no account looks older than the app.

Badges are written straight into `pomodoro_achievements`, dated the day the
running totals crossed each badge's line, never today, and with no bell
notice.

## What the admin sees

- **"Made up" beside the name** on every Pomoder admin list that shows a
  member's name (Focus, Profiles, Leaderboard, Projects, Sessions, Rooms and
  the rest, through `MemberName` in `admin-member-name.tsx`) and in the member
  window's title. The list of made-up ids is read once per page and again
  after a minute.
- **The shell's own admin pages do not carry the mark**: the Users list, the
  admin dashboard's member counts and the AI usage page count them as members.
  Task 05 adds a way to leave them out.

## What is left and what to watch

- **Somebody could type a made-up address into Forgot password.** The shell
  sends a reset or sign-in link to any active account, so a link would go to
  `<handle>@simulated.pomoder.com` and bounce. It takes a person guessing the
  address and passing the human check. Stopping it needs a shell option, and
  the shell is not changed without asking first.
- **/users is held for five minutes.** Remove all clears the held pages at
  once on the server it ran on. Accounts the worker makes in production show
  within five minutes, because the worker is a separate program.
- **A real member can block one of these accounts.** Nothing here needs to
  care; task 04 does.
