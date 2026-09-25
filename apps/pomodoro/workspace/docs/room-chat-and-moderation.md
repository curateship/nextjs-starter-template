# Room chat and moderation

Chat lives inside a focus room, next to the people in it. Anyone in the room
can talk, react with one of five emoji and report a message. The host can
delete a message, remove a person or ban them.

## Chat

- **A message is 500 characters at most**, and one person may send twenty a
  minute in a room. Both limits are the server's; the box also stops at 500
  so nobody types past the edge.
- **Only people in the room can chat.** Membership is checked before the rate
  limit, so somebody who holds the room's link but never joined cannot spend
  a member's twenty. Closing a room ends every membership, so a closed room
  refuses chat by the same check.
- **A message that fails to send goes back into the box**, with the reason
  above the panel, so nothing typed is lost.
- **Nothing is drawn from a guess.** The server saves the message, notifies
  the room's channel, and the SSE snapshot redraws the list for everyone at
  once. The last hundred messages are what a snapshot carries.

## Reactions

- **Five emoji, fixed**: 👍 💪 🔥 ❤️ 😄, from
  `src/lib/pomodoro/room-reactions.ts`, the one list the server and the
  browser both read. The picker opens from the message's own button.
- **Counts are anonymous.** A chip says how many people reacted, never who.
  Your own reaction is the only one marked, and pressing the chip takes it
  back.
- **A reaction disappears while its author is out of the room** and comes
  back when they rejoin. The tally joins reactions to memberships that have
  not ended, so a person who leaves, is removed or is banned takes their
  reactions with them and there is no cleanup job to run.
- Chips keep the palette's order, so they do not reshuffle as counts change.

## Reporting a message

- **A report is private.** The reporter and the operators see it; the room
  never does, and no snapshot changes.
- **A reason is required**, 3 to 300 characters. Reporting the same message
  twice says "You already reported this message" instead of writing a second
  row, and a person may send five reports in ten minutes.
- You cannot report your own message.
- Reports land in `room_reports` as `pending`, which is what the admin triage
  screen reads.

## What the host can do

- **Delete a message.** The body stays in the row for authorized review, and
  everyone in the room sees "Message removed by the host" in its place. The
  deleted body never reaches another member's browser.
- **Remove a person.** They leave at once and can join again later.
- **Ban a person.** They leave at once and cannot rejoin. **A ban dies with
  the room**, so there is no unban tool: close the room and the ban is gone.
- Every one of these asks for confirmation first, and the host cannot
  moderate themselves.
- **Removal and bans name a membership, never a user.** Snapshots carry
  membership ids and display names only, so the screen has no user id to
  send and no way to guess one.
- **The host check runs before the rate limit**, so somebody who is not the
  host cannot burn the room's moderation budget by trying.

## The audit trail

Every privileged act writes one row to `pomodoro_audit_logs` (actor, action,
resource, the record it touched) **inside the same transaction as the act**,
so the log can never disagree with what happened. The old app wrote the
shell's `admin_audit_logs`; this shell has no such table, so the app owns
one. The admin sections write to the same table.

## Where the code is

- Server logic: `src/server/pomodoro/rooms.ts` (`postRoomMessage`,
  `toggleRoomReaction`, `reportRoomMessage`, `deleteRoomMessage`,
  `removeRoomMember`, `banRoomMember`).
- Endpoints: `src/lib/api/pomodoro/rooms.ts`, every one behind `userPost`.
- Screens: `src/components/pomodoro/room-chat.tsx` (the member column, the
  message list, the reaction picker, the report window), used by
  `src/components/pomodoro/rooms-page.tsx`.
- Tables: `room_messages`, `room_message_reactions`, `room_reports` and
  `room_bans` from migration `0089_pomodoro_rooms.sql`;
  `pomodoro_audit_logs` from `0090_pomodoro_audit_logs.sql`.
