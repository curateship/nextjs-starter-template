# Admin safety tools

What an admin has for room chat and for people who misbehave (admin task 05,
8 Oct 2026): a Chat page, a Bans page, Warn, Suspend, blocked words, chat
speed, two emergency switches, report counts, the STAFF label and one message
to every live room. Every change writes one `pomodoro_audit_logs` row in the
same transaction. The code is `src/server/pomodoro/admin-chat.ts`, `safety.ts`
and `room-access.ts`, behind `src/lib/api/pomodoro/admin-safety.ts`.

## Chat (`/admin/pomodoro-chat`)

Three tabs.

- **Rooms**: every room that has chat, newest message first, with its host,
  how many messages, when the last one was, how many are held, and whether it
  is open or has ended.
- **Search messages**: every line in every room, newest first, found by its
  words or by the writer's name or email. A result opens its room's window
  scrolled to that line.
- **Held**: lines waiting for an admin because of a blocked word, with Let
  through and Delete, one at a time or over ticked rows. The tab shows how
  many wait.

A room's name opens its chat in a window (`?open=<roomId>`), oldest at the
top, the newest 500 lines. Removed lines stay, greyed and struck through, with
"Removed by the host" or "Removed by an admin". Each line has Delete, Let
through when held, and a menu with Warn and Suspend for its writer. Ticked
lines get Delete at the top.

- **Deleting a line** works like a host's Delete: the room shows "Message
  removed" in its place within a few seconds, and the words stay on record
  for reports. Its mention and reaction notices go.
- **Message live rooms** pins one line at the top of every room open right
  now (members cannot react to it or report it, and a host cannot remove it), signed Pomoder with a STAFF label, until the room ends or an admin
  deletes it from that room's window. The window says how many rooms it
  reaches before sending.

## Bans (`/admin/pomodoro-bans`)

Three tabs, each with Lift on its row and over ticked rows.

- **Room bans**: who, which room, who banned them, when. Lifting lets them
  join that room again. Nobody is told.
- **Hidden profiles**: who, their address, when it was hidden, and the latest
  report about it. Lifting shows the profile again at once and tells the owner
  in the bell: "Your public profile is visible again."
- **Suspensions**: only the ones still running, with the end date or "Until
  lifted", the reason and who set it. Lifting lets them back into rooms at
  once. Nobody is told.

## Warn

On a report row (under the reported message) and in the Chat window's menu.
The admin edits a ready line, "Please keep room chat friendly. Further
messages like this will get you suspended.", and sends. The window lists the
member's earlier warnings.

- **The member gets it in the bell**, as "You have a warning from the Pomoder
  team." with the admin's words under it, **and by email**, as Tyler chose on
  8 Oct 2026. Neither says which admin sent it.
- **A failed email never undoes the warning.** The toast says the bell has it
  and why the email did not go out.

## Suspend from all rooms

In the same two places, for 1, 7 or 30 days or until lifted, with a reason the
member reads.

- **While suspended they cannot join, open, book, chat or react in any room**,
  and a weekly room they host skips its days. A room they had already booked
  is cancelled, with its unsent invitations, the way they would cancel it.
  Their own timer, tasks and history work as normal.
- **Anybody suspended inside a room is taken out**, the way leaving does. A
  host's own room ends with them, since a room cannot run without its host.
- **Every refusal says why**: "You can't use rooms until 15 Oct, 23:00."
  followed by the reason, on their own clock. The time is named because a
  one-day suspension made at 23:00 lasts until 23:00 the next day. One with no
  end says "for now".
- **It ends by itself on its date.** Nothing has to run; the next join simply
  works. A new suspension replaces a running one.
- The member also gets the same sentence in the bell, with the reason under it.

## Blocked words, chat speed and the emergency switches

On Settings → Emergency switches and Settings → Room chat (see [Admin settings](admin-settings.md)).

- **Blocked words**: one per line, whole words only and ignoring case, so
  "class" is never caught by "ass". The list starts empty. The admin picks what
  a message with one does: **held for review**, where its writer sees it and
  nobody else does until an admin lets it through, or **sent with the word in
  stars**. A held line tells nobody, and letting it through later tells nobody
  either; it simply appears.
- **Chat speed**: messages per minute per person in one room, 20 until changed.
- **Pause new rooms**: opening, booking or starting a weekly room says "New
  rooms are paused for a little while." Rooms already open, and weekly rooms
  already set up, carry on.
- **Pause all chat**: every room's message box says "Chat is paused for a
  little while." and nothing can be sent. Open rooms change within a few
  seconds.
- **While either is on, a red line says so** at the top of the settings page
  and of every Pomoder admin table, so nobody forgets it. The shell's own admin
  pages (Users, Settings) cannot show it: they belong to the shell, which has
  no place for an app's line.

## STAFF

An active admin shows STAFF beside their name in any room, in the people list
and on their messages, in the same look as HOST. It is read from the account's
role every time the room is read, so nobody can give it to themselves, and it
goes the moment the role does.

## Report counts

Each Room reports row says how many times the person it is about was reported
before it, and under the reporter how many of their earlier reports were
dismissed ("3 of 10 past reports dismissed"). Only earlier reports count, so an
old report reads as it did on the day. Either count opens Room reports showing
only the reports by or about that person (`?person=<id>`), with "Show
everyone" to go back.
