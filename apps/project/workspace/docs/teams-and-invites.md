# Teams and invites

A team is the top level in Project. A team holds its people and its projects.
Project has no workspaces.

## One team per account

- **Each account belongs to one team.** Switching between teams is what a later
  workspace switcher would do, and version 1 doesn't build toward it.
- **Starting a team.** Anyone signed in who isn't on a team sees a "Start a
  team" card on My dashboard, Projects and Team. Whoever starts the team is its
  owner.
- **What a team holds.** A name, a daily check-in time (9:00 to begin with), a
  time zone, and its work days (Monday to Friday to begin with). Each person
  can shift the time and time zone to their own hours on My dashboard
  (see [The morning check-in](morning-check-in.md)).

## Roles

- **Owner.** Exactly one per team. The owner can do everything an admin can,
  and can hand the team to someone else. Handing it over makes the old owner an
  admin. The owner can't leave until someone else is the owner.
- **Admin.** Invites people, removes people, changes roles between admin and
  member, and edits the team's settings. An admin can't change or remove the
  owner.
- **Member.** Works on projects. Anyone, whatever their role, can make
  projects and tasks and hand tasks to anyone on the project.

## Invites

- **An invite is for one email address.** Only an account signed in with that
  address can accept it. The link expires after 7 days.
- **The link carries a secret.** The database only stores a fingerprint of the
  secret (a sha256 hash), so someone reading the database can't accept an
  invite with what they find there.
- **Inviting the same address again** replaces the old invite and its link.
  Resend on the Team dashboard does the same with a fresh link and 7 more days.
- **Email.** The invite goes through the email key saved in Settings → Email, or
  the `CUSTOM_SHELL_RESEND_API_KEY` setting. When neither is set, nothing is
  sent, and the invite window says so and shows the link to copy. The link is
  always shown, so it can be shared by hand either way.
- **How often invites can be sent.** Each person can send 30 invite emails an
  hour, and one address can receive at most 5 a day from all teams together.
  Resend counts too. The cap exists because anyone can start a team, so without
  it an invite would be a way to make Project email any address as often as
  someone liked. A refused send says to wait an hour.
- **Why invites skip the shell's system emails.** Adding an email type to the
  shell's list means editing shell files, which an app never does. The invite
  is sent with the same lower-level sender the CRM uses
  (`src/server/project/invite-email.ts`).
- **Two ways to accept.** The emailed link opens `/projects/invite/<secret>`.
  A signed-out visitor is sent to sign in and brought back. A brand-new account
  doesn't come back to the link, because `/register` doesn't remember where you
  were going. So any open invite to your address also shows at the top of the
  Projects page, with Join and Decline.
- **Someone already on a team** sees the invite with "Leave your current team
  to join this one", and Join is refused until they leave.

## The join link

One link to paste in a message, instead of inviting people one by one.

