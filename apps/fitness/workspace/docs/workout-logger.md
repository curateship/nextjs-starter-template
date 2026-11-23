# The workout logger

A workout is logged inside its program's dashboard, not on a page of its own. Tyler, 18 Oct 2026, picked "Inside the program dashboard": pressing Start swaps the middle panel to the live workout and the right panel shows the exercise being done. The old logger was a narrow column floating on an empty page, with weights reading "0" and no unit, and it is gone.

## Where it lives

- **The address:** `/programs/<program>?workout=<workout>`. While `workout` is set, the middle panel is the live workout and the view tabs give way to it. On a phone the live workout is the first tab, full width.
- **Back to the week:** the arrow at the top left goes back to the program's views. With at least one set ticked, the workout stays open, and the left panel's "Pick up" button and History both open it again. With nothing ticked, the workout is thrown away and a message says so (Tyler, 18 Oct 2026), so an abandoned Start never leaves an empty row behind. A link to a workout that was thrown away opens the program as usual.
- **Code:** `src/components/fitness/workout/logger-views.tsx` (both panels), `set-grid.tsx` (one lift's sets), `live-workout.ts` (what both panels share), `rest-timer.tsx`, `use-set-sync.ts` and `offline-queue.ts` (saving, with or without signal).

## The middle panel

Laid out as Tyler drew it on 20 Oct 2026.

- **The header:** the back arrow, the workout's name (it reads as a heading and can be changed in place), then the day, the sets ticked out of all of them with a bar and the share done ("0/8 sets", "0%"), the clock since the start as hours and minutes ("0:06"), and Finish. A finished workout shows the time it took, Do this again and a bin instead of Finish. As the panel narrows, the day, then the bar and share, then the sets drop out, and Do this again keeps only its icon.
- **Notices** take a line at the top of the list only when they apply: Light week in a lighter week, Finished once it is, a coach's reading line, and the no-signal line.
- **Each lift is a band across the panel** with a line under it, no cards (Tyler's second drawing, 20 Oct 2026). The lift being done is white and the others grey.
  - The heading: the name and last time's best set ("Last: 30 kg × 6", or "First time"), then "Now" on the lift being done and how many of its sets are ticked ("0/5"). Clicking the heading opens the lift on the right.
  - The rows: Set, Previous (what was lifted on that set last time, "30 kg × 6"), the weight with its unit written in the box ("kg" or "lb", "+kg" for what a bodyweight lift adds), Reps, and a Done tick box. The whole 40px Done cell takes the tap, not just the box.
  - A warm-up set is a W in amber. Working sets are numbered from 1 in a small box. The set to do next is shaded.
  - The weight and reps boxes start filled with the set's target, so ticking Done without typing logs exactly what is written. Emptying a box puts the target back, for the same reason.
  - Lifts in a superset sit together under "Superset: one set of each in turn, then rest".
- **A coach's note** on a lift, left on an earlier workout, shows under the lift's heading: "Cleo: keep the elbows in" (`coach-notes.md`).
- **A Calisthenics move** has no weight box: its rows are Set, Previous, Reps (or Seconds for a hold) and Done, and the right panel's Up next shows the reps alone, with no plates (`calisthenics.md`).
- **Typing a weight** on a set fills the open working sets below it that have none yet, so a lift added mid-workout needs its weight typed once. Ticking a blank set takes the numbers of the set above it.
- **Add a set** under each lift's rows, and **Add exercise** as a dashed full-width button at the bottom, which only offers lifts of the program's own routine type.
- **The rest timer** is a bar pinned to the bottom of the middle panel. It starts when a working set is ticked, for that lift's rest time, and in a superset only after the group's last lift. It has +30s and Skip, and at zero the phone buzzes and beeps once where the browser allows it.

## The right panel

It shows the lift picked in the middle, or else the first lift with a set still to do. The header holds the lift's name over "Exercise 1 of 2", arrows to the lift before and after, and the three dots. Its cards, as Tyler drew them on 20 Oct 2026:

- **Up next** ("Up next · Warm-up", "Up next · Set 2"): the weight and reps of the set to do now, and what that set was last time. Under them, for a barbell lift, the plates on each side ("20 + 5 a side on a 20 kg bar", or the closest it can make); for a bodyweight lift, the total with the person's bodyweight. The bar and the plates on hand are set in Settings, App settings.
- **Warm-ups** ("0 of 2"): each warm-up set and whether it is done. A barbell lift with none says why: warm-ups are off in Settings, App settings, or the lift was added after the workout started. Warm-ups come with lifts from the program's week when the workout starts, while they are switched on in Settings, App settings.
- **Last time**, with its date: the best set and how many working sets there were.
- **Note** on the next open set.
- **How it went**, once finished: the 1 to 10 effort score and the workout's note, each saved as it changes.
- **Remove from this workout**, a red line at the foot, which asks first.

Tyler took the "Change this lift" card out on 20 Oct 2026 ("we dont need this card"). Add a set is under each lift in the middle. The three dots in the right panel's header hold Remove the last set (only while the lift has more than one), Swap for another lift (with "Change the plan too") and This hurts (puts the lift on the pain list, then offers a swap).

## Finishing

Finish needs at least one set ticked; with none, it says so and nothing is saved. It asks for the effort score (it can be skipped) and a note, then shows the summary: minutes, sets done, total lifted, any records broken, and next time's weights from the program's rules. A Calisthenics workout shows next time's targets and each step up instead: "Knee push-up steps up to Push-up, starting at 8 reps." Done opens History with this workout picked. "Back to the week" returns to the day.

## A coach

A coach reading a client's workout sees every number, with "You're reading a client's workout. Only they can log or change it." Nothing in it answers a press, and the server refuses a coach's change anyway.
