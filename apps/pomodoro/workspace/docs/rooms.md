# Focus rooms

Shared rooms at `/rooms`: several people run one timer, the host drives
the phases, and the server is the only clock.

## Your three rooms

The top of `/rooms` is three columns, drawn to Tyler's design of 7 Oct 2026
(`assets/pasted-image-1791399800306436000.png`), in
`src/components/pomodoro/room-columns.tsx`.

- **My personal room, Room I joined, My hosted room**, left to right. Tyler:
  "Only one of this room should be highlighed because I can only be on one
  room at a time."
- **The room you are in is lit** with an orange border and a "You're here"
  label. Its Open room button goes to `/`, where the room is drawn.
- **The personal room always has a card**, because it can never be deleted.
  It reads "<first name>'s room · Always open · just you". While you are in
  another room it is unlit and its button is Go back to it.
- **Go back to it leaves the room you are in.** It asks first. A member is
  told they go back to their own sound and theme. A host is told leaving ends
  the room, and for how many other people.
- **The room you are in has a Leave button beside Open room.** Tyler, 9 Oct
  2026: "add a leave room button here". It reads Leave room on Room I joined
  and Leave & close on My hosted room, and asks the same question Go back to
  it does, because it does the same thing.
- **A room you are not in is a dashed box** with the way to get one. Room I
  joined has Browse open rooms, which scrolls down to Open to join. My hosted
  room has Host a room.
- **Host a room never disappears.** Tyler, 9 Oct 2026: "The host a room
  button should not disapear here ... it should just tell me on a tooltip".
  The page header and the hosted box both keep it, with a tooltip naming the
  room hosting takes you out of: "Hosting a room makes you leave Manila
  mornings.", or "Hosting a room moves you out of your personal room." Making
  the room leaves the one you were in, on the server. Only a room you already
  host stops it: the header button is then disabled and says "You already
  host <room>. Leave & close it first."

## Open to join on the front page

Tyler, 7 Oct 2026: "add the open to join on the index under the task. If user
is not logged in, that should link to the login page."

- **Under the Tasks card on `/`**, with 40px above it so it reads as its own
  block. The same heading and cards as `/rooms` (`OpenRoomsSection` in
  `src/components/pomodoro/open-rooms.tsx`), read on arrival and every minute
  while the tab is on screen.
- **Join moves you straight into the room.** The front page is your personal
  room, so it then draws the joined room in its place. Leaving puts the timer
  and this list back.
- **A logged-out visitor sees the same Starting soon and Open to join rows**,
  on `/` and on `/rooms`. Tyler, 9 Oct 2026: "Logged out users should be able
  to see the open to join or starting soon rows but clicking on the card will
  take them to the login page". A press anywhere on a card opens the login
  page and comes back to the page it was on. Pointing at a card still plays
  its film. On `/rooms` they see only these rows under a short Sign in card,
  not the room columns or Upcoming.
- **A logged-out visitor's list never carries an account name**
  (`listRoomsForGuest` in `src/lib/api/pomodoro/rooms.ts`, `listPublicRooms`
  with no viewer). A host or member shows their public display name only when
  their profile is public; anybody else is "Member", drawn as initials. Photos
  follow the same rule as for members. It needs no sign-in, so one copy is
  kept for 15 seconds and shared by every visitor.
- **It only shows on the timer.** While you are in a room the front page is
  that room, so there is nothing to join from there.
- **Your own rooms are never in it**, on `/` or on `/rooms`. Tyler, 8 Oct
  2026: "The open to join shouildnt show the room I hosted". The server leaves
  out the room you host and the room you are sitting in (`listPublicRooms` in
  `src/server/pomodoro/rooms.ts` takes the viewer). Both already have their
  own column on `/rooms`. Leave a room and it comes back to your list.
- **Some hosts are made-up accounts** (live activity task 02). Their rooms are
  ordinary rooms a real member joins and is treated in like any other, and the
  worker that runs them never closes a room with a real person in it. See
  "Rooms" in [Made-up members](made-up-members.md).

## How it behaves

- **Browse** shows "Open to join" (waiting or on break) under the three
  columns, three cards across on a wide screen. A room mid-focus is not
  listed, because nobody can join it until its break. Tyler removed the "In
  session" list and the "My rooms" list on 7 Oct 2026. Cards show the faces
  of the people inside (see below).
- **Starting soon comes first, then Open to join, six at a time.** Tyler,
  9 Oct 2026: "Show the 'Starting in ***' first and then 'Open to join'
  follows it" and "Show 6 with a load more". A room whose host started a
  countdown of a minute or more is listed under Starting soon. It shows
  three at most, the soonest ("Only 3 starting in.. shows"); any other room
  counting down stays under Open to join, its card saying "starting in".
  Open to join shows six cards and a Load more button that adds six each
  press. Both on `/rooms` and on the front page (`OpenRoomsSection` in
  `src/components/pomodoro/open-rooms.tsx`).
