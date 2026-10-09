# Members in the admin

Clicking a member's name on any Pomoder admin list opens one window with
everything about them (admin task 06, 8 Oct 2026). Around it sit nine pages for
member data that had no admin view before. This file covers the window and the
two repair tools inside it. The pages are listed in
[Admin sections](admin-sections.md).

## The member window

- **It opens from a name.** Every Pomoder admin list draws a member's name as a
  button. Clicking it puts `?member=<userId>` in the address and opens the
  window over the list. Back closes it, and the address can be handed to
  another admin.
- **It loads its own data**, so it reads the same whichever list it opened
  from. The list behind it does not reload.
- **One file mounts it for every list.** `admin-list.tsx` draws it under the
  table, so a new list gets it by drawing names with `MemberName`. Each route
  keeps `member` in its address checks through `readMemberSearch`.

What it shows, top to bottom:

- **Account:** photo, name, handle and email in the heading, then plan, joined
  date, last day focused, whether the public profile is public, switched off
  or hidden, whether they are on the leaderboard, and a running room
  suspension. Buttons: Warn, Suspend (both from
  [Admin safety tools](admin-safety-tools.md)), Hide profile, and Open in
  Users, which opens the shell's own account window at `/admin/users`.
- **Focus:** all-time sessions, focus time and tasks done from the daily
  totals, the current and best streak, and any days an admin put back.
- **Last 10 sessions**, newest first, with a link to Focus sessions for them.
- **Open tasks**, up to ten, with the count and a link to Tasks for them.
- **Rooms:** how many they hosted and how many other people's rooms they sat
  in, the latest of each, and a link to the rooms they host.
- **Reports:** how many are about them (and how many still wait), how many
  they filed (and how many were dismissed), with a link to Room reports for
  them.
- **Uploads:** count, total size and the latest files, linking to Member
  uploads.
- **Warnings and suspensions**, newest first, linking to Bans.
- **Follows:** how many people they follow, a link to Follows and cheers, and
  "Remove all their follows".
- **Admin notes.**

Each count in the window comes from the same table its list reads, so the two
agree. The window's focus totals are the `daily_focus_stats` rollup Focus data
shows.

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
- **Typed work is protected.** Closing the window with a half-written note asks
  first, the way every form window does.

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
- `src/components/pomodoro/admin-member-window.tsx`: the window, the Fix a
  streak day window and the notes.
- `src/server/pomodoro/admin-members.ts`: the one read behind the window, the
  streak fix, the notes, hide and remove follows. Tested against a real
  database in `admin-members.test.ts`.
- `src/lib/api/pomodoro/admin-members.ts`: the server functions, every one
  behind `adminGet` or `adminPost`. `admin-guards.test.ts` checks that every
  Pomoder admin server function stands behind one of the two.
- Migration `0127_pomodoro_members_admin.sql`: the fixes and notes tables, the
  leaderboard hide on profiles and the revoke on badges.
