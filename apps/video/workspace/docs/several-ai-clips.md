# Several AI shots at once

A project can make up to three AI shots at the same time, and one person up to
six across all their projects. That lets you try three directions for the same
first frame and look at all three, instead of waiting several minutes for each
one in turn.

## The caps

- **3 shots at once in one project.** The use case is three tries at one shot.
- **6 shots at once across one person's projects.** Two projects can each be
  trying three.
- **Why there are caps at all:** Google charges for a shot when it arrives, not
  when it is asked for. A shot being made is money promised but not yet on the
  meter. With no cap, a run of presses could promise far more than anyone
  added up. At six shots the most that can be promised at once is six 32
  second shots, 6 × $12.80 = $76.80.
- **Pictures made to move count too.** Make it move on a timeline picture
  (`animate-a-still.md`) makes an ordinary shot, so it takes a place and is
  checked against the money the same way.
- **What counts:** a shot counts while one of its pieces is waiting for its
  turn or being made. A long shot's pieces run one after another, so it only
  ever takes one place. A shot stopped by a failed piece takes no place until
  Try again.
- **Where the numbers live:** `SHOTS_AT_ONCE_PER_PROJECT` and
  `SHOTS_AT_ONCE_PER_PERSON` in `src/lib/video/asset-factories.ts`, and again
  in the database trigger in `drizzle/0117_video_shots_at_once.sql`. Changing
  a cap means changing both, with a new migration.
- **Why the database checks too:** the app counts first so the refusal is in
  words. The trigger makes one person's presses wait for each other, so two
  presses landing in the same instant cannot both see a free place. This was
  tested on the local Postgres with two open connections: the second waited,
  then was refused, and three shots were saved, not four.

## The money check

Before a shot is queued, and before Try again, the app adds up what the shots
already being made will cost when they arrive and checks that plus the new
shot against two things.

- **The monthly AI allowance.** With $2.00 left and two 8 second shots being
  made, a third is refused: "Your monthly AI allowance has $2.00 left. Shots
  still being made will take $1.62 of it, and this one costs $0.81, so it is
  $0.43 short." A person with no allowance set has no ceiling, so this check
  does nothing for them.
- **The project's spend limit** (see `project-first.md`). With a $1.00 limit
  and one $0.81 shot being made, a second $0.81 shot is refused, and the
  message says the limit is $0.62 short and has a Raise limit button.
- **What a shot counts as:** the Normal 720p price for its seconds, whatever
  size was picked, because Google prices only 720p (`longer-ai-clips.md`).
- **What a stopped shot counts for:** nothing, until Try again. Try again is
  checked for the failed piece and every piece still waiting behind it.

## How the worker keeps up

The background worker makes a pass every 15 seconds. Each pass does two
things (`videoGenerationTick` in `src/server/video/asset-factories/generations.ts`).

- **It starts at most one waiting shot.** Three shots asked for together
  reach Google 15 seconds apart. Google limits how many videos start in a
  minute.
- **It asks after every shot being made, side by side.** Up to 6 in one
  pass, each under its own 5 minute hold so no two passes touch the same
  piece. Six, because a finished clip is held in memory while it is saved
  (up to 100 MB each); a seventh waits for the next pass. One shot's download taking minutes no longer holds up the others'
  checks. Before, a pass did one step for one shot, so three shots took turns.
- **When Google says it is too busy to start one** (HTTP 429), the shot goes
  back to waiting and is tried on a later pass. It fails with Google's message
  only after 15 minutes of that.
- **Google's 15 minutes** for one piece now count from when Google accepted
  it, not from when it first left the queue, so time spent waiting its turn
  is not held against it.
- **What this looks like:** three 8 second shots asked for at once all start
  within 30 seconds and finish in whatever order Google finishes them. A test
  in `generations.test.ts` has Google finish the third one first, and it is
  ready while the other two are still being made.

## On screen

In the editor's AI clip panel (see `ai-clip.md`):

- **Make the shot stays pressable** while shots are being made. Under it a
  line says how many of the three are being made.
- **Step 4 shows the picked frame's newest three shots**, newest first, each
  with its direction on top and where it has got to underneath: "Waiting for
  its turn since 14:02" or "16 second shot, part 2 of 2, being made since
  14:02". Google gives no percentage, so the part and the start time are all
  there is.
- **A fourth press** gets the refusal in a toast without asking the server:
  "This project is already making 3 shots. Wait for one to finish."
