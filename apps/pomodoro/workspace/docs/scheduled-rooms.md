# Scheduled rooms

A host books a focus room for later, the people they name get an email with
the link and the time, and the room opens itself with nobody's browser open.

## How it behaves

- **Booking is part of hosting.** The Host a room window gained a **Starts
  at** choice. "Now" is the old behaviour, unchanged. "A set time" turns the
  window into a booking: a date and time on the host's own clock, and an
  **Invite by email** box. Booking is the same Pro perk as hosting
  (`requirePomodoroPerk("hostRooms")`).
- **The rules a booking is held to**, checked in the window and again on the
  server against the server's clock: at least one minute out, no more than 90
  days out, at most 20 addresses, and each address has to look like an
  address. `src/lib/pomodoro/scheduled-rooms.ts` holds all four so the two
  sides cannot disagree. One person may have 10 bookings at a time and may
  book 10 times an hour.
- **A booked room is a room nobody can get into.** Its phase is `scheduled`.
  It is not in "Open to join" or "In session", a join is refused with
  `ROOM_NOT_OPEN_YET`, and a host action on it is refused the same way. The
  invite link says when it starts instead of offering a Join button.
- **Upcoming** is a third group on `/rooms`, above the other two, drawn with
  the same room card as the other two groups. Everyone sees the public
  bookings; a host also sees their own unlisted ones, with the invite tally,
  a copy-link button and a Cancel button. Times there are drawn on the
  reader's own clock.
- **The clock opens it.** The `pomodoro-scheduled-rooms` worker in
  `src/app/server-options.ts` runs every fifteen seconds. Each pass claims
  every booking whose start time has passed and opens it, guarded on the
  room's sequence exactly as the room clock's phase changes are, so two
  overlapping passes cannot open one room twice. **Auto-start decides what it
  opens into**: ticked, the room opens straight into focus and is already
  running when people arrive; unticked, it opens to Waiting and the host
  presses Start focus.
- **Nothing is broadcast when a room opens**, because a booking has no
  members and so no live connection to tell. The browse page looks again on
  its own twenty seconds after the earliest booking's start time.
- **Invitations are queued, not sent on the spot.** Booking writes one
  `room_invites` row per address; the same worker pass sends them.
- **The claim is what stops one person being emailed twice.** A pass moves
  the row out of `queued` before it sends, and only the pass whose update
  matched `queued` goes on to send, so a second pass that starts while a slow
  provider is still answering cannot take the same invitation. The claim
  writes `failed` rather than a half-state, so a process that dies mid-send
  leaves a row saying the send could not be confirmed instead of one that
  sends again. Sending twice is worse than not sending, and the host can see
  which happened. An address the provider refuses is written down with the
  provider's own reason and is not retried, because a host would rather read
  "that address bounced" than watch an invitation disappear.
- **Cancelling is the only way a booking ends.** Leaving it is refused, since
  nobody is in a booked room to leave, and closing one that way would leave
  its invitations sitting in `queued` for ever.
- **The email goes through the deployment's own email setup**: the workspace's
  sender and Resend key from Settings → Email, the same pair everything else
  in this app sends on. With no key set, outside production, the shell's
  logging provider writes the message to the server log instead of sending it.
  With no sender set at all, the invitation is marked failed and says so.
- **The email says the time in the host's timezone and names it**, because the
  reader has no app to ask. The timezone is the host's saved profile one. It
  also names the host and says the address was typed in by them.
- **Cancelling kills the room and the unsent invitations in one transaction.**
  Only the host, only before it opens. Invitations still queued become
  `cancelled` and never leave. An invitation already sent stays marked sent,
  and **the people who got it are not told the room is off** — the window that
  asks for confirmation says so.
- **A booking survives the one-room-per-host rule.** Hosting or joining
  another room closes any other room you host, which is what stops members
  being stranded in a hostless room. Bookings are exempt: they have no members
  to strand, and a host who books 7pm and then runs a room at three o'clock
  means to do both.

## Where it lives

- Rules shared by the window and the endpoint:
  `src/lib/pomodoro/scheduled-rooms.ts`.
- Booking, cancelling, the Upcoming list, the opening pass and the invitation
  sender: `src/server/pomodoro/scheduled-rooms.ts`.
- Endpoints (`scheduleRoom`, `listUpcoming`, `cancelBookedRoom`), all guarded:
  `src/lib/api/pomodoro/rooms.ts`.
- The Upcoming group: `src/components/pomodoro/upcoming-rooms.tsx`. The
  booking fields are in the Host a room window in
  `src/components/pomodoro/rooms-page.tsx`, and the invite page's new state is
  in `src/components/pomodoro/room-invite-page.tsx`.
- `rooms.starts_at`, the `scheduled` phase and the `room_invites` table:
  migration `0098_pomodoro_scheduled_rooms.sql`.

## Known gaps

- **Invitations are only offered on a booking.** A room started now has no
  email box; its link is copied by hand as before.
- **The Host a room window is still hidden while you are in a room**, which
  was true before booking existed. Leaving the room you are in is currently
  the only way to reach the booking form.
- **Nobody already emailed is told when a booking is cancelled.** The
  confirmation window says this out loud rather than pretending otherwise.
