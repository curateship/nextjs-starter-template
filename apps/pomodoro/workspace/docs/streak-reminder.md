# The streak reminder

An evening nudge in the bell when your streak is alive and today has no
finished focus yet: "One session today keeps your 12-day
streak." Streaks die by accident, not decision, and one well-timed line is
the cheapest way to save one.

## Switching it on

Settings → Timer, the Streak reminder card. Signed-in members only, because a
guest's streak lives in one browser that nothing on the server can reach.

- **Remind me in the bell** is one switch, off until you turn it on.
- **There is no email version.** Tyler's call, 7 Oct 2026: "we dont need it
  to send email reminder". The bell is the only way it arrives.
- **Remind me from** is an hour between noon and 11pm, 7pm by default, on your
  own clock: the timezone saved on your profile.
- Saved with Save reminder, like the Focus rhythm card above it.

## When it is sent

A background job (`pomodoro-streak-reminders` in `src/app/server-options.ts`)
runs at most once a minute and looks at everybody with the switch on.

- **From your hour onwards, once per local day.** The first pass after your
  hour claims the day (`user_preferences.streak_reminder_on`), and only then
  decides. The claim is a guarded update, so two passes or two app processes
  look at one person once.
- **Only a live streak with an empty day gets anything.** Somebody who already
  focused today, or has no streak, is silent, and stays silent that evening:
  neither can change into needing a reminder later the same day.
- **The number is the streak that ended yesterday**, from the same
  `calculateFocusStreaks` the timer's streak line uses.
- **The bell notice** is the `streak_reminder` kind, in the Account tab, and
  opens the timer.

## Where it lives

- Rules and hours: `src/lib/pomodoro/streak-reminder.ts`; the sentence:
  `streakReminderMessage` in `src/lib/pomodoro/notices.ts`.
- The job: `src/server/pomodoro/streak-reminder.ts`.
- Settings endpoints: `src/lib/api/pomodoro/streak-reminder.ts`; the card:
  `src/components/pomodoro/streak-reminder-card.tsx`.
- Columns: migration `0119_pomodoro_streak_reminder.sql` on
  `user_preferences`.
- Tests: `src/server/pomodoro/streak-reminder.test.ts`.
