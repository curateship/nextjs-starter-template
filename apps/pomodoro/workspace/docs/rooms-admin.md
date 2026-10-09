# Rooms in the admin

What an admin does to rooms beyond deleting them (admin task 04, 8 Oct 2026):
close a live one, edit one in a window, feature one on Browse rooms, cancel
invitations still waiting to go out, keep house presets hosts pick from, and set
room limits. Every change writes one `pomodoro_audit_logs` row in the same
transaction. The code is `src/server/pomodoro/admin-rooms.ts` and
`src/lib/api/pomodoro/admin-rooms.ts`.

## Close

Close sits on a room's row, and over ticked rows as "Close (N)". It asks first.

- **It runs a host's own Close without the host check.** Everybody inside is
  taken out, and their screen says "This room has ended." and goes back to their
  personal room.
- **The chat, the members and any reports are kept**, unlike Delete.
- **The host is told in the bell**: "An admin closed your room <name>." It never
  says which admin.
- **A booked room that has not opened is cancelled** the way its host would
  cancel it, with its unsent invitations stopped.
- **A closed room cannot be opened again**, and closing it twice is skipped.

## The room window

A room's name or its cog opens a window, kept in the address as `?open=<id>`.

- **Name and who can find it** (listed on Browse rooms, or link only).
- **Featured**, see below.
- **The rhythm**: focus, short break and long break minutes, and whether the
  next focus starts by itself. New minutes apply from the next phase, so a
  focus under way keeps its time. A room always takes its long break after four
  focuses; that is fixed in code and not a setting.
- **The sound and theme**: one Live item, shuffle, or one tag, the same choices
  a host has.
- **Saving tells everybody inside**, whose screens read the room again, and the
  host hears "An admin changed your room <name>." in the bell.

## Featured

A featured room sits first on Browse rooms with a FEATURED label above its name.
Feature and Unfeature are in the room window and over ticked rows on Focus rooms.
On Weekly rooms the same two buttons feature the rule, and every room it books
is featured with it. A closed room drops off Browse rooms by itself.

## Invites

`/admin/pomodoro-invites` lists every room invitation: who it went to, the room,
its host and start, and where it has got to (waiting to send, sent, failed,
cancelled). One still waiting can be cancelled, on its row or over ticked rows;
one already sent, failed or cancelled is left alone and counted as such. An
invitee with an account loses the unread invitation in their bell too, as when
the host cancels.

## House presets

A preset's breaks go up to 90 minutes, the same as a room a host opens.

`/admin/pomodoro-room-presets` keeps named room setups: a rhythm, whether the
next focus starts by itself, and if wanted a sound and theme. Hosts see them
first in the Rhythm picker when they open a room, as "Pomoder: <name>". Picking
one fills the timers, and the sound and theme when the preset has them. A room
made from a preset copies it, so changing the preset later does not change that
room.

## Room limits

On the Pomoder settings page (see [Admin settings](admin-settings.md)):

- **People in one room**, off by default, which is no limit as before. With a
  limit, the next person is refused with "This room is full." Lowering it never
  takes anybody out, and the host can always come back into their own room.
- **Weekly rooms per host**, 5 until changed.
- **Invitations per room**, 20 until changed. The host window reads the number
  when it opens, so it checks the same limit the server does.