- **The lists stay current on their own.** While the Rooms tab is on screen,
  the open rooms and the booked ones are read again every minute, and once
  more the moment you come back to the tab, so a room that has closed leaves
  the page within a minute. These reads are quiet: one that fails keeps the
  cards already showing and puts up no toast. A hidden tab reads nothing.
- **An Open to join card**, drawn to Tyler's design of 7 Oct 2026
  (`assets/pasted-image-1791404158696439000.png`, `OpenRoomCard` in
  `src/components/pomodoro/room-card.tsx`), has a tall picture with the LIVE
  VIBE pill, then the host's initials overlapping the picture's foot beside the
  room's name in large type. Under the name: "waiting to start" in green,
  "starting in 1:23" while a countdown runs, or "on break · 3:12" in amber,
  each counting down every second; then the faces of up to three people
  inside and "3 focusing"; then "Next: 25 min focus" beside a black Join
  pill. The dot on the host's picture is green or amber to match.
- **The faces are real.** Tyler, 9 Oct 2026: "this need to show real
  avatars" and "The cards show the avatar". The host and the first three
  people in show their own uploaded photo, or their coloured initials when
  they have none (`PersonAvatar` in `initials-avatar.tsx`). Until that day the
  list sent a count and never names, a rule kept since a real leak; Tyler
  chose to show faces, so `listPublicRooms` now sends the names and photos of
  the people in each public room. The photo follows the profile: somebody who
  switched their profile off, or whose profile an admin hid, shows initials,
  the same rule that keeps their handle from linking. A photo that will not
  load shows initials too.
- **When every room is counting down**, Starting soon holds them and Open to
  join is left out rather than saying "No rooms here yet". A room leaves
  Starting soon the moment its countdown ends.
- **The picture is the room's own scene**, with its sound named in the top
  right corner, so people can pick a room by its mood. A room from before
  rooms carried a pair keeps one of four gradients, picked from the room's own
  id so a card keeps its colour when the list shuffles. The section heading is
  "Open to join" in large type, and an empty list shows a dashed box saying
  so. Upcoming still uses the shorter card.
- **Pointing at a card plays its scene's film.** Tyler, 9 Oct 2026: "hovering
  over the card should play the clip", the same as the theme cards on
  Backgrounds. Only while the mouse is on the card, so a page of cards loads
  no films until one is pointed at; never on a phone, and never with reduced
  motion. A room without a scene keeps its still gradient. The gradients live in
  `src/lib/pomodoro/room-vibe.ts` and the two animations in
  `src/components/pomodoro/theme.css`.
- **Hosting is Pro** (`requirePomodoroPerk("hostRooms")`): name, public or
  unlisted, three durations, auto-start, a sound and a theme. One room per
  person; hosting again or joining another room closes the old one so nobody
  is stranded hostless.
- **A room has its own sound and theme, and both are required.** Tyler, 7 Oct
  2026: "User must select sound and theme." Nothing is picked to start with,
  and Create room stays pressable: pressing it with a pick missing names the
  missing one and marks its field. The picks are the Live sounds and scenes
  in the catalogue, shuffle, or one tag, never an upload. House presets an
  admin keeps come first in the Rhythm picker, and a featured room sits first
  on Browse rooms; see [Rooms in the admin](rooms-admin.md). A host may shuffle
  the room (Tyler, 8 Oct 2026); each device then picks for itself. Everyone in the room gets the pair; see
  [The personal room](personal-room.md).
- **A Rhythm picker fills the timers in one pick.** It lists the three
  built-in presets and your own, from the same list as Settings → Timer, and
  sets focus, short break, long break and auto-start. The boxes stay
  editable; change any one so it matches no preset and the picker reads
  Custom, the timer's own rule. A room always takes its long break after
  four focuses, so a preset's own "long after" count is left out of the match
  and the summary ("50 · 10 · 30 min"). The room stores plain numbers, so
  nothing downstream knows a preset was used. If your own presets fail to
  load, the built-ins are still offered and a line says so
  (`matchRoomPreset` in `src/lib/pomodoro/timer-presets.ts`).
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
  (listed in `src/app/open-endpoints.ts`) and answers a status, a name,
  a member count, and the room's sound and theme, which the page shows as
  the scene's picture and the sound's name. Joining from an invite lands on
  the front page, inside the room.
- **Signing in brings you back.** Signed out, "Sign in" on `/rooms` and "Sign
  in to join" on an invite carry `?redirect=` with the page you were on, so
  after signing in you are on Rooms or on that invite again, not the
  dashboard. Both are router links, so the press does not reload the app. The
  login page only follows a plain path inside the app (`safeRedirectPath`),
  checked again at the moment it navigates, so a crafted link cannot send
  anyone elsewhere. "Create free account" still lands on the dashboard: the
  register page is the shell's and does not read a return address.
