# Calisthenics

Calisthenics is the second routine type a program can be, beside Strength training. A Calisthenics program is built from bodyweight moves, and its weight is never counted. Running and Mobility still show "Coming soon".

## Tyler's rule

Asked on 21 Oct 2026 how a move gets harder, Tyler picked "Reps, then the next version". The app does this:

- **Every move in the week has a rep range,** such as 8 to 12, and a target inside it.
- **A good session** is every working set done at the top of the range. After enough good sessions in a row (1 to start, set in the program's settings), the move steps up to its next harder version and starts again at the bottom of the range. Three sets of 12 knee push-ups mean the next session is three sets of 8 push-ups.
- **Anything less** keeps the move. The next session aims for one rep more than the fewest done, inside the range. Sets of 12, 10 and 9 make the next target 10.
- **A move at the top of its ladder** keeps adding reps. Its range moves up by one each good session: 8 to 12 becomes 9 to 13.
- **A hold** such as a plank works the same way in seconds.

The rule is `nextCalisthenics` in `src/lib/fitness/calisthenics.ts`, with tests beside it. `applySteps` in `src/server/fitness/workouts.ts` runs it when a workout from the week is finished.

## The moves

The built-in moves are in `src/lib/fitness/exercise-catalog.ts`, each with a `cal-` slug, its muscles, its equipment and the slug of its next harder version. Each family is a ladder, easiest first:

- **Push-ups:** wall, incline, knee, push-up, decline, archer, one-arm.
- **Overhead push:** pike push-up, elevated pike push-up, wall handstand push-up.
- **Dips:** bench dip, slow lowering dip, dip, ring dip.
- **Pull-ups:** scapular pull-up, slow lowering pull-up, pull-up, chest-to-bar, archer pull-up.
- **Rows:** incline ring row, inverted row, feet-up inverted row.
- **Squats:** assisted squat, bodyweight squat, split squat, rear-foot-up split squat, shrimp squat, pistol squat.
- **Hips and calves:** glute bridge to single-leg glute bridge, and calf raise to single-leg calf raise.
- **Core:** lying knee raise, hanging knee raise, hanging leg raise, toes to bar.
- **Holds, in seconds:** plank to long-lever plank, and tuck L-sit to one-leg L-sit to L-sit. Hollow body hold and dead hang have no harder version.

Rings and Parallettes joined the equipment list for these. A person's own Calisthenics move has a "Logged in seconds" switch in place of the bodyweight switch, and never has a harder version.

## How it looks

- **New program:** Calisthenics can be picked. Best lifts are left out, because there is no weight to start from.
- **The week:** a row reads "8 to 12 reps · Rest 2 min · Last: 10 reps". New exercise asks for Reps from, To, Sets and Rest, with no weight.
- **The picked move** has Sets, Reps from and To, the next session's target, and Next time: "Every set at 12" leads to the harder version's name, and "Any set short of 12: next time aims one more than your lowest set" leads to "Same move".
- **The settings window** has Step-up rules in place of Weight rules and Training blocks: whether moves step up by themselves, and how many good sessions in a row that takes. They are stored in `fitness_calisthenics_settings`.
- **The live workout:** each set has Reps (or Seconds) and Done, with no weight box, no plates and no warm-up sets.
- **Finishing** lists each step up: "Knee push-up steps up to Push-up, starting at 8 reps."
- **History** reads "12, 12, 11 reps" and leaves out Total lifted.
- **Progress:** the chart draws the most in a set each day. Records list the most reps (or seconds) and mark the hardest version reached in each ladder "Hardest so far". A move's Records card on the right panel has a Harder versions figure: "Hardest so far", "Moved past it" when a harder version has been logged, or "No other versions" for a move with no ladder.
- **Templates:** "Full body three days" sets Monday, Wednesday and Friday to knee push-ups, incline ring rows, bodyweight squats, glute bridges and a plank. A Calisthenics program offers only Calisthenics templates.
- **The AI week** writes from Calisthenics moves only, each with a range.

## Stored

- `fitness_exercises.is_timed`: a hold, logged in seconds kept in the set's reps.
- `fitness_day_exercises.reps_min`, `reps_max` and `good_streak`: the range, with the target in `reps`, and the good sessions so far. A strength lift leaves them empty.
- A Calisthenics program still has a `fitness_strength_settings` row, which holds the calendar's start day and the share code for every program.
- Migration `drizzle/0101_fitness_twelve_features.sql`.
