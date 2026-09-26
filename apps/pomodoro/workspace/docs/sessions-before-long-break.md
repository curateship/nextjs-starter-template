# Sessions before the long break

How many focuses earn the long break is part of the rhythm, not a fixed four.
Classic still takes it after four. Deep Work takes it after two, because four
fifty-minute blocks before a proper rest is the thing people give up on.

## What you can set

- **The range is 2 to 8, and the default is 4.** Two is the smallest cycle that
  still has a short break in it. Above eight a "long break" stops meaning
  anything.
- **Settings → Timer has the field**, under the daily goal: "Sessions before
  long break". It saves with the rest of the card's Save focus rhythm button.
- **Every preset carries its own number**, built-in and custom alike, and the
  preset editor has the same field. Applying a preset copies its number into
  your saved rhythm the same way it copies the three durations.
- **A preset only counts as matched when its number matches too.** Two presets
  that differ by nothing else are different presets, so the picker says
  "Custom" rather than naming the wrong one.

## What the timer does with it

- **The cycle reads the saved number** instead of the old constant
  (`advanceCycle` in `src/lib/pomodoro/use-pomodoro.ts`). On a rhythm of two,
  the second finished focus goes to the long break and the count starts again.
- **The dashboard says where you are:** "Session 2 of 2 before the long break"
  while focusing, "Next: session 1 of 2 before the long break" on a break. The
  wording comes from `cycleSessionLabel` in `src/lib/pomodoro/timer.ts`.
- **The long break's own hint follows the number.** The old app's line ended
  "before the next block of four"; it now ends with whatever the rhythm says.
- **Changing the number works the position out again** from today's finished
  focuses against the new number, because a count of three under a rhythm of
  four is past the end of a rhythm of two. Three focuses done and a new rhythm
  of two puts you one focus into the second cycle. That is the same sum every
  page load does, so the two can never disagree. Today's total, the goal and
  the streak are untouched: they count finished focuses, not cycles.
- **A finished focus is still a finished focus.** The number changes when the
  long break arrives, nothing about what gets recorded.

## Where it is stored

- `user_preferences.sessions_before_long_break` is the rhythm running now, and
  `user_timer_presets.sessions_before_long_break` is the one a preset applies.
  Both default to 4 and both are held to 2-8 by a check constraint, so a
  request that gets past the form still cannot write 1 or 99. Migration
  `0099_pomodoro_sessions_before_long_break.sql`.
- **A guest keeps it in the browser** with the rest of the guest snapshot, and
  the one-time import carries it to the account on the first sign-in.
- **A row saved before the number existed reads as 4** rather than being thrown
  away (`normalizeSessionsBeforeLongBreak`). That matters for a guest's saved
  presets, which are plain JSON in browser storage: the durations they were
  saved with still work and the cycle falls back to the classic pattern.

## What still uses four

Focus rooms keep the fixed four (`FOCUS_PERIODS_PER_CYCLE` in
`src/server/pomodoro/rooms.ts`), so a room's "Session 3 of 4" is unchanged. A
room's cycle is shared by everyone in it and is set when the room is made, so
it is its own decision rather than a copy of the host's solo rhythm.
