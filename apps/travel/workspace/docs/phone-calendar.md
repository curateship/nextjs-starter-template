# Add to phone calendar

A trip can be a calendar that Apple Calendar and Google Calendar subscribe
to (task part 45). Each activity with a start time shows on the phone as an
event. When a card moves on the board, the phone shows the new time after its
calendar next checks the link.

## The link

- **The window is "Add to phone calendar"**
  (`src/components/travel/calendar-link-dialog.tsx`). It shows the link with
  Copy, "Open in calendar" and Reset link, and ends with Done.
- **A trip with no start date has no link.** Its days have no dates to put
  events on, so the window says "Add a start date first" instead. The server
  refuses to make a link for it too.
- **The link is made the first time someone asks for it** and then stays the
  same, so a calendar already subscribed keeps working.
- **The address is `/api/travel/calendar/<secret>`** on the app's own address,
  such as `https://travel.example.com/api/travel/calendar/3f9c…`. "Open in
  calendar" uses the same address starting `webcal://`, which a phone hands
  to its calendar app.
- **There is no ".ics" on the end.** The dev server is known to answer 404
  to an app route ending ".svg", so the address has no extension at all.
  Calendar apps read the file's type from the reply, not from the name.

## Who can read it

- **Nobody signs in to read the calendar.** A phone's calendar can't sign in,
  so the long secret in the address stands in for one. The secret is 64
  random characters, kept on the trip (`calendar_token`).
- **Anyone holding the link can see the trip's timed activities.** The window
  says so.
- **Reset link asks first**, then swaps the secret. The old link stops working
  at once, and any calendar subscribed to it stops getting changes until it
  subscribes again with the new link.
- **A wrong or old secret gets a plain 404**, so the reply never says whether
  a trip is there.

## What goes in the calendar

- **One event per activity on a day with a start time.** Ideas, activities
  with no time, binned activities and anything past the trip's last day are
  left out.
- **The time is local to the trip.** A trip with a time zone sends its times
  in that zone. A 9:30 breakfast in Tokyo is 9:30 for a phone in Tokyo, and
  shows as 00:30 on a phone still set to London time. A trip with no time zone
  sends times with no zone, and the phone reads them as its own local time.
- **An event lasts the activity's length**, or an hour when none is set.
- **The event's title is the activity's name.** Its location is the place's
  name and address.
- **The calendar asks phones to check every hour.** Apple and Google keep
  their own schedules, and Google can take several hours, so this is a
  request, not a promise.

The code is `src/server/travel/calendar.ts`, served by
`src/routes/api/travel/calendar/$token.ts`.
