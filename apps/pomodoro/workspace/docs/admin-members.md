# Members in the admin

Pressing a member's name on any Flowfly list opens everything about them in
the right panel (admin task 06, 8 Oct 2026, moved out of its window on
13 Nov 2026 with Tyler's picks "Member on the right", "One record per person"
and "Member owns-everything tabs"). The lists themselves are in
[The Flowfly admin dashboard](admin-dashboard.md). This file covers the
member's record and the two repair tools in it.

## The member's record

- **It opens from a name.** Every Flowfly list draws a member's name as a
  button (`MemberName`). Pressing it puts `?member=<userId>` in the address
  and shows them on the right in place of the open row; pressing a row brings
  the row back. Back undoes it, and the address can be handed to another
  admin.
- **Rows that are people open it too:** Members → Profiles and Made-up, and
  Safety → Blocks' Most blocked. A profile is
  not a record of its own any more.
- **It loads its own data**, so it reads the same wherever it opened. The list
  beside it does not reload. It is `AdminMemberRecord` in
  `src/components/pomodoro/admin-member-record.tsx`, drawn in the shell's
  `RecordFrame` the way the shell's Users list draws a person.

The header: their initials, name, and "Made up" for a made-up member, their
handle and email. Its ⋮ holds what changes them:

- **Profile:** Handle, Display name and Bio, each a row that opens a small box
  and saves when left. The owner is told which fields changed, never which
  admin changed them, as the old profile window told them. A member with no
  handle shows "No handle yet".
- Warn, Fix a streak day, Hide profile or Show profile, Open in Users (the
  shell's Admin → Users with them open), Remove all their follows, and
  Suspend, red, last.

The body, as folding cards, top to bottom:

- **Account:** plan, joined date, whether the public profile is public,
  switched off or hidden, and whether they are on the leaderboard.
- **Focus:** all-time sessions, focus time, tasks done, last day focused, the
  current and best streak, and any days an admin put back.
- **Sessions:** the last 10, newest first.
- **Open tasks:** up to ten, with the count.
- **Rooms:** how many they hosted and how many other people's rooms they sat
  in, the latest of each.
- **Reports:** how many are about them (and how many still wait), how many
  they filed (and how many were dismissed).
- **Uploads:** count, total size and the latest files.
- **Badges, groups and projects:** links to their badges, groups, projects,
  task tags and repeating tasks.
- **Warnings and suspensions**, newest first.
- **Follows:** how many people they follow.
- **Voice** for a made-up member, and **Admin notes**.

Every card that lists things ends in a link that opens that tab of Flowfly
narrowed to them, where every row has its Delete: Sessions, Tasks, Rooms they
host, Reports, Uploads, Badges, Groups, Projects, Tags, Repeating, Bans,
Follows. The full lists live there rather than inside the record, so one
member with thousands of sessions never slows the panel.

The footer says when they last focused, or that they are suspended, with
Warn beside it.

Each count comes from the same table its list reads, so the two agree. The
focus totals are the `daily_focus_stats` rollup Focus shows.

## Fixing a broken streak

Tyler's case: a member writes in that their 40-day streak broke during an
outage on 3 Oct. The admin opens them, presses **Fix a streak day**, picks
3 Oct, writes "Outage, 3 Oct", and the streak is whole again.

- **The day counts for the streak and nothing else.** It goes into its own
  table, `pomodoro_streak_fixes`, which only the streak count reads. The
  daily totals are not touched, so History's hours, the leaderboard, the
  public figures and the share card stay exactly as they were. The task asked
  for "one focus session's minutes" on the day and also that the hours not
  move; keeping the day apart is how both hold.
- **Badges never come from a fixed day.** The badge check counts real focus
  days only. A member who reaches 30 days only with a fixed day in the middle
  sees a 30-day streak but does not get the 30-day badge until they earn one
  without it. This is the guard against an admin fix becoming a way to fake a
  ranking or a badge.
- **The day is the member's own calendar day**, in the timezone on their
  profile. The window says which timezone and what today is there.
- **Refused, with a reason:** a day still to come on their clock, a day they
  already focused (it is already in the streak), and a day already put back.
- **The member is told** in the bell: "We restored Oct 3 to your streak." It
  links to History and never says which admin.
- **It is logged** as `fix_streak_day` in `pomodoro_audit_logs`, and the
  reason is kept on the fix itself.
- **There is no undo button.** A fixed day stays. Removing one is a database
  job for now.

Every reader of the streak goes through `loadFocusStreaks` or
`loadFocusSummary` in `productivity.ts`, so the timer, the streak badge
image, the streak reminder, the public profile and the share card all count
the fixed day. Two places do not. The badges panel's progress towards a streak
badge counts real days, because it is the badge check. The year-in-review best
streak is worked out from that year's focus days alone.

## Admin notes

- **Only admins see them.** Nothing a member can reach reads
  `pomodoro_admin_notes`.
- **Each note is stamped** with who wrote it and when, and, after an edit, who
  edited it and when.
- **Any admin can edit or delete any note.** Every add, edit and delete writes
  one row to `pomodoro_audit_logs` (`add_note`, `edit_note`, `delete_note`).
- **A half-written note lives as long as the record.** Opening another row or
  member on the right drops it, since the record no longer sits in a window
  that could ask first.

## Hide profile and Remove all their follows

- **Hide profile** hides the public page without a report to hang it on. The
  owner is told in the bell in the same words a hide from a report uses.
  Showing it again is Lift on the Bans page's Hidden profiles tab.
- **Remove all their follows** deletes every follow this person made, for an
  account that followed people to spam them. Follows of them are kept. Nobody
  is told, the same as an unfollow. Logged as `delete` on `follows`.

## Where the code lives

- `src/components/pomodoro/admin-member-name.tsx`: the clickable name and the
  address change that opens and closes the window.
- `src/components/pomodoro/admin-member-record.tsx`: the record, the Fix a
  streak day window and the notes.
- `src/server/pomodoro/admin-members.ts`: the one read behind the window, the
  streak fix, the notes, hide and remove follows. Tested against a real
  database in `admin-members.test.ts`.
- `src/lib/api/pomodoro/admin-members.ts`: the server functions, every one
  behind `adminGet` or `adminPost`. `admin-guards.test.ts` checks that every
  Pomoder admin server function stands behind one of the two.
- Migration `0127_pomodoro_members_admin.sql`: the fixes and notes tables, the
  leaderboard hide on profiles and the revoke on badges.
