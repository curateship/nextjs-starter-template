# Achievements

Badges for milestones. Ten of them, shown in a panel at the top of
`/history`, above the focus report.

## The ten badges

Four for sessions: one, ten, fifty and a hundred finished focus sessions.
Three for streaks: three days, seven days and thirty days in a row. Then ten
hours of finished focus, fifty tasks ticked off, and opening a focus room of
your own.

The list lives in code, in `src/lib/pomodoro/achievements.ts`. A badge is a
promise the app made, so it belongs with the code that made it. The database
stores only the fact that someone earned one and the day they did.

Two things follow from that. Renaming a badge is free, and changing its `id`
is not, because the `id` is what is stored. And adding a badge later needs no
migration: an account that already passed the new rule earns it the next time
one of its counters moves.

## When a badge is awarded

When the number it counts changes, never by a job that scans accounts.

- A focus session finishing. That is where the session count, the hours and
  the streak all move, so the check runs in the completion endpoint in
  `src/lib/api/pomodoro/productivity.ts`.
- A focus room being opened, in `src/lib/api/pomodoro/rooms.ts`.

Both call `awardAchievements`, which offers every badge the current counters
satisfy and lets the database drop the ones already on record.

## Why it can only be awarded once

The unique index `pomodoro_achievements_user_badge_unique` is what makes that
true, rather than a read-then-write check in the code. The insert offers every
earned badge with `on conflict do nothing`, and what comes back is exactly the
badges that were new. So a hundredth session reported twice, or two tabs each
finishing one, still leaves one row carrying the first date, and you are
congratulated once.

Checked on 25 Sep 2026: an account seeded to 99 sessions finished one more,
the badge row appeared once, the next finished session added nothing, and the
panel read "Earned Sep 25, 2026".

## A failed award never fails the thing that earned it

By the time the check runs, the session or the room is already committed. If
awarding threw, the member would be told their session failed to sync and
would lose the counts the answer carries, to save a badge the next finished
session awards anyway. So both paths catch and carry on.

## The toast

Earning one badge shows a toast naming it. Earning several at once shows one
line instead: "6 achievements earned."

**Every badge toast has a See it button.** Off History it opens History; on
History it scrolls to the Achievements card instead of loading the page again,
and it closes the toast either way. It is a real button, so Tab reaches it. The
toast used to say "See History." with nothing to press
(`src/lib/pomodoro/achievement-toast.tsx`).

Several at once is not the normal case. It happens to an imported account, or
when a new badge ships and the account already passed its rule. Six toasts
stacked up would bury the screen, so past two they become one line.

## The bell

The badges one finished focus earns also arrive in the bell as one notice,
under the Account tab, leading to History: the badge's name for one, a count
with the names underneath for several. It is written in the same transaction as
the badge, so a badge recorded once is announced once. See
[Notifications](notifications.md).

## The panel

Earned badges carry the day they were earned and a filled orange disc. The
day is written "Earned Tue, Oct 6, 2026", the long form History uses, and it
is the day in the account's timezone: the endpoint returns that timezone
beside the badges so a browser elsewhere cannot shift it. Locked
ones stay on screen with an empty ring, the rule in plain words, and how far
they have got: "62 of 100 sessions", "best so far: 4 of 7 days", "6h 20m of
10h", with a small bar showing the same thing. The bar is the shared `Meter`
and is read aloud as "Progress towards Ten sessions, 7 of 10 sessions"; the
printed count beside it is hidden from screen readers so it is not read
twice. A locked badge is never hidden,
so the next one is always visible.

The count and the bar both come from `achievementProgress` in
`src/lib/pomodoro/achievements.ts`, beside the rules rather than in the panel,
so the rule and the progress read the same threshold and can never disagree.
The count beside the bar is the real answer, because progress must never be
carried by a drawing alone.

The count never reads past what the badge takes. A counter can sit past a
threshold while the badge still reads as locked, because the award row is
written after the counter moves and a failed award waits for the next finished
session. "105 of 100" under a locked badge reads as a bug, so the panel says
"100 of 100" and fills the bar.

Earned and locked differ by shape as well as colour, and each carries a
screen-reader-only "Earned" or "Locked", because state must never be carried
by colour alone.

A streak badge reads the **best** streak, not the current one. A week you ran
is a week you ran, so breaking the streak never takes the badge back.

## When the panel fails to load

The panel says "Your achievements could not be loaded" inside its own frame,
with Try again, which asks again without reloading the page. It used to be a
red line with no way out. A load that works takes the warning down.

## Badges are private

The panel asks for the signed-in account's own badges and takes no user id, so
there is no address that reads somebody else's. Nothing in the leaderboard
shows them. There is no endpoint that awards a badge either, so nothing a
browser sends can hand itself one.
