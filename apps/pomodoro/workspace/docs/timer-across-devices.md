# One timer across devices

A focus started at the desk shows on your phone, counting down the same
seconds. Pausing on either pauses both, and a page reloaded mid-focus picks
the focus back up. Signed-in members only: a guest's timer lives in one
browser.

## The session row is the truth

Every start already writes a `focus_sessions` row. While it runs, its
`target_ends_at` says when it ends; while it is paused, its
`accumulated_seconds` says how much was spent. Every open page works the
countdown out from those, the way rooms already do.

- **Pause and resume do their arithmetic on the server's clock**
  (`src/server/pomodoro/live-session.ts`). Pause counts what was spent from the
  row's own end time; resume sets a new end from what was left. The device
  that pressed the button is never trusted for the time.
- **The page corrects for its own clock.** Every answer carries the server's
  time, and the page keeps the difference, so a phone whose clock is a
  minute out still shows the same number as the desk.

## How the other devices catch up

Every open member page asks for the live session every 5 seconds while its
tab is on screen, and once more the moment you come back to it
(`syncLiveSession` in `src/lib/pomodoro/use-pomodoro.ts`). A hidden tab asks
nothing. Polling was chosen over a live connection because one small indexed
read every few seconds is cheap (`focus_sessions_user_active_idx`, migration
`0120`), and it needs nothing kept open per device.

- **A page that already agrees redraws nothing.** Within a second and a half
  of the server's end time counts as agreeing.
- **A press always beats a poll.** An answer that left before you pressed a
  button on this device is thrown away, and so is the answer to a press you
  have since overtaken with another press.
- **A session that ended elsewhere moves this page on the same way.** One
  that finished there sends this page to the next phase and refreshes today's
  count; one that was reset or skipped puts this page back at the start of the
  same phase.

## Two devices at once

- **The last action wins.** Starting a session ends any other session the
  account had live, so a start on the phone while the desk is running leaves
  one session, the phone's. Pausing what another device already paused is not
  an error: the page reads the live session and shows it.
- **Completion counts once.** Both devices reaching zero both ask to record
  it, and the row is only finished while it is still running or paused, so the
  second asks for nothing. That device then refreshes its count rather than
  adding one of its own. Checked with two browsers: one focus, a count of one.
- **Old live rows are cleaned up.** Before this, reloading the page lost the
  timer and left its row paused. When the server sees more than one live row
  for an account, the newest wins and the rest are cancelled, so throwing the
  newest away never brings back an old one.

## What is picked up

A running session up to an hour past its end, so a phone asleep through the
end still finishes it on waking; anything older is left alone and never lands
in today's count. A paused session up to a day old.
