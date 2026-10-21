# Needs attention and workload

Two tabs in the Team dashboard's right panel, beside the day's check-ins, for
whoever runs the team. Every mark that says something is wrong already exists
on its own task; these put them in one place.

## Needs attention

For the site admin only. Tyler chose a tab here, rather than a page of
its own, on 10 Oct 2026. The tab reads "Attention" so three tabs fit the
panel, and the list inside is headed "Needs attention". Three tabs fill the
panel at its usual width, so the team's Activity went beside Calendar in the
middle panel instead (Tyler, 12 Oct 2026; see
[Teams and invites](teams-and-invites.md#the-teams-activity)).

- **Six kinds, grouped:**
  - **Stuck**, from the day it is marked Stuck, because someone can't carry
    on. Tyler's rule (11 Oct 2026), replacing the first version's 2-day wait.
  - **Handed over, not accepted** after at least one of the team's work days.
  - **Waiting for review**: Done, and still waiting for its reviewer to
    confirm it or send it back, after at least one of the team's work days
    (Tyler, 16 Oct 2026). Confirming or sending it back takes it off.
  - **Picked on 3 days or more** and still not Done (the same mark as
    "Picked on 4 days" on the task).
  - **Overdue**: past its due date and not Done.
  - **Untouched**: open and not touched for 14 days, with no change, message,
    step or clock time in that time, so a task everyone forgot comes back
    into view (Tyler, 20 Oct 2026, 14 days for every team, with no setting).
    A task snoozed until a later day stays off until that day. "Touched" is
    the task's own change time or its newest History row, whichever is later
    (`lastTouched` in `team-running.ts`).
- **One card per kind**, as Tyler drew it on 16 Oct 2026
  (`assets/pasted-image-1792198368279821000.png`), in this order: Overdue,
  Blocked (Stuck), Handed over not accepted, Waiting for review, Picked on
  3+ days, then Untouched, added 20 Oct 2026. Each has a coloured dot and
  its count.
- **Each row** is the task's title, then whose it is ("Ben Tester → Sam
  Owner" for a review, naming the reviewer) and how long at the end ("7
  days" in red when overdue, "Stuck 6 days", "24 work days"), longest first.
  It opens the task as a window, and a screen reader hears the whole
  sentence ("Waiting for Sam's review for 2 work days").
- **A fixed task leaves the list**, because it is worked out again every time
  the tab opens and every time a task window opened from it closes. The old
  rows stay on screen until the new ones arrive. Workload reloads the same
  way.
- **How long, for older tasks.** It reads each task's history rows. A task
  marked Stuck or handed over before those were written down (11 Oct 2026)
  counts from its last change or from when it was made.
- **What it leaves out:** Done tasks (except those waiting for review), archived projects, the bin, and "Just me"
  tasks, which only their person can see.
- **The bell gives the numbers, this gives the names.** The site admin's morning
  notice ("5 of 6 checked in, 1 blocked") is in
  [The morning check-in](morning-check-in.md#the-teams-morning).

## Workload

For everyone, to see who has room before handing out more work.

- **For each person:** Open, Doing, Stuck, Overdue and This week (due today
  and the next seven days), across every project, as five figures in a white
  strip under their name (Tyler's drawing, 16 Oct 2026). A zero is grey;
  Stuck and Overdue above zero are red. Clicking a figure lists those tasks,
  and each opens as a window.
- **Only what the viewer can see.** The site admin sees every shared
  project, as everywhere else; a member sees counts and tasks from their own
  projects only. "Just me" tasks never count.
- **Busiest first**, by open tasks.
- **Clocked time this week**, "6h 20m this week" beside each name: their
  time on the task clock from Monday's midnight in their own zone until now,
  on projects the viewer can see and the picked client's only (Tyler, 20 Oct
  2026; see [The task clock](task-clock.md)).
- **One client's work.** With a client picked in the client choice beside the Workload heading, at the
  top of the tab, only that client's projects count, or those with no client
  (Features 16 Oct; see Clients in
  [Projects and tasks](projects-and-tasks.md#clients)). The same choice
  narrows the calendar's due dates.
- **Both tabs keep up by themselves.** A change anywhere on the team loads
  Attention and Workload again (see Live updates in
  [Task chat](task-chat.md#live-updates)).
- **The same Open count shows in every hand-to picker**, beside each name,
  with "Away until Dec 4" for anyone on time off today, so nobody hands work
  to someone on holiday or already swamped (`loadPeopleRoom` in
  `team-running.ts`). See Handing a task over in
  [Projects and tasks](projects-and-tasks.md#handing-a-task-over).

## Where it lives

- **Rules:** `loadNeedsAttention` and `loadWorkload` in
  `src/server/project/team-running.ts`.
- **Screen:** `src/components/project/team-work-panels.tsx`, in the right
  panel of `src/components/project/team-dashboard.tsx`.
