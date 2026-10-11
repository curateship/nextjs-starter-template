# Needs attention and workload

Two tabs in the Team dashboard's right panel, beside the day's check-ins, for
whoever runs the team. Every mark that says something is wrong already exists
on its own task; these put them in one place.

## Needs attention

For the owner and admins only. Tyler chose a tab here, rather than a page of
its own, on 10 Oct 2026. The tab reads "Attention" so three tabs fit the
panel, and the list inside is headed "Needs attention".

- **Four kinds, grouped:**
  - **Stuck**, from the day it is marked Stuck, because someone can't carry
    on. Tyler's rule (11 Oct 2026), replacing the first version's 2-day wait.
  - **Handed over, not accepted** after at least one of the team's work days.
  - **Picked on 3 days or more** and still not Done (the same mark as
    "Picked on 4 days" on the task).
  - **Overdue**: past its due date and not Done.
- **Each row** names the task, the person, the project and how long ("Stuck
  since today", "Stuck for 3 days", "Not accepted for 1 work day", "Picked on 5 days", "4 days
  overdue"), longest first, and opens the task as a window.
- **A fixed task leaves the list**, because it is worked out again every time
  the tab opens.
- **How long, for older tasks.** It reads each task's history rows. A task
  marked Stuck or handed over before those were written down (11 Oct 2026)
  counts from its last change or from when it was made.
- **What it leaves out:** Done tasks, archived projects, the bin, and "Just me"
  tasks, which only their person can see.
- **The bell gives the numbers, this gives the names.** The owner's morning
  notice ("5 of 6 checked in, 1 blocked") is in
  [The morning check-in](morning-check-in.md#the-teams-morning).

## Workload

For everyone, to see who has room before handing out more work.

- **For each person:** Open, Doing, Stuck, Overdue and Due this week (today and
  the next seven days), across every project. Clicking a number lists those
  tasks, and each opens as a window.
- **Only what the viewer can see.** The owner and admins see every shared
  project, as everywhere else; a member sees counts and tasks from their own
  projects only. "Just me" tasks never count.
- **Busiest first**, by open tasks.

## Where it lives

- **Rules:** `loadNeedsAttention` and `loadWorkload` in
  `src/server/project/team-running.ts`.
- **Screen:** `src/components/project/team-work-panels.tsx`, in the right
  panel of `src/components/project/team-dashboard.tsx`.
