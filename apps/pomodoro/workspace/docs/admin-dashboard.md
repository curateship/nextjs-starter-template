# The Flowfly admin dashboard

Every Pomodoro admin page is one three-panel dashboard at `/admin/flowfly`,
reached from one "Flowfly" link in the admin left menu.

Tyler, 13 Nov 2026: "I want to consolidate and combine all of the app's
dashboard into one 3 panel dashboard." Then, cutting the first draft's 25
sections: "I think theres way too many dashboards. Try to consolidate them. I
think the backgrounds, sound, ai generations and members upload can be in one
dashboard. We just need filtering and tabs to seperate them. Rooms, room
preset, chats can be in one dashboard." He took all seven sections offered,
then took Chat out of Rooms: "we dont need this tab". Then Focus and
Leaderboard out of Members: "we dont need the focus and leaderboard tab.
instead on profile table, add a focus time col instead". His rule for the build:
"Make sure to follow standard ui protocols. Match design pattern exactly as how
shell does it."

The task is `workspace/tasks/admin-dashboard/01-flowfly-admin-dashboard.md`.

## The seven sections and their tabs

The Dashboards block on the left page picks the section. A section's lists are
tabs in the middle's one header.

| Section | Tabs |
| --- | --- |
| Overview | none: five widgets |
| Rooms | Rooms, Weekly rooms, Invites, Presets |
| Members | Profiles, Badges, Made-up |
| Safety | Reports, Bans, Blocks |
| Social | Groups, Follows, Cheers |
| Tasks | Tasks, Sessions, Repeating, Projects, Tags |
| Library | Backgrounds, Sounds, Member uploads, AI generations |

- **Tabs in the middle are Tyler's call for Flowfly.** The Admin 3 panel skill
  says sections are never tabs in the middle; his "We just need filtering and
  tabs" overrides it here.
- **Tabs that don't fit fold into a More tab**, the shell's
  `DashboardTabButton`, never the tab showing. At 1440px wide, Library shows
  Backgrounds and Sounds with More holding the other two; Rooms shows all four.
  On a phone the tab showing and More are left. `FlowflySectionTabs` measures
  each tab's width once from a hidden copy of the row.
- **A tab shows a count only when work waits there:** Reports (reports to
  decide) and Member uploads (shared files to approve).
- **A page's old tabs are the header's view dropdown**, the shell's `ViewMenu`
  between Filter and New: Bans (Room bans, Hidden profiles, Suspensions),
  Blocks (Every block, Most blocked) and Made-up (Members, Schedule, Lines).

## Left panel

