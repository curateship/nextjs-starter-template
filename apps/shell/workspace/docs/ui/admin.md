# Admin

Admin is one three-panel dashboard at `/admin/dashboard` in place of the
Overview, Users, Plans, Feedback, Announcements and Analytics screens. Tyler
asked for it on 8 Nov 2026: "consolidate analytics with everything else
(except images) into a dashboard called "Admin" because its a big dashboard,
we have to remove a lot of panels we dont need". The task is
`workspace/tasks/features/admin/admin.md`.

## Tyler's rules (8 Nov 2026)

- Three middle tabs: Overview, Users, Feedback. Overview was called Analytics
  until "Rename analytic to overview". Usage was a tab of its own until "There
  is not enough here to justified its own tab. This can just go under
  overview".
- No block for a handful of figures: "We dont need these 4 blocks as they are
  not important enough to have its own block."
- Plans and announcements get no table. "The plans doesnt need a full table",
  and "The announcement also doesnt need a table. It can live in the top left
  3 dots dropdown in a tab". Plans are also a block: "the plans should go in
  top left dropdown as well as a block for it".
- "Clicking on the feedback thread should open its thread on the right panel
  to see all the replies and I can also reply to it in the footer."
- "For users dashboard, clicking the user should open its user data on the
  right panel."
- "Middle panel analytic card should be edge to edge design."
- Top pages, Devices and Top referrers "should be a part of the views per day
  panel. Maybe put it in a "More details" tab?"
- The right panel's lists "should be real blocks".

## What each panel holds

| Tab | Middle | Right |
| --- | --- | --- |
| Overview | Views per day, Daily AI spend, By person | The Notes page |
| Users | Every account, with search, Role and Status | The person picked |
| Feedback | Every piece of feedback, with search and Type | The thread picked, with a reply box |

- **Left:** the Admin page, one per site, beside every tab. Its ⋮ has three
  tabs: General (Cover photo, Lock the notes), Announcements and Plans. A row
  in Announcements or Plans opens that one's window, and each list ends with
  New announcement or New plan. Retire, Delete and Archive are in the windows.
  A new site's page starts with the Plans block.
- **Middle:** one header, the tabs first and then the open tab's own toolbar.
  On Overview that is the date range: Today, 7 days, 30 days, 90 days or Year.
  Everything under the header sits straight on the panel with no card frame,
  its lines running to the panel's edges.
- **Overview's charts:** Views per day and Daily AI spend each have a More
  details tab. Views per day's holds Top pages, Devices and Top referrers.
  Daily AI spend's holds By feature, By model and By meter. The three lists
  sit side by side when the middle is wide and stack when it is narrow. The
  tab picked is remembered in this browser.
- **By person:** each person's AI spend, AI calls, AI allowance this month,
  metered units and last use, one row each. A name opens that person in the
  Users tab.
- **Right on Overview:** the Notes page, one per site, empty until blocks are
  added with "/". Its ⋮ holds Cover photo and Lock the notes.
- **The "/" blocks:** both pages offer Plans, Top pages, Devices, Top
  referrers, By feature, By model and By meter. A figure block counts the
  range picked on Overview, on every tab. The left page's figure blocks read
  Overview's figures on Users and Feedback too, only when one is on the page.

## Users

- **List:** every account, with search, Filter (Role, and Status, which includes Locked out), Mass select
  for deleting or restoring the ticked rows, and Add account. Paging and the
  search ask the server again in place. A right-click on a row offers View as
  member, Restore and Delete; your own account has no Delete anywhere.
- **The person on the right:** pressing a row opens them; with nothing open,
  the first row shows. The body holds Profile, Security reports (only when
  there are any), Plan, Storage (with "Open their files") and Billing
  history, as folding cards.
- **The person's ⋮:** Access (Role, Status), Plan (Granted plan, Ends on, AI
  allowance) and Member tags, then Pause or Start their plan again, Cancel
  their paid plan, View as member, Restore, and Delete in red. Each field
  saves when it is picked or left, with no Save button, and role, status and
  plan changes email the person as they always did.

## Feedback

- **List:** every piece of feedback, with search, Filter (Type), Mass select
  for deleting, and New feedback, which opens the shell's feedback window.
  The route reads the whole board once; search, sort and paging then run on
  that copy, and a new piece sent from the feedback window reads it again.
- **The thread on the right:** pressing a row opens it; with nothing open,
  the first row shows. It holds the message, its tags and screenshot, then
  every reply oldest first. A reply its writer or an admin may delete has a
  bin.
- **The thread's ⋮:** Feedback settings and Merge open their windows; Delete
  asks first.
- **The reply box** sits in the panel's footer. Enter sends and Shift+Enter
  starts a new line. Sending notifies the author, unless you are the author,
  and the row's Replies count goes up at once.

The three panels stay put while the tab changes: only the middle and the
record on the right belong to the tab, so the left page, its ⋮ and anything
being typed there carry on across a switch. A page, plan or announcement list
that could not be read says so, with Try again.

Opened at its bare address, Admin goes back to the tab, range and record it
last had in this browser. A tab picked starts the address again with only the
range kept, so a search on Users never filters Feedback.

## How the range counts

Every range is whole days in UTC, today included: 7 days is today and the six
before it, and Today is since midnight UTC (`lib/analytics/range.ts`).

Two figures do not follow the range, and say so:

- **AI allowance, this month.** By person's allowance column is the calendar
  month's spend against the member's monthly allowance, whatever the range,
  because the allowance resets each month.
- **Stripe reports to review.** By meter counts every usage report still
  pending or failed, whatever its date, because a report stuck since last
  month still needs looking at.

Usage rows are never pruned, so a Year of AI and metered usage can show.
Traffic keeps its daily totals after the detailed visits are removed, so a
Year shows there too.

## The old addresses

`/admin/users`, `/admin/feedback`, `/admin/plans`, `/admin/announcements`,
`/admin/analytics`, `/admin/traffic`, `/admin/ai`, `/admin/ai-usage` and
`/admin/referrals` forward to Admin, to the matching tab, carrying `?open=`
for Users and Feedback so older links land on the same record. The four
Analytics addresses land on Overview; the rest land on Admin's last place.
`/admin/notifications` lands on Admin and `/changelog` on the home page.
The left menu's version 23 step makes the Overview link "Admin" (keeping a
name somebody gave it) and takes out every link to a screen Admin holds or
that was removed with it.

## Where it lives

- Route: `src/routes/_authenticated/admin/dashboard.tsx`, address keys in
  `src/lib/admin-dashboard/admin-search.ts`, Overview's three readers in
  `src/lib/admin-dashboard/overview-figures.ts`.
- Screen: `src/components/admin-dashboard/`: the frame
  (`admin-dashboard.tsx`), the two pages (`admin-page-panel.tsx`), their
  blocks (`admin-blocks.tsx`), and one file per tab.
- Pages: `src/server/admin-dashboard/page.ts`, table `admin_pages`, one row
  per site and side.
- Windows: `components/admin/plan-dialog.tsx` and
  `components/admin/announcement-dialog.tsx`.
