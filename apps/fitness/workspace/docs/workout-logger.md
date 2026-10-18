# The workout logger

A workout is logged inside its program's dashboard, not on a page of its own. Tyler, 18 Oct 2026, picked "Inside the program dashboard": pressing Start swaps the middle panel to the live workout and the right panel shows the exercise being done. The old logger was a narrow column floating on an empty page, with weights reading "0" and no unit, and it is gone.

## Where it lives

- **The address:** `/programs/<program>?workout=<workout>`. While `workout` is set, the middle panel is the live workout and the view tabs give way to it. On a phone the live workout is the first tab, full width.
- **Back to the week:** the arrow at the top left goes back to the program's views. With at least one set ticked, the workout stays open, and the left panel's "Pick up" button and History both open it again. With nothing ticked, the workout is thrown away and a message says so (Tyler, 18 Oct 2026), so an abandoned Start never leaves an empty row behind. A link to a workout that was thrown away opens the program as usual.
- **Code:** `src/components/fitness/workout/logger-views.tsx` (both panels), `set-grid.tsx` (one lift's sets), `live-workout.ts` (what both panels share), `rest-timer.tsx`, `use-set-sync.ts` and `offline-queue.ts` (saving, with or without signal).

## The middle panel

- **The top row:** the workout's name, which can be changed in place, and Finish. A finished workout shows Do this again and a bin instead.
- **The line under it:** the day, the minutes so far, Light week in a lighter week, and Finished once it is.
- **Each lift** is a compact block, the way gym apps draw it: Set, Previous (what was lifted on that set last time, "100 x 5"), the weight with its unit written in the box ("kg" or "lb", "+kg" for what a bodyweight lift adds), Reps, and a tick.
  - A warm-up set is marked W. Working sets are numbered from 1.
  - A done set shows a tick and an open one an empty circle, so the state never rests on colour.
  - Lifts in a superset sit together under "Superset: one set of each in turn, then rest".
  - Every field is the normal 32px height.
- **Typing a weight** on a set fills the open working sets below it that have none yet, so a lift added mid-workout needs its weight typed once. Ticking a blank set takes the numbers of the set above it.
- **Add a set** under each lift, and **Add exercise** at the bottom, which only offers lifts of the program's own routine type.
- **The rest timer** is a bar pinned to the bottom of the middle panel. It starts when a working set is ticked, for that lift's rest time, and in a superset only after the group's last lift. It has +30s and Skip, and at zero the phone buzzes and beeps once where the browser allows it.

## The right panel

It shows the lift picked in the middle (click its name), or else the first lift with a set still to do. Its cards:

- **Plates** for a barbell lift: what goes on each side for the next open set, "20 a side, 60 kg on a 20 kg bar", or "Can't make exactly 101 kg. Closest: 100 kg." The bar and the plates on hand are set in Settings, App settings.
- **Bodyweight** for a bodyweight lift: the person's bodyweight, what was added, and the total.
- **Warm-ups:** the warm-up sets and which are done. Warm-ups come with lifts from the program's week when the workout starts, while they are switched on in Settings, App settings.
- **Last time:** the day and every set from the last workout with this lift.
- **Note** on the next open set.
- **Change this lift:** Add a set, Remove the last set, Swap for another lift (with "Change the plan too"), This hurts (puts the lift on the pain list, then offers a swap), Remove from this workout.
- **How it went**, once finished: the 1 to 10 effort score and the workout's note, each saved as it changes.

## Finishing

Finish needs at least one set ticked; with none, it says so and nothing is saved. It asks for the effort score (it can be skipped) and a note, then shows the summary: minutes, sets done, total lifted, any records broken, and next time's weights from the program's rules. Done opens History with this workout picked. "Back to the week" returns to the day.

## A coach

A coach reading a client's workout sees every number, with "You're reading a client's workout. Only they can log or change it." Nothing in it answers a press, and the server refuses a coach's change anyway.
