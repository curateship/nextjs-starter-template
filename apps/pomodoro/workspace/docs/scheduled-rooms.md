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
  a copy-link button and a "Cancel booking" button. Times there are drawn on
  the reader's own clock.
- **Cancel booking is drawn as destructive**, because it removes the
  booking, and reads "Cancelling…" with a spinner while it runs. Both buttons
  are the shared `Button`. The result is a toast that clears itself, still
  with the count of invitations that were stopped, and a refusal is the
  persistent error toast.
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

## Rooms that repeat every week

A host can book "every Tuesday at nine" once instead of booking each Tuesday by
hand.

- **It is the third Starts at choice.** "Every week" swaps the date for a row
  of seven day buttons and a time box, and keeps the invite box. The button
  reads "Book every week". It is the same Pro perk as hosting, and it spends
  the same ten-an-hour booking allowance.
- **The time is on the clock of the device it was typed on**, the same clock
  a one-off booking's date is read on, and the window names that clock. The
  rule keeps the timezone, so 9am stays 9am for the host through a clock
  change. A day whose time the clock skips, such as 2:30am on the night the
  clocks go forward, has no room that week.
- **A weekly rule is not a room.** It lives in `pomodoro_room_repeats`: days,
  time, timezone, the room settings and the invite list. The worker turns each
  day into an ordinary booked room 24 hours before it starts, so everything
  above about booked rooms holds for each week's room: it opens itself, it
  cannot be joined early, and its invitations are queued and sent once.
- **Each week's invitations are that room's own rows.** The worker copies the
  rule's address list onto the room it just made, so the unique address per
  room and the sender's claim stop anyone getting two emails for one week.
  Each person gets one email a week, a day before.
- **One room per rule per day, held by the database.** `rooms` has a unique
  index on the rule and the day. Two worker passes racing for the same Tuesday
  make one room between them, and the loser writes no invitations.
- **The rule remembers when its next day starts** (`next_starts_at`), so a
  pass reads only the rules due within a day. Booking a day moves it on a
  week. If the worker was down past a start time, that day is skipped rather
  than opened late.
- **Saving a rule books the first day straight away** when it is less than a
  day off, so a room for tomorrow morning is under Upcoming the moment the
  window closes.
- **Upcoming says a room belongs to a series** with a "Repeats every Tuesday
  at 09:00, Europe/London time" line. The zone is the host's, named because
  the reader's may differ; the date line above it is on the reader's clock.
  Most of the week the next room is not booked yet, so the
  host also sees a card for each of their weekly rules with the next date.
- **Cancel this week and Cancel the series are two buttons**, both red, each
  asking first. Cancel this week calls off the next day only: a booked room
  is cancelled with its unsent invitations, and a day not booked yet is
  passed over. The series carries on the week after. Cancel the series stops
  all future days and cancels a booked one that has not opened. Rooms that
  already ran, or are running, are never touched.
- **A host who loses Pro is skipped, not cancelled.** The rule moves on each
  week without booking, and books again if the plan comes back.
- **Five weekly rules per person.** Weekly rooms do not count towards the ten
  one-off bookings.

Not built, as the task said: monthly repeats, a series that ends on a date,
changing one week without changing the rest, and editing a series. To change
a series, cancel it and book a new one.

## In the bell

An invitee whose address belongs to an account with a verified email also
gets the invitation in the bell, with the start time in their own timezone.
When the room opens, they and the host get "… is open now.", which replaces the
unread invitation. Cancelling the booking takes the unread invitation away. The
host is never told which addresses matched an account. See
[Notifications](notifications.md).

## Where it lives

- Rules shared by the window and the endpoint:
  `src/lib/pomodoro/scheduled-rooms.ts`.
- Booking, cancelling, the Upcoming list, the opening pass, the invitation
  sender and the weekly rules: `src/server/pomodoro/scheduled-rooms.ts`.
- The weekly rules' day maths and the window's checks:
  `src/lib/pomodoro/room-repeats.ts`.
- Endpoints (`scheduleRoom`, `listUpcoming`, `cancelBookedRoom`, `repeatRoom`,
  `listMyRepeats`, `skipNextRepeat`, `cancelRepeat`), all guarded:
  `src/lib/api/pomodoro/rooms.ts`.
- The Upcoming group: `src/components/pomodoro/upcoming-rooms.tsx`. The
  booking fields are in the Host a room window in
  `src/components/pomodoro/rooms-page.tsx`, and the invite page's new state is
  in `src/components/pomodoro/room-invite-page.tsx`.
- `rooms.starts_at`, the `scheduled` phase and the `room_invites` table:
  migration `0098_pomodoro_scheduled_rooms.sql`. The weekly rules and the
  rule and day on `rooms`: `0116_pomodoro_rooms_that_stick.sql`.

## Known gaps

- **Invitations are only offered on a booking.** A room started now has no
  email box; its link is copied by hand as before.
- **The Host a room window is still hidden while you are in a room**, which
  was true before booking existed. Leaving the room you are in is currently
  the only way to reach the booking form.
- **Nobody already emailed is told when a booking is cancelled.** The
  confirmation window says this out loud rather than pretending otherwise.
