# Weigh-ins

The Bodyweight card sits in the right panel of a program dashboard's Progress
view (`/programs/<id>?view=progress`). Bodyweight belongs to the person, not
the program, so every program shows the same weigh-ins. It keeps a daily bodyweight and draws which way it is really
going.

- **Adding one.** New weigh-in, in the Progress view's middle header, opens a
  dropdown with Day and Weight (the unit written in the box) and Create
  weigh-in. Clicking away keeps what was typed for the next opening.
- **One weigh-in a day.** Saving a second weight for the same day replaces the
  first. The day defaults to today on the person's own clock, and any earlier
  day can be picked.
- **Dots and a line.** Each weigh-in is a dot. The line is the average of the
  seven days ending on each weigh-in. Weight moves a kilogram or more from one
  morning to the next with water and food, so the line, not the dots, shows
  the direction. Weigh-ins of 80 kg and 82 kg on two days in a row put the
  line at 81 kg on the second day.
- **Delete.** Each of the last ten weigh-ins has a delete button, which asks
  first.
- **The page follows.** A save or a delete reloads the view's numbers, so the
  Bodyweight tile in the middle panel moves straight away.
- **Units.** Weights are stored in kilograms and shown in the person's unit.
- **Where else it is used.** The latest weigh-in is the bodyweight a new
  bodyweight lift starts with, and a photo day's bodyweight counts too when it
  is newer (`latestBodyweight` in `src/server/fitness/workouts.ts`).
- **A coach** sees the card and the line but not New weigh-in or the delete
  buttons.

Stored in `fitness_weigh_ins`, one row per person per day. The code is
`saveWeighIn`, `deleteWeighIn` and `loadWeighIns` in
`src/server/fitness/progress.ts`, and the card and New weigh-in are
`src/components/fitness/progress/bodyweight-card.tsx`.
