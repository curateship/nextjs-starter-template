# Weight rules and training blocks

Two folding cards in the program's cog dropdown, beside its name at the top of the left panel, decide how the weights move after each workout and whether the program runs in blocks with a lighter week. They sit under Starting data. Every field saves as it changes, and the card's heading says Saving…, Saved or Not saved.

## Weight rules

With "Change weights automatically" on, finishing a workout of a week day sets that day's weight for each exercise in it:

- **A good session** is every working set done, at least the planned reps, at least the planned weight. The next session adds the increase, 2.5 kg unless changed. A 100 kg squat becomes 102.5 kg.
- **A missed session** is anything else. The weight stays and the miss is counted.
- **Missed sessions before a drop** (3 unless changed): that many misses in a row and the weight comes down by the drop, 10 out of 100 unless changed, rounded to the plates in Settings, App settings. A 100 kg squat missed three times in a row drops to 90 kg. The count starts again after a drop or a good session.
- **Each weekday keeps its own weights.** Squats on Monday and squats on Friday are two rows, so a good Monday raises Monday's squat only.
- The new weight is written into the week, so the Day view always shows what the next workout starts with. Picking an exercise shows the same rule as numbers under "Next time": "Hit all 5 sets of 5 and it goes to 82.5 kg". Typing a different weight also clears the count of misses.
- Warm-up sets never count. Workouts started empty, repeated from History or imported in the past never move the week's weights.

With it off, nothing moves the weights but the person.

## Training blocks

- **Weeks in a block** splits the program into blocks counted from the day it was made. 0 means no blocks.
- With 4, weeks 4, 8, 12 and so on are **light weeks**. The calendar marks their dates "Light".
- A workout started in a light week lifts "Light week, out of 100" of the usual weight, 60 unless changed, rounded to the plates. A 100 kg squat is 60 kg that week.
- Weights don't go up or down after a light-week workout. The next block carries on from where the weights were, and because the weights kept going up through the block, it starts heavier than the last one did.

Which weekdays are workouts is not a setting here. It is the week itself, in the left panel (`the-week.md`).

Code: `src/components/fitness/program/strength-rules.tsx`, `src/components/fitness/program/day-exercise-panel.tsx` (Next time), `src/lib/fitness/progress.ts` (`nextWeight`), `src/lib/fitness/schedule.ts` (`isLightWeek`), `src/server/fitness/workouts.ts` (`applyProgression`).
