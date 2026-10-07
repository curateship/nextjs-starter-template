# Focus rooms

Shared rooms at `/rooms`: several people run one timer, the host drives
the phases, and the server is the only clock.

## How it behaves

- **Browse** shows "Open to join" (waiting or on break) and "In session"
  (joins locked until the break). Public cards show member counts, never
  names — the old privacy rule after a real leak.
- **A room card is the old app's card**, rebuilt from its values rather than
  its classes: a 108px gradient banner with a LIVE VIBE pill, a status dot
  and a monospace clock beside the name, the member count, and a row ending
  in the card's one pill button. Green means open, orange means locked. Four
  gradients, picked from the room's own id so a card keeps its colour when
  the list shuffles. A group with no rooms shows a dashed box saying so.
  The pieces live in `src/components/pomodoro/room-card.tsx`, the gradients
  in `src/lib/pomodoro/room-vibe.ts`, and the two animations in
  `src/components/pomodoro/theme.css`. The page is 860px wide with 36px
  between its groups, which are the old app's numbers for this screen.
- **Hosting is Pro** (`requirePomodoroPerk("hostRooms")`): name, public or
  unlisted, three durations, auto-start. One room per person; hosting
  again or joining another room closes the old one so nobody is stranded
  hostless.
- **The dialog's three minute boxes are the shared ones**,
  `RhythmMinutesFields`, the same component the Settings card and a custom
  preset use. [Timer settings](timer-settings.md) has what they do. Two
  things this fixed here: clearing a box used to read
  `event.target.valueAsNumber` with no guard, which killed the Create room
  button with no message; and the boxes' ids were built from their labels, so
  `room-Focus minutes` had a space in it and the label above pointed at
  nothing. The ids are now `room-focus`, `room-short` and `room-long`.
- **Create room is pressable with a box empty.** The field keeps the last good
  number, so the press creates the room with that rather than going dead.
- **Invite links** live at `/rooms/$slug` (the `rooms_` route file keeps
  it from nesting under the browse page — the old routing trap) with the
  old seven states: checking, failed, not found, closed, banned, already a
  member, locked mid-focus, joinable. The lookup endpoint works signed out
  (listed in `src/app/open-endpoints.ts`) and answers a status, a name and
  a member count only.
- **Signing in brings you back.** Signed out, "Sign in" on `/rooms` and "Sign
  in to join" on an invite carry `?redirect=` with the page you were on, so
  after signing in you are on Rooms or on that invite again, not the
  dashboard. Both are router links, so the press does not reload the app. The
  login page only follows a plain path inside the app (`safeRedirectPath`),
  checked again at the moment it navigates, so a crafted link cannot send
  anyone elsewhere. "Create free account" still lands on the dashboard: the
  register page is the shell's and does not read a return address.
- **Host actions**: start focus, start break, next phase, close (with
  confirmation). Hosts move through the canonical sequence only; the 4th
  focus earns the long break; a break returns to focus (auto-start) or to
  waiting.
- **The server is the only clock.** The old app queued one delayed job per
  phase; this shell runs one fifteen-second loop, so
  `advanceDueRooms` (registered as the `pomodoro-room-clock` worker in
  `src/app/server-options.ts`) claims every expired phase and advances it.
  The sequence guard is unchanged: any manual host action bumps the
  sequence and a stale claim no-ops. Phases advance with every browser
  tab closed.
- **Live updates by SSE** (`/api/pomodoro/rooms/$slug/events`): the server
  LISTENs on the room's pg_notify channel and sends a full snapshot on
  every change; the client reconnects on drop and recomputes the
  countdown locally from server timestamps, so the clock's up-to-15s
  advance lag never shows on the ring. Snapshots carry display names,
  roles and chat bodies — never emails or user ids. A viewer whose
  membership ends gets `room_gone`.
- **A host leaving closes the room for everyone**; a member leaving only
  ends their own membership.
- **"Leave & close" asks first**, the same way Close room does, because the
  two end the room for everyone in exactly the same way. The question says how
  many other people are in the room: "The session stops for the 3 other
  people in it, and it cannot be undone." A host alone in the room is still
  asked, since the room still ends, but is told nobody else is affected.
  Cancel leaves the host in the room with the clock running. A member's
  "Leave room" closes nothing and still acts on one click.
- **Join is pressed once.** While a join is out, every Join button on the page
  is disabled and the pressed one reads "Joining…" with the spinner. A second
  press, or a press on another card, sends nothing. Join, Host a room, Locked
  and the booked-room buttons are all the shared `Button` at the standard
  32px height, in the theme's own orange (`bg-primary`, `border-primary/40`,
  `bg-primary/10`), not a pasted colour.