- **The owner and admins turn it on** in Team settings. Anyone signed in who
  isn't on a team can then join as a member through it, straight away, with
  no approval (Tyler's choice, 10 Oct 2026).
- **Shown once.** Like an invite, only a fingerprint (sha256) of the link's
  secret is kept, so the link is shown when it is made and never again.
  "Make a new link" replaces it, and the old one stops working at once. "Turn
  it off" stops it too.
- **It works for 7 days.**
- **Against a leaked link:** at most 20 people a day can join through one
  link, and the owner and admins get "Leo joined the team through the link" in
  the bell each time.
- **Someone already on a team** is refused with the reason, as with invites.
- **The page** is `/projects/join/<secret>`. A signed-out visitor is sent to
  sign in and brought back.

## Job titles

- **A short title beside each name**, up to 40 characters, such as
  "Copywriter": on the Team dashboard's member list, the Members page, each
  project's members, the Workload tab and the hand-to picker in a task.
- **Each person sets their own** on My dashboard's left panel. **The owner and
  admins can change anyone's** from that person's window on the Members page.

## Removing people

- **Removing someone or leaving** takes the person off every project in the
  team, then off the team. They lose access at once.
- **Their tasks stay.** Each task they were assigned to is left with nobody
  assigned and a note of whose it was, such as "Nobody (was Ben)".
- **Their check-ins stay**, so task history still shows the days they worked
  on a task. They no longer appear on the Team dashboard (see
  [History](history.md)).

## Handing over all of someone's tasks

For when someone leaves or goes away, so their work isn't left with nobody.

- **"Hand over all tasks"** is on each row of the Members page, and in the
  remove-member window ("Hand over their tasks first"), for the owner and
  admins. Pick who receives them.
- **Every task of theirs that isn't Done** goes to the receiver, who has to
  accept each one, as with any hand-over. Each writes its history line.
- **One notice**, "Anna gave you 9 tasks", opens the receiver's My dashboard,
  rather than nine.
- **Projects the receiver isn't on.** Those tasks are left with nobody
  assigned ("Nobody (was Ben)") and listed in the window with the reason. The
  receiver is never added to a project (Tyler's choice, 10 Oct 2026).
- **Left alone:** tasks in archived projects and "Just me" tasks.

## The Team dashboard

`/team` is three panels, from Tyler's mockup of 10 Oct 2026
(`assets/pasted-image-1791659665679304000.png`). The panels resize and
collapse like the project page's, and below 1280px wide one shows at a time.

- **Left: the team.** Its name, the day it was created and its time zone, the
  check-in schedule ("Daily at 9:00 AM" and the work days, M T W T F S S, the
  work days filled in), and the members with their roles. The owner and admins
  also get an Invite member button. Manage opens the Members page.
- **Middle: the calendar.** A month of the team's check-ins. See
  [History](history.md#past-days-on-the-team-dashboard).
- **Right: three tabs.** Check-ins: one day's check-ins, today to start with,
  with arrows to step through the days, and "Away" for anyone on time off (see
  [History](history.md#past-days-on-the-team-dashboard)). Workload, for
  everyone, and Needs attention, for the owner and admins (see
  [Needs attention and workload](needs-attention.md)). The tab last used is
  remembered in this browser.
- **Not built yet:** the team photo, the four figures (members, open tasks,
  completed this week, check-in rate), meetings in the calendar, and typed
  check-in notes. Each has a task file in `workspace/tasks/Team dashboard/`.

### Team settings

The cog in the left panel's header opens the Team settings window: name,
daily check-in time, time zone and work days, the join link (owner and admins
only), and the team's labels (see [Labels and sections](labels-and-sections.md)). Each field saves when it is
left or picked, so the window ends with Done. Closing it with Escape or a
click outside saves the field being typed in too. The owner and admins edit;
everyone else sees the same window to read. Tyler first asked for these in
Settings → App settings, then chose the window, because Settings only opens
for app admins and a customer who owns a team is not one.

### The Members page

`/team/members`, opened from Manage:

- **Members.** Everyone on the team with their job title, role and the date
  they joined.
  The owner and admins change roles from the Settings button and remove people
  from the Delete button, one at a time or several at once.
- **Pending invites.** Only the owner and admins see this table. Each row can
  be sent again or cancelled.
- **Leave team.** Everyone but the owner sees it at the bottom.

## Where it lives

- **Rules:** `src/server/project/teams.ts` and `src/server/project/invites.ts`,
  with handing over, the join link, job titles, Needs attention and workload
  in `src/server/project/team-running.ts`.
- **Tables:** the join link and job titles in
  `drizzle/0104_project_running_the_team.sql`.
- **Who may do what:** `src/server/project/access.ts`.
- **Screens:** `src/components/project/team-dashboard.tsx`,
  `src/components/project/team-settings-dialog.tsx`,
  `src/components/project/team-members.tsx` and
  `src/components/project/team-start.tsx`.
- **Tests:** `src/server/project/project.test.ts`.
