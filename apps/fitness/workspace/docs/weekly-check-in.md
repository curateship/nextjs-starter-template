# Weekly check-in

A person with a coach answers a few questions once a week, and the coach reads them. Tyler's answers on 21 Oct 2026: the questions are "Bodyweight, Sleep, 1 to 5, Stress, 1 to 5, How training felt + a note", asked "Sunday, at the reminder time".

## For the person

- **Who gets it:** only someone with at least one coach who said yes. Everyone else never sees it.
- **When:** Sundays, once the person's own clock passes the reminder time in Settings, App settings, Reminders. A notice "Your weekly check-in" goes out once a week, by the bell, email or both, as that tab says.
- **Where:** a Weekly check-in card at the top of the Programs dashboard, with Send your check-in. The card stays until it's sent. Asked on Sunday, Oct 25, it covers Mon, Oct 19 to Sun, Oct 25 and stays open until Saturday, Oct 31 (`checkInWeek` in `src/lib/fitness/check-in.ts`).
- **The questions:** bodyweight this morning, then sleep, stress and how training felt, each 1 to 5, and a note to the coach. Every answer may be left empty.
- **The bodyweight** is saved as today's weigh-in too, so the bodyweight line moves.
- **Once a week:** the card goes once it's sent. The server keeps one per person per week, and a second send in the same week would replace the first without telling the coach again.

## For the coach

- **The notice:** "Anna sent their check-in", which opens the client's Programs dashboard.
- **Check-ins:** a card on the client's Programs dashboard (`/programs?person=<client>`), newest first, each week's answers side by side so a trend shows.
- **The Clients table** shows the date of each client's last check-in, marked New until the coach opens that client's check-ins.

## The switch

"Ask people with a coach for a weekly check-in" on Settings, App settings, Reminders, on to start.

## Stored

`fitness_check_ins`: the person, the week's Monday, the three scores, the note, the day of the weigh-in it saved and when it was sent, one per person per week. `fitness_profiles.check_in_asked_for` stops a second notice in the same week, and `fitness_coach_clients.check_ins_seen_at` is when the coach last opened them. Migration `drizzle/0101_fitness_twelve_features.sql`; code in `src/server/fitness/check-ins.ts` and `src/components/fitness/coaching/check-in.tsx`.
