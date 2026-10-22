# Reminders and the calendar feed

Both follow a person's active program and its calendar. Reminders are switched on for the whole app by the site admin in Settings, App settings, Reminders. The calendar feed address is each person's own, under Settings, App settings, Calendar feed.

## Workout reminders

- **What arrives:** a notice in the bell, an email, or both, saying "Workout today: Push" on a day the active program has a workout planned.
- **When:** once the person's own clock passes the app's reminder time (07:00 unless the admin changes it). The clock is their own time zone, which the Programs dashboard saves from the browser the first time it opens.
- **Never on a rest day, never during a pause, never on a day skipped on purpose, never twice.** The job stamps the calendar row before it sends anything (`reminded_at`), so two passes running at the same moment send it once.
- **Where it runs:** `src/server/fitness/reminders.ts`, on the shell's background loop every 15 seconds (`src/app/server-options.ts`). Locally that loop starts with the dev server; when deployed it runs in the worker.

## The missed-workout nudge

- **What arrives:** "You missed Pull yesterday", the day after a planned workout nobody logged, at the same reminder time.
- **One per missed workout.** The job only looks at yesterday and stamps the row (`nudged_at`), so a workout missed on Monday sends one nudge on Tuesday and nothing after.
- Moving a workout on the calendar clears both stamps, because it is a new day.

## The coach's notice, the weekly check-in and the photo day reminder

The same job sends three more notices (21 Oct 2026), each at the reminder time on the person's own clock:

- **"Anna missed Push and Pull in a row"** to a client's coaches after two misses in a row, once per run, to the bell only. See `coaching.md`.
- **"Your weekly check-in"** on Sundays to anyone with a coach who said yes, once a week, by the reminder channel. Someone who already sent that week's check-in isn't asked, and a coach whose account is being deleted doesn't count. See `weekly-check-in.md`.
- **"Time for a photo day"** four weeks after the person's last photo day (Tyler: "4 weeks"), by the reminder channel. It goes once, stamped on the person (`photo_nudged_at`), and only a photo day dated later than the last one starts the next four weeks. Adding an older photo day sends nothing. Someone who never kept a photo day never gets it. It opens Photos with New photo day open (`?view=photos&new=photo-day`).

The check-in and the photo reminder each have a switch on the Reminders tab, on to start, so they go out even with workout reminders off.

## Emails

Reminder emails go through the email provider saved in Settings, Email, the same way Project's invite emails do. With no email key saved, nothing is sent and the bell notice still arrives when the person picked "Bell and email". An app may not add a kind to the shell's own system emails without editing shell files, which is why these go out directly.

## The calendar feed

- **What it is:** an address Google Calendar or Apple Calendar subscribes to, which shows every planned workout as an all-day event from 30 days back to four weeks ahead, for every program that isn't archived. A finished one is titled "Done: Push, My program".
- **How it's protected:** the address carries a 48-character secret in place of a sign-in (`fitness_profiles.calendar_token`). "Reset address" makes a new secret and the old address stops working at once. "Turn off" removes it.
- **One way only.** Moving an event in Google does not move the workout. Calendars refresh a subscribed feed on their own timetable, often every few hours, so a change in the app can take that long to show.
- **Where it lives:** `src/server/fitness/calendar-feed.ts`, served by `src/routes/api/fitness/calendar.$token.ts`.

## Where the bell notices lead

Every Fitness notice (reminders, nudges, new records, coach requests) is the shell's `app_activity` kind with its address saved beside it in `fitness_notice_links`. `notifications.detailsFor` in `src/app/options.ts` asks the server for those addresses, and the server only answers for the asker's own notices. The icon and the Training tab in the bell are worked out from the notice's own heading, so the row is right on the first paint.
