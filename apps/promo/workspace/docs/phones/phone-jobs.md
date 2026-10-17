# Jobs on phones

A Reddit account on a phone has its comments and health readings run on that
phone, through the same job list browser accounts use. Its searches and
thread reads run in the signed-out reader browser, as every account's do. The rules that keep Promo safe live in that list, so they hold
for phones without being written twice: nothing posts without a person
pressing Post, and a comment is never tried twice.

## How a job reaches the phone

- **Filed under the phone.** A job for a phone account is filed under the
  lane `phone:` and the phone's id, where a browser account's job is filed
  under its profile. A job filed somewhere else (from before lanes, or from
  before the account moved) is filed again where the account now runs before
  anything happens.
- **The same steps, on the phone.** The runner takes the account's job the
  same way for both. Where a browser account opens its browser, a phone
  account's Reddit steps (`reddit/health`, `reddit/comment` and the rest) are
  written as actions for the phone's rack and waited on. The answers are
  checked against the same shapes as a browser's, so nothing above that layer
  knows which one it was.
- **What the Reddit app does:** who is signed in, the health reading and the
  comment, since phone farm file 05 ([Reddit on phones](../reddit/reddit-on-phones.md)),
  and reading and answering its chats since file 06.
- **What Instagram and TikTok do,** on phones only: who is signed in, the
  daily reading, the profile, a post, and reading and answering messages and
  comments ([Instagram and TikTok accounts](../instagram/accounts-and-the-daily-reading.md)).
  A Reddit step for an Instagram or TikTok account, or a post of photos for a
  Reddit one, is refused before anything reaches the phone.
- **Who is signed in, after each job,** is read in the app the job worked in
  only, for the account the job ran as. A phone may carry a Reddit, an
  Instagram and a TikTok account, and opening all three apps after every job
  is not what a person does.
  Any other Reddit step on a phone account, such as answering a reply or a
  post of your own, is refused when its button is pressed, with words such as
  "u/name's phone cannot do answering a reply yet", and again before anything
  reaches the phone.
- **The daily health reading includes phone accounts,** Instagram's and
  TikTok's among them. The daily warm-up still skips them: it reads a browser
  profile's clock and label.

## One at a time per phone, side by side across phones

- **One phone, one job at a time,** in order, the same as a browser profile.
  The rack is also handed one action per phone at a time.
- **A job's hold on the queue** lasts 10 minutes, after which it counts as
  abandoned. A post, a profile change, an answer, a health reading and a read
  of an inbox get 25 minutes, because a phone action may wait five minutes
  behind the phone's other actions before it starts.
- **Different phones work together.** The program on the rack computer runs
  each action on a thread of its own.
- **Phones have their own limit,** separate from the browsers: "Phones working
  at once" in Settings → Phones, 5 at first. The browser program runs one lane
  per allowed phone beside its browser lanes, and a phone lane only ever takes
  phone jobs, so a comment waiting on a phone never holds a browser's place.

## When a phone job waits, and when it fails

- **Offline fails at once,** with words such as "Pixel 8a in slot 4 is offline:
  Not plugged in. Nothing was sent." Nothing waits on a phone that is not
  there, and a comment is never tried again.
- **A held phone's jobs wait,** untouched, until it is released. That includes
  a phone a person controls from its screen window.
- **A paused rack's jobs wait.** The switch on the Phones dashboard pauses every
  phone job; jobs already running finish. The bell says "The rack is paused"
  until it is resumed. Resuming lists the phone jobs that waited, oldest
  first, with a tick to drop each; only ticked ones are dropped.
- **Waking hours.** In a browser, a health reading may run at any hour. On a
  phone every job waits for its account's waking hours (Settings → Behaviour),
  because any job lights the phone's screen and the screen stays off while its
  account sleeps. The hours are read on the phone's own clock, which the rack
  reads on every check-in.
- **Time limits.** Each action carries its own: five minutes for a check, the
  browser's own limits for a Reddit step (fifteen minutes for a comment
  visit), counted from when the rack starts it. An action still waiting its
  turn behind the phone's other actions (a setup check someone asked for) is
  called off after five minutes, before anything touched the phone. Once
  started it is never called off early, so a comment is never recorded as
  failed while the rack is still typing it.
- **A freeze.** The rack reopens a frozen app or restarts a phone that stopped
  answering, and fails the step. A reading is put back for another go; a
  comment, an answer or a post is never sent again.
  [Freezes and ban screens](freezes-and-ban-screens.md).
- **A ban screen stops the account.** Its waiting jobs on the phone are
  dropped, the job that found it is not tried again, and its new jobs are
  refused until a person lets it run again.
- **A broken action is refused.** A step the daily self-test found broken is
  refused before anything reaches the phone, and the job is not tried again.
  A comment is refused too until the self-test has passed it at least once.
  [The self-test and app updates](self-test-and-app-updates.md).
- **A Wi-Fi phone shows its proxy's address or nothing goes out.** Before every
  job the rack reads the address apps see; the house's address, or one that is
  not the proxy's, refuses the job and stops the phone until a check finds the
  proxy's again ([making each phone look like one person's](looking-like-a-real-person.md)).

## Settings → Phones

Two numbers that save as they change, and a pick that saves at once, with no
Save button:

- **Phones working at once,** 1 to 50.
- **Days pictures are kept,** 1 to 90. A finished action's step pictures go
  after these days; a failed one's stay until cleared
  ([a picture of every step](step-pictures.md)).
- **Self-test phone:** the spare phone the daily self-test runs on, or none.
  A phone that runs an account is refused.

A value outside those is refused saying what is allowed. The pause switch is on
the Phones dashboard, where the phones are. Waking hours and the warm-up apply
to every account, so they stay in Settings → Behaviour.

## Where it is

- The queue: `claimNextJob` and `laneFor` in `src/server/social/jobs.ts`, with
  the phone and browser pools.
- The runner: `src/server/social/runner.ts`, which hands a phone account's job
  to `phoneForJob` in `src/server/phones/phones.ts` and runs its steps with
  `callPhone` in `src/server/phones/dispatch.ts`, reached from
  `src/server/browser/command.ts`.
- The lanes: `worker/src/social-browser.ts`.
- The settings and the pause: `src/server/phones/settings.ts`, the tab
  `src/components/phones/phone-settings.tsx`, the resume question
  `src/components/phones/resume-rack-dialog.tsx`.
- The tables: `promo_phone_settings`, `promo_phones.time_zone` and
  `promo_phone_actions.timeout_seconds`, from
  `drizzle/0115_promo_phone_jobs.sql`, which also widens `promo_jobs.lane` to
  64 letters for the phone lanes.
