# Measurements and target bodyweight

Two cards on the right of a program's Progress view, both about the person rather than the program, so every program shows the same ones.

## Measurements

Tyler, 21 Oct 2026, put it in "Progress, right panel, under Bodyweight".

- **One line at a time.** Chest, Waist, Hips, Arm and Thigh as a row of choices, Waist to start. Each photo day holding that measurement is a dot on the line.
- **Under the chart:** "Waist 84 cm, down 3 cm since Aug 2", against the first photo day with it.
- **Too few:** with fewer than two photo days holding the picked measurement, "Add measurements to two photo days to see a line."
- **Where the numbers come from:** photo days only (`fitness_photo_sessions`), in centimetres.
- **A coach** sees the card only when the person switched photos on for that coach, because the measurements live on the photo days. Otherwise the card isn't there (`loadMeasurements` in `src/server/fitness/progress.ts`).

## Target bodyweight

- **Setting it:** the target button in the Bodyweight card's heading opens a small dropdown with Target weight and Create target. The same dropdown changes it or removes it. It's stored on the person (`fitness_profiles.target_weight_kg`), in kilograms, never rounded.
- **On the chart:** a dashed line at the target, named in the legend.
- **The pace line,** worked out from the seven-day average over the last four weeks (`bodyweightPace` in `src/lib/fitness/bodyweight-target.ts`):
  - "Losing 0.4 kg a week, about 9 weeks to go" when it's heading toward the target. Averages of 82 kg four weeks ago and 80.4 kg now are 0.4 kg a week, and 3.4 kg from 77 kg is about 9 weeks.
  - "Heading away from the target." when it's going the other way.
  - "Holding steady, not moving toward the target." when it moves less than 0.05 kg a week.
  - "On target." within 0.5 kg.
  - "Weigh in for two weeks to see a pace." with under two weeks of weigh-ins.
- **A coach** sees the line and the pace, and can't change the target.
