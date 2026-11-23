# Program length

A program can run for a set number of weeks. Without one it runs for good, as every program did before 21 Oct 2026. Tyler's answer on 21 Oct 2026 for the end: "Ask: run it again or end it".

## Setting it

- **New program** has "Weeks it runs", empty for no end.
- **Program settings** has a Program length card: "Weeks it runs, 0 for no end", with the last day written under it.
- **Counted from the start day,** the same day training blocks count from (`fitness_strength_settings.start_day`). Twelve weeks from Mon, Jan 5 end on Sun, Mar 29 (`programEndDay` in `src/lib/fitness/schedule.ts`).
- Changing it takes planned dates past the new last day off the calendar and lays the week out again from today.

## While it runs

The left panel shows "Week 5 of 12" with a thin bar and the last day. The calendar plans nothing past the last day, so reminders stop with it. A block that runs past the end is cut short.

## When the last week ends

A card at the top of the left panel says "12 weeks done", with two buttons:

- **Run it again:** week 1 starts on the coming Monday, or today when today is a Monday, with the weights where they are now. Training blocks count again from that day too (`runProgramAgain` in `src/server/fitness/programs.ts`).
- **End program:** archives it, after asking. Its workouts stay in History.

Until one is pressed the card stays, and the calendar shows nothing planned.

## Stored

`fitness_programs.weeks`, empty for no end. Migration `drizzle/0101_fitness_twelve_features.sql`; code in `src/components/fitness/program/program-length.tsx`.