- **Header:** collapse, "Flowfly", and the ⋮ with General (Cover photo, Lock
  the notes) and Widgets (Overview's rows and spots).
- **Page:** each admin's own "/" page under the cover, saved in
  `pomodoro_admin_pages` (migration 0183), the same shape as Promo's Anti
  Detect page.
- **Dashboards block**, fixed: Overview and the six sections, each with a
  count, hidden and dragged from its ⋮. Safety counts the reports waiting for a
  decision and Library counts the shared files waiting for approval (Tyler's
  pick "Counts show waiting"); every other section counts its first tab's rows:
  rooms, accounts, groups, tasks.
- **Waiting on you block:** reports to decide, shared files to approve and
  held chat lines, oldest first. Pressing one opens it: a report on Safety →
  Reports, a share on Library → Member uploads, a held line in its room's
  record, whose Chat card lets it through or deletes it.

## Middle

Every list draws through `AdminListTable` in
`src/components/pomodoro/admin-list.tsx`, the shell's CRM header and table
(`CrmListHeader`, `CrmTable`, `CrmTableRow`), the way the shell's Users list
draws:

- **One header:** the section's tabs, then "N selected" while rows are
  ticked, the search box, Select, the "Only Sam" chip when a list is narrowed
  to one member, Filter (240px), the view dropdown, the one New button, and the
  ⋮.
- **Each page's toolbar selects became Filter rows** (`FilterPick`). Library's
  tabs filter by Status and Free or Pro (Backgrounds, Sounds), Kind, Sharing
  and Member (Member uploads), and Kind and Result (AI generations).
- **Bulk changes live in the "N selected" menu** while Select is on: Close,
  Feature, Free or Pro, Draft or Live, Resolve, Dismiss, Reopen, Hide, Lift,
  Pause, Approve, Unshare, Delete. Delete keeps its confirm
  (`admin-delete.tsx`).
- **A row** opens on the right when pressed, with the sliding bar before its
  name. Its cog opens it too, its own buttons follow, then the bin, which asks
  first. Right-click offers Mass select and Delete.
- **Columns drop out as the middle narrows**, measured from 1280 to 2240px in
  40px steps on every tab. Below a 448px middle (a phone) only the name and
  its buttons stay; the record holds the rest.
- **Backgrounds and Sounds:** New, Upload several, Import Pixabay links and
  Import a YouTube clip are the New button's dropdown. With Select on and the
  list in members' order on one page, a grip leads each row and rows drag into
  that order.
- **Rooms → ⋮** holds "Message live rooms", which was on the Chat page.

## Right panel

Every row opens a record in the shell's `RecordFrame`; there is no ×, the
first row opens on arrival, and the dashboard remembers the last place.

- **A member** (`AdminMemberRecord`, `admin-member-record.tsx`): pressing a
  member's name anywhere opens them here (`?member=<userId>`), and Profiles,
  Most blocked and Made-up rows open the same record. Its ⋮ holds Take off
  the leaderboard and Delete focus data, from the two lists that went.
  See [Members in the admin](admin-members.md).
- **A room** (`flowfly/room-record.tsx`): Details, its Chat (every line, Let
  through for a held line, Delete, Warn or Suspend its writer), Reports about
  it, Invitations (Cancel while waiting), Room bans (Lift) and the Weekly rule
  that books it. Room settings, Feature, Close and Delete are in its ⋮.
- **A report:** the message, profile, file or group it is about in full,
  Resolve and Dismiss (or Reopen) at the foot, Warn, Suspend, Hide the profile
  and Delete in its ⋮.
- **An upload or an AI generation:** the picture shown or the sound playable
  (`flowfly/media-preview.tsx`), Approve at the foot while a share waits, the
  sharing menu in its header.
- **A task** (`flowfly/task-record.tsx`): its steps, tags, due date, project
  and the timer runs counted on it. **A session:** its task, room and times.
  A session's note never shows here: it is private to the person who wrote it
  ([Session notes](session-notes.md)).
- **A project:** its figures and newest tasks, Archive or Bring back at the
  foot, its name and target hours in the ⋮, each saving when left.
- **A background or sound:** its picture or sound, details, files and credits,
  Make live or Back to draft at the foot. Change opens the item's window,
  which edits all of it (Tyler, 10 Oct 2026: "click title and settings cog to
  open modal to add/edit").
- **Every other row** shows its facts in a Details card (`DetailRecord`).

## Overview

Two panels: the left page, then the shell's widget grid. Tyler's five widgets,
two on top and three below, changed in the left ⋮ → Widgets:

- **Focus today:** hours, sessions and people, since midnight UTC, real
  members only.
- **Waiting:** the five oldest reports, shares and held lines.
- **Rooms live now:** open rooms, the people in them, held lines, and the five
  busiest rooms.
- **Made-up members:** lines today, what their chat cost, how many focused,
  and the day's chat cap.
- **Top focusers:** this week's top five on the board, real members only.

## The address

`src/lib/pomodoro/flowfly-search.ts` reads it: `section`, `list` (the tab when
it is not the section's first), `open`, `member`, and the tab's own search,
filters, sort and page, each checked the way its old page checked it. A bare
`/admin/flowfly` goes back to the last place. The route reads only the tab
showing (`src/lib/pomodoro/flowfly-load.ts`); a list asks again in place after
that. While the next tab's rows load, the last tab keeps the address it was
drawn for.

## Old addresses

Every `/admin/pomodoro-*` page forwards to its tab, keeping the rest of its
address (`OLD_ADMIN_PAGES`). Chat goes to Rooms, Focus and Leaderboard go to
Profiles, each without its old filters; Follows' Cheers tab goes to Cheers. Migration 0183 points saved bell notices the same way and swaps each
saved left menu's Pomodoro links for one Flowfly link. The live site gets both
at the next deploy.
