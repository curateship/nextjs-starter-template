# A running flow: the Run button and its cards

A flow that is on says what it is doing. Its Run button counts the people in
it and holds Pause and Stop, its right panel has a card for every step, and
the bell says when it stops moving.

Tyler, 23 Nov 2026: "There should be more informations when the automation is
running. Becauew right now I have no idea what its status is. Below the
statistic card, there should be cards for each of the module that shows
information pertaining that node. FOr example, segment card shows the amount
of people currant in the automation and if there is new ones comes in, it
should show that as well. The drip card will show its parameters and the
sequence shows all the emails sequence, for example it shows email 1 and how
many people are sent that email, how many are waiting. Same for email 2
etc..." The task is
`workspace/tasks/features/automations/live-flow-information.md`.

## The Run button

Tyler, 23 Nov 2026: "Change the \"live\" switch to a button called \"Run\"
after clicked the button changes to a rainbow color with a live update in the
button itself".

- **Off, it reads Run.** Pressing it switches the flow on, as the Live switch
  did (`flow-run-button.tsx`).
- **Running, it has the moving rainbow edge** around "Running 122 contacts"
  (Tyler, 23 Nov 2026: "rename the \"In it\" to \"Running 122 contacts\""),
  "Running 1 contact" for one, then a Pause icon and a Stop icon (Tyler,
  24 Nov 2026: "If a run is running then there should be 2 new buttons
  "Pause" and "Stop". The button would look like this "Running 23
  [pauseicon][stopicon]"). The words are not a button; only the icons press.
  The number is everyone somewhere in the flow now: its own runs still going
  or waiting on an approval, and the people its Send sequence steps put on a
  sequence who have not had every email yet. The edge holds still for anyone
  whose device asks for less motion.
- **Paused, it reads "Paused 122 contacts"** with a plain grey edge, a Play
  icon to resume and the Stop icon. The list's dot beside the name turns
  amber and says Paused.
- **On, but edited into something that cannot run**, it has no rainbow and
  reads Stop, with "On, but not running" in red beside it. That Stop is the
  same Stop as below.
- **Switched off by a safety check**, it reads Run with the reason in red
  beside it, such as the bounce limit's sentence. The open flow notices within
  five seconds and swaps its panel back.
- **The same button is in every row of the Automations list** (Tyler: "Becomes
  a Run button too"). One read every five seconds counts the people in every
  live flow on the page (`peopleInLiveFlows` in
  `src/server/automations/live-flow.ts`).
- **A flow that starts with the Time step also has "Run once"** beside it, the
  button that runs the flow one time now without switching it on (Tyler,
  23 Nov 2026, picked "Call it Run once"). A flow with no start step of its own
  keeps the one button, called Run, that runs it once.

## Pause, Resume and Stop

Tyler, 24 Nov 2026: "We need to add a pause, start and stop to the
automation ... stop would clear all the sending queues". The task is
`workspace/tasks/features/automations/flow-pause-and-stop.md`, and the rules
are in `src/server/automations/flow-control.ts`.

- **Pause holds everyone where they stand**, in the flow and on every
  sequence it started. The background pass takes none of their runs, a step
  already running finishes first, and nobody gets another email. It is the
  site-wide Pause all, for one flow.
- **The flow stays live while paused.** Somebody new who matches its start is
  let in and waits at the first step (Tyler: "Let in, hold at start"), so a
  form filled or a purchase made during a pause is never missed. A Segment
  start lets people in at its usual pace and stops once a pass's worth are
  waiting at the start.
- **No bell while paused.** People in a paused flow are meant to stand still,
  so nobody counts as late.
- **Resume lets everyone carry on.** Each person sends only their next email,
  never everything they missed. The clocks start again from the press: the
  hour before anyone counts as late, and an approval step's deadline, which
  moves on by as long as the pause lasted. Resume walks a pass straight away,
  so the panel shows them moving within a second or two.
- **Stop asks first**, in the shared confirm dialog, because it can't be
  undone: "Stop Newsletter welcome? 23 contacts are taken out and get no more
  email from it or the sequences it started. If the flow lets them in again
  after you press Run, they start from the first step. This can't be
  undone."
- **Stop clears everything waiting to send.** In one go it switches the flow
  off and ends every unfinished run of it and of the sequences it started,
  with "Stopped by hand" on each. They count under Stopped on the Statistics
  card. A run inside a step as Stop lands finishes that step and goes no
  further. A sequence run its flow run was starting at that moment ends the
  first time the background pass reaches it.
- **Run again after Stop starts the stopped people over** (Tyler: "Start over
  from the top"). The flow forgets them, so whenever its start picks them up
  again they begin at the first step and get the first email again. A
  Segment start with "Also send to people already in this segment" lets them
  back in by itself; every other start needs them to match it again, such as
  joining the segment or filling the form. That includes everyone partway
  through a sequence the flow started, whose own steps in the flow were
  already done. People who had finished the flow and every email of its
  sequences are still remembered and never let in twice.
- **A Time start makes one run while paused, not one per missed time.** A
  daily flow paused for a week holds one run at its start, so Resume sends it
  once. The schedule keeps moving on, so the next time after Resume is the
  usual one.
- **Test runs are never held or ended**, because they are the admin's own.
- **Pause, Resume and Stop are one server call** with Run
  (`controlAutomation` in `src/lib/api/automations/automations.ts`). The flow
  is locked while each one is saved, so two presses at once take turns.
- **A flow that stopped itself** (the bounce limit, too many joining at once,
  a deleted segment) is off, not paused. It reads Run with its reason in red,
  which starts "Stopped on its own".

## The right panel

While the flow is on, the right panel is `LiveFlowPanel`
(`live-flow-panel.tsx`), whatever step is picked. It reads everything in one
call, `liveFlowReport`, when the flow goes on, every five seconds while the
page is in view, and at once when the tab comes back. Nothing is read while
the tab is hidden. Test runs never count.

- **Statistics** opens with one sentence of what the flow is doing now, such
  as "40 people held at Drip, outside sending hours until Nov 24, 9:00 AM",
  or "Live, waiting for somebody to start". Paused, it is a grey box with
  a pause mark: "Paused. 23 people held where they are. Paused by Tyler,
  2:30 PM." and Working now reads 0, everyone counted under Held. Then Runs in total, Completed out
  of that total, and a bar each for Working now (due now), Held (asleep at a
  Drip or Wait until a time still to come), Waiting (stopped at an approval
  step), Failed and Stopped. Then the typical time from a person's start to
  their finish. The sentence is in this card, not under the flow's name in the
  header, because the panel's narrowest width cut it to a few letters there.
  The card is in colour (Tyler, 23 Nov 2026: "add some colors to the
  statistic card"): the sentence sits in a box with its first part in bold,
  amber with a clock while people wait for a time, blue while they move, red
  for a safety stop, grey while nobody is in it; Runs is a blue tile and
  Completed a green one with a green bar; each bar row has its own colour on
  a faint track of it (Working now blue, Held amber, Failed red, Waiting and
  Stopped grey), and a row at nothing greys its label and count.
- **The period** is the calendar button in the Statistics card's heading:
  All time, Today or Last 7 days, with the choice after the card's title. It
  narrows the totals in every card: runs, completed, failed, sent, opened,
  clicked, let in, finished and dropped out. It never narrows the numbers
  about now: who is in the flow, held, waiting, or next in line.
- **One card per step, in the order the steps run.** Each says how many are
  on it now, how many passed, how many failed, and the newest failure in its
  own words.
- **Pressing a step on the canvas** scrolls the panel to that step's card and
  opens it. The Statistics panel stays.

### The cards

- **Segment** (either Segment start): everyone in the flow now, how many are
  new since Run was pressed, how many in the segment are still to be let in
  (only when "Also send to people already in this segment" is on), how many
  in the segment cannot be emailed (unsubscribed, bouncing or marked as spam,
  so never let in), and the people let in on each of the last 7 days. It is
  drawn to Tyler's design of 23 Nov 2026: everyone in the flow as one big
  number over a bar shared out between in the flow (blue), still to let in
  (amber) and cannot be emailed (red); a coloured square and count per line,
  grey while the count is nothing; then under a line a box a day, blue with
  its count ("1.2K" past a thousand) on a day somebody was let in, and the
  weekday's letter under it. "New since Run" (Tyler: "New since run started") counts people let in
  after the press who were not in the segment at the press. The flow takes
  that picture of the segment when Run is pressed, in the Segment start's own
  snapshot table, and switching it off empties it. A flow already on when this
  was built counts from the moment the update ran, and everyone it lets in
  after that counts as new.
- **Drip** is drawn to Tyler's design of 23 Nov 2026. "Outside hours" in
  amber in its heading while its sending hours are shut and people wait. It
  read "Paused" until 24 Nov 2026, when Pause became a button and the two
  could no longer share a word. Under the
  heading, Waiting for a batch (amber), Passed (green) and Failed (red, grey at
  nothing) as coloured tiles. Then the next batch with a clock mark: its
  time, its number and how many are held ("Batch 3 · 40 held now"), and
  "Outside sending hours, resumes ..." when the
  hours are why. With nobody held it reads "None, nobody is waiting for a batch",
  and "Outside sending hours until ..." under it while the hours are shut. The tiles meet the heading with no strip between: the card
  body's top space from Panel cards is taken back above them. Then, each
  under a line: Schedule as three boxes (people at
  a time, minutes apart, sending hours and timezone, ", weekdays" when
  weekends are off); Bounces, "1 of 80 · 1.25%", over a bar that is full at
  the limit, where a red mark stands, so 1.25 in 100 against a limit of 5
  fills a quarter of it; and the last five batches, each "Batch 3" and its
  time, a blue dot for one still to go and grey for one gone. Batches are
  numbered from 1 since Run was last pressed, so a Stop and Run starts again
  at batch 1 (Tyler, 24 Nov 2026: "I think it should what the batch sequence
  is Like Batch 1 or 2"). In the narrowest panel the tiles and the boxes
  stack.
- **Send sequence** (its Emails tab), drawn to Tyler's design of 23 Nov
  2026: "0 of 120 people finished" and "120 waiting" over a bar, finished in
  green and waiting in pale amber; who dropped out as one line of dots ("1
  Unsubscribed · 1 Bounced · 0 Spam", grey at nothing); then a line per
  email, its number in a blue mark, the subject, "80 sent · 27 opened · 9
  clicked" under it, and how many wait for it at the right. Everyone is those
  this step started and those in the flow still before the step. People who
  dropped out stay in the flow, and every later email step sends them
  nothing, because a Send email step only writes to someone subscribed or
  never asked.
- **Send email** (outside a sequence): Sent, Opened and Clicked, the same
  shape as a sequence's line.
- **Wait:** how many wait there and when the next one moves on.
- **Every other step,** an app's own included: on it now, passed and failed.
- **The Send sequence card has two tabs** (Tyler, 23 Nov 2026: "Utilize
  tabs so we can consolidate the send sequence into one card like this",
  pointing at Project's Daily habits block with Today and History, then
  "remove the dropped out tab and combine it with the emails tab"): Emails and
  Activity. They are the shell's tab row under the card's heading, edge to
  edge, so they follow Settings → Styling → Dashboard tabs, and in the
  narrowest panel they scroll sideways. With several Send sequence steps, the
  last one holds the tabs. A flow with none ends with an Activity card, its
  dropped-out line above the list.
- **Activity** is drawn to Tyler's design of 23 Nov 2026: the last ten things
  the flow and its sequences did. Each line has a coloured mark for what
  happened (green for let in or moved on, amber for waiting, blue for an email
  sent, violet for a sequence started, red for a problem, grey for anything
  else), the person's name in bold and what happened to them ("was let in
  from the segment", "will go in batch 3 Nov 27, 9:00 AM", "was
  sent “Welcome”", "was added to “Welcome series”"), their address under it,
  and how long ago at the right. Someone at a sequence's wait "will get email
  2 Nov 27, 9:00 AM", numbered as the Emails tab numbers them; at a flow's
  own Wait they are "waiting until" its end (Tyler, 24 Nov 2026: "waiting at
  wait does not make sense. Nick was started also does not make sense", then
  "Rename to "Tyler will get email # date""). The words come from `describeActivity` in `live-flow.ts`, not the
  step's own summary.

## When a flow stops moving

Tyler, 23 Nov 2026, picked "Bell alert when stalled", then "1 hour late".

- **Admins get a bell notice** when somebody in a live flow was due to move on
  over an hour ago and has not: "Newsletter welcome has stopped moving",
  "412 people in it were due to move on over an hour ago and have not."
  Pressing it opens the flow's Runs tab on the run late longest
  (`src/server/automations/stalls.ts`).
- **A planned hold is never late.** A Drip batch and a Wait keep a time still
  to come, with the sending hours and weekends already in it, and a run at an
  approval step has another status.
- **One stall is one notice.** The flow keeps when admins were told
  (`stall_alerted_at`), cleared once nobody in it is late, so the next stall
  tells them again. Pressing Run, Pause, Resume or Stop clears it too.
- **It is checked once a minute by the background pass**, after the runs are
  walked, and never while every automation is paused. A background pass that
  has died cannot send it. It catches a flow stuck while everything else
  moves.
- **Its own line in Settings → Notifications:** "Live automations that
  stopped moving".

## Where it lives

- `src/server/automations/live-flow.ts`: every number, in one read.
- `src/server/automations/flow-runs.ts`: which runs belong to a flow,
  including the sequence runs its Send sequence steps started (the key
  `run:<flow run>:<step>`).
- `src/server/automations/stalls.ts`: the bell notice.
- `src/server/automations/flow-control.ts`: Pause, Resume and Stop, and the
  test the background pass asks before taking a run.
- `src/components/automations/live-flow-panel.tsx`,
  `use-live-flow-report.ts` and `flow-run-button.tsx`: the screen.
- `drizzle/0118_custom_shell_live_flow_information.sql`: `live_since` and
  `stall_alerted_at` on each flow, an index for counting the people on each
  step, and the new notice kind. Owed on every live site after the shell
  merge.
- `drizzle/0119_custom_shell_flow_pause.sql`: `paused_at` and `paused_by` on
  each flow. Owed on every live site after the shell merge.