- **What the page tells you after an action is a toast**, not a line at the
  top of the page. A room you left, a room you closed, a booking made and a
  booking cancelled are success toasts that clear themselves. Failures use
  the persistent error toast, which stays until dismissed or until the next
  attempt starts. Nothing is left over from an earlier action.
- **A room ending is announced once.** Your own "You closed the room." and the
  broadcast's "This room has ended." share one toast per room, so whichever
  arrives second replaces the first instead of stacking, and a broadcast
  never overwrites the reason your own action gave.
- **A refused join is also written on the room's own card**, under its
  button, for example "That room is mid-focus. Join again during its break."
  The next join clears it.
- **If the page cannot check whether you are already in a room**, it says so
  in a card with Try again, and the list of rooms stays hidden. Showing the
  list on its own would tell somebody sitting in a room that they had left
  it. Try again asks again, and the room panel comes back if you are in one.
- **Chat, reactions and moderation** sit inside the room panel and have
  their own doc: [Room chat and moderation](room-chat-and-moderation.md).
- **A room can be booked for a later time** instead of started now, in which
  case it has an eighth phase, `scheduled`, and opens itself on its own
  clock: [Scheduled rooms](scheduled-rooms.md).

## What everyone is working on

- **A member can show the task they are focusing on**, beside their name in
  the room's member list. The switch is "Show my task to people in my room" in
  Settings → Profile, off for everyone until they turn it on, because a task
  title can name a client.
- **Only a focus that is counting down shows.** The room reads the person's
  newest focus that is running and whose end time has not passed, and its
  task. A paused focus shows nothing, because paused sessions are left behind
  for days when a tab closes. A focus with no task picked shows nothing.
- **The room's own ring does not start your timer.** The task appears only
  while your own timer on the Timer screen runs a focus with a task picked.
- **The room hears straight away.** Starting, pausing, resuming, finishing or
  resetting a focus, and saving the switch, sends the room a fresh snapshot.
  Turning the switch off takes the line away on that snapshot.
- **Nobody outside the room sees it.** The title rides only on the room
  snapshot, which only members receive, and never on a browse card or invite
  page. User ids still never leave the server.

## My rooms

- **Every room you join or host stays on My rooms** at the top of `/rooms`,
  so a group that meets every week finds its room again without the link.
  Joining from Browse, from an invite link, or hosting all count.
- **Saving is not joining.** It is a `saved` flag on the membership, and the
  rule that you are in one room at a time is untouched. The list shows "You
  are in it", "Open to join" with a Join button, "In session" with Locked, or
  "Ended" with the day.
- **A closed room drops off 30 days after it closed**, by itself. Tyler chose
  this on 6 Oct 2026 over keeping closed rooms until somebody removes them.
- **Leave for good takes a room off the list.** Pressed from inside the room,
  it leaves the room too, by the same rules as Leave, so a host leaving still
  ends it for everyone. That case asks first. Joining again puts the room
  back.
- **A room you were banned from never shows**, and neither does a room whose
  host is across a block with you.
- **The list starts empty.** Memberships from before 6 Oct 2026 were not
  marked saved, so old one-off rooms do not flood it.

## Who you focus with

- **The Leaderboard has a card listing the five people you share the most
  room time with** over the last 12 months, with the hours.
- **The time is the overlap of your two memberships in the same room**, added
  up across rooms. A membership still open counts up to now.
- **Both of you must be on the leaderboard.** Somebody without "Show me on the
  leaderboard" and a display name is named to nobody and sees nobody, and the
  card tells them which switch to turn on. Display names only.
- **The read is bounded.** One query starts from your own memberships of the
  last year on the user and date index, then matches the others per room.
- **A membership counts until it ends.** Somebody who leaves a room open in a
  tab for two days is counted for two days, because the membership row does
  not know when the screen was last looked at.

Server logic: `src/server/pomodoro/rooms.ts` (ported nearly whole from the
old app). Endpoints: `src/lib/api/pomodoro/rooms.ts`. Tables (rooms,
memberships, messages, reactions, bans, reports and the session room
link): migration `0089_pomodoro_rooms.sql`. The task switch, the `saved` flag
and the "focused with" index: `0116_pomodoro_rooms_that_stick.sql`.

## Notices

The host hears in the bell when somebody joins while the host is away from the
room, folded per room. Followers of the host hear when a public room opens, at
most three a day, and the notice disappears if the room closes before they read
it. Opening your room from the Rooms page marks that room's notices read. The
live connection that keeps a room on screen is also what tells the server you
are looking at it, and it is held only while the tab is visible. See
[Notifications](notifications.md).
