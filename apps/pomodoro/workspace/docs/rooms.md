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
- **Invite links** live at `/rooms/$slug` (the `rooms_` route file keeps
  it from nesting under the browse page — the old routing trap) with the
  old seven states: checking, failed, not found, closed, banned, already a
  member, locked mid-focus, joinable. The lookup endpoint works signed out
  (listed in `src/app/open-endpoints.ts`) and answers a status, a name and
  a member count only.
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
- **Chat, reactions and moderation** sit inside the room panel and have
  their own doc: [Room chat and moderation](room-chat-and-moderation.md).
- **A room can be booked for a later time** instead of started now, in which
  case it has an eighth phase, `scheduled`, and opens itself on its own
  clock: [Scheduled rooms](scheduled-rooms.md).

Server logic: `src/server/pomodoro/rooms.ts` (ported nearly whole from the
old app). Endpoints: `src/lib/api/pomodoro/rooms.ts`. Tables (rooms,
memberships, messages, reactions, bans, reports and the session room
link): migration `0089_pomodoro_rooms.sql`.
