# Coach notes

A coach leaves notes on a client's finished workouts. Tyler, 21 Oct 2026, asked what a note can go on, picked "The workout and each lift".

## The rules

- **Where a note goes:** one note on the whole workout, and one on any lift in it, per coach.
- **One way only:** the client reads the notes and can't write one. Chat was left out of coaching on purpose (`coaching.md`).
- **Finished workouts only.** A workout still being logged refuses a note.
- **Only a coach the person said yes to** can write one. The server checks it on every save (`saveCoachNote` in `src/server/fitness/coach-notes.ts`).
- **Who reads them:** the client reads every coach's notes. A coach reads only their own, so a new coach never reads what an earlier one wrote.
- **Changing it:** a coach changes or deletes only their own notes. Deleting the workout deletes its notes. Ending the coaching keeps the notes the client already has.

## Where they show

- **History, the workout on the right:** a Coach notes card under the summary, and each lift's notes under its sets. The coach writes in the same places: "Your note on this workout", and "Note on this lift" under each lift.
- **The live workout:** the next time a lift with a note comes up, its band shows the newest note under the heading, "Cleo: keep the elbows in" (`liftNotesFor`).
- **The bell:** a new note sends the client "Cleo left a note on Push", which opens that workout in History. Changing a note sends nothing more.

## Stored

`fitness_coach_notes`: the workout, the lift's place in it (empty for the whole workout), the coach, the text (at most 1,000 characters) and when it was written and changed. Migration `drizzle/0101_fitness_twelve_features.sql`.