- **The front page is the room you are in.** Tyler, 7 Oct 2026: "the index
  page will be replaced with the joined room." Joining, hosting, or opening an
  invite takes you to `/`, which draws the room's panel instead of the timer,
  in the room's sound and theme (`HomeRoom` and `JoinedRoom`,
  `src/components/pomodoro/home-room.tsx` and `active-room.tsx`). `/rooms`
  lights that room's column, with Open room. Leaving puts the timer
  and your own pair back on `/`. The panel names the room's sound and theme;
  the host is pointed at Sounds and Backgrounds to change them.
- **How the joined room is drawn**, from Tyler's design of 8 Oct 2026 ("revamp
  the room a user joined ui to look like this"), top to bottom:
  - **The room's clock as the timer's ring.** The phase in small capitals (green
    while waiting), the time left (the focus length while waiting), then
    "Waiting for Theo to start" for a member, or the host's Start focus /
    Start break and Next phase. A full-screen button sits under them.
  - **The host's rhythm under the ring**, from Tyler's design of 8 Oct 2026
    ("revise the room option set by host"): "1 / 4 sessions", then one chip
    per focus with its length ("25m"; done ones orange, the next one
    outlined, the rest grey), then "5m breaks · 15m long break after session
    4 · set by the host". The host reads "set by you".
  - **One card for the room.** The name with a green dot, and under it the
    phase, "Session 2 of 4" and the sound and theme ("No sound, Lofi girl,
    picked by the host"; the host gets the links to Sounds and Backgrounds
    instead). Copy invite link and Leave room sit on the right as round
    outline buttons; the host has Close room and Leave & close there.
  - **Chat on the left, In the room on the right**, under a line across the
    card. In the room carries the head count, a green dot on each picture, HOST
    in orange and YOU in grey. The snapshot marks your own row (`mine` on each
    member). On a phone the people go under the chat.
  - **A round arrow button after Leave room folds the chat away**, people
    and message box included, and opens it again. Tyler, 8 Oct 2026: "when a
    session start, the chat box automatically collapsed." So the chat folds
    by itself whenever the room enters a focus, and a page opened mid-focus
    starts folded. It only opens again when someone presses the arrow. Folded,
    the chat is hidden, not removed, so a half-typed message survives.
  - **The chat has no day lines.** Tyler, 8 Oct 2026: "remove the date".
    Each message keeps only its time.
  - **The message box runs the card's full width** under another line, with no
    frame of its own. Send is never greyed out; pressed with nothing typed it
    says "Type a message first."
  - **Your Tasks** in a card of their own, the same list and add box as the
    timer (`TasksSection` in `today-task-list.tsx`).
  - **"Looking for another room? Browse rooms."** centred under everything.
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
  roles, chat bodies and the room's sound and theme — never emails or user
  ids. A host changing the pair sends a snapshot like any other change. A viewer whose
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

## Saved rooms are gone

Tyler took the My rooms list off `/rooms` on 7 Oct 2026, and the code behind
it went with it: the list and Leave for good endpoints, and the `saved` flag a
join or a new room used to set. The `room_memberships.saved` column stays,
because stored fields are never removed; nothing writes or reads it now.

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

## Starting in

Tyler, 9 Oct 2026: "there should be a default timer of 5 seconds for hosted
room for everyone until they change it", and joining a waiting room "should
not start right away. It should obey the starting in... timer". Also: "We also
need some sort of indicators that shows the user the starting in... countdown
while they're in the room".

- **Start begins a countdown.** In a waiting room the host's button reads
  "Start in 5 seconds"; beside it, Countdown picks 5 seconds or 1, 2, 3, 4
  or 5 minutes, kept on the room (`rooms.start_delay_seconds`, migration 0132).
  Pressing it sets `starting_at`; the room stays waiting, so people can still
  join, and the ring shows "STARTING IN" with the time counting down for
  everybody in the room.
- **The host can start at once or stop it.** While it counts, the buttons are
  Start now and Cancel.
- **The room starts itself when it runs out.** The request that began it sets
  a timer for that moment, and the room clock's 15-second loop
  (`startCountedRooms` in `src/server/pomodoro/rooms.ts`) covers a restart.
- **Joining never cuts it short**, and joining a waiting room with no countdown
  starts nothing: a real room waits for its host as it always has.
- **Starting from a break** is unchanged: Start focus starts at once, and a
  room with auto-start goes from its break straight into the next focus.
- **Under Starting soon** go rooms counting down a minute or more, the three
  soonest. A 5-second countdown is over before anybody could see it, so it
  stays under Open to join.
- **Made-up hosts keep three there.** Their countdowns run 8 to 15 minutes,
  longer than a real host can pick; why is under "Rooms" in
  [Made-up members](made-up-members.md).
