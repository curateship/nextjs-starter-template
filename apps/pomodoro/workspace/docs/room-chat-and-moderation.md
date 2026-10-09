# Room chat and moderation

Chat lives inside a focus room, next to the people in it. Anyone in the room
can talk, react with one of five emoji and report a message. The host can
delete a message, remove a person or ban them.

## Chat

- **A message is 500 characters at most**, and one person may send twenty a
  minute in a room until an admin changes the number on the Pomoder settings
  page. Both limits are the server's; the box also stops at 500 so nobody
  types past the edge.
- **An admin's blocked words** either hold a message for review, where only
  its writer sees it, marked "Only you can see this until it is checked", or
  turn the word into stars. **"Pause all chat"** stops every room's chat. See
  [Admin safety tools](admin-safety-tools.md).
- **STAFF** marks an active admin beside their name, in the people list and
  on their messages, worked out from their role on every read. A line the
  team sends to every live room is pinned above the chat, signed Pomoder.
- **Only people in the room can chat.** Membership is checked before the rate
  limit, so somebody who holds the room's link but never joined cannot spend
  a member's twenty. Closing a room ends every membership, so a closed room
  refuses chat by the same check.
- **A message that fails to send goes back into the box**, with the reason in
  the error toast, so nothing typed is lost.
- **Nothing is drawn from a guess.** The server saves the message, notifies
  the room's channel, and the SSE snapshot redraws the list for everyone at
  once. The newest hundred messages are what a snapshot carries. Until
  8 Oct 2026 it carried the first hundred, so a long room stopped showing
  new lines.
- **No day lines.** The chat used to draw a line with the day ("Tue, Oct 6,
  2026") wherever the day changed. Tyler removed it on 8 Oct 2026: "remove
  the date". Each message keeps just its time.
- **Times are in your account's timezone**, the one on your
  profile, not the browser's. The snapshot carries it as `you.timezone`, so
  a time in the chat matches History and your streaks.

## How the panel shares the height

Both boxes in the room panel are capped, and the caps are in one place at the
top of `room-chat.tsx`.

- **The list of names scrolls inside itself**: six people on a phone, ten on a
  desktop, the rest one flick away. It used to have no cap at all, so a room of
  thirty ran to 1108px and pushed the conversation off the bottom of the screen.
- **The chat holds about five messages** (304px) and the rest scroll inside
  it. Tyler, 8 Oct 2026: "Cap the chatbox at a certain height (about 5
  messages)". It used to grow with the window, up to 512px.
- **The message box and Send are outside the scrolling box**, so they are always
  on screen inside the panel. They are the reason the panel is there.
- **On a phone the chat comes first and the names second.** Side by side on a
  desktop, the names are the 260px right-hand column.
- **Both boxes are `ScrollArea`**, never a native `overflow-auto`, so the
  scrollbar is the app's thin one.

## The chat stays where you are reading

New messages pull the chat down only for somebody already at the newest line,
within 48px of the bottom. Scroll up to reread something, and new messages land
below without moving you. A "New messages" button appears over the bottom of
the chat instead, and pressing it scrolls down and goes away. Scrolling back to
the bottom yourself hides it too. Your own message always comes into view when
you send it. Only the chat's own box scrolls, never the page. The chat used to
jump to the bottom on every message wherever you were (`room-chat.tsx`).

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
  deleted body never reaches another member's browser. A message an admin
  removes shows "Message removed".
- **Remove a person.** They leave at once and can join again later.
- **Ban a person.** They leave at once and cannot rejoin. **A ban dies with
  the room**, so the host has no unban tool: close the room and the ban is
  gone. An admin can lift one from the Bans page.
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

## Notices

The bell tells room members about what they did not see. A line written while
you were away from the room folds into one notice per room ("3 new messages in
Deep Work."). A line that names you with `@handle` always reaches you. People
reacting to your line fold into one notice per line, counted in people, and
taking the reactions back takes it away. Deleting a line deletes its mention
and reaction notices. Removing or banning somebody tells them, naming the room
and never the host. "Away" means the room is not open in a visible tab. The
whole set of rules is in [Notifications](notifications.md).

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
