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
line instead: "6 achievements earned. See History."

Several at once is not the normal case. It happens to an imported account, or
when a new badge ships and the account already passed its rule. Six toasts
stacked up would bury the screen, so past two they become one line.

## The panel

Earned badges carry the day they were earned and a filled orange disc. Locked
ones stay on screen with an empty ring, the rule in plain words, and what they
still take: "40 sessions to go", "best so far: 1 day", "6h 20m of 10h". A
locked badge is never hidden, so the next one is always visible.

Earned and locked differ by shape as well as colour, and each carries a
screen-reader-only "Earned" or "Locked", because state must never be carried
by colour alone.

A streak badge reads the **best** streak, not the current one. A week you ran
is a week you ran, so breaking the streak never takes the badge back.

## Badges are private

The panel asks for the signed-in account's own badges and takes no user id, so
there is no address that reads somebody else's. Nothing in the leaderboard
shows them. There is no endpoint that awards a badge either, so nothing a
browser sends can hand itself one.
