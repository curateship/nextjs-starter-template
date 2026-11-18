# The Listings dashboard

Everything about a site's listings sits on one three-panel dashboard at
`/admin/listings`, laid out like the shell's Admin, CRM and Automations
dashboards. Tyler asked for it on 18 Nov 2026: "Cosolidate listings into one 3
panel dashboard. Match design pattern of the shell 1 to 1." Before that, each
part was a table page of its own, and every record opened in a window.

- **Where the code is:** `src/components/directory/listings-dashboard/`. The
  frame is `listings-dashboard.tsx`, and each row of the Dashboards block has
  a file in `sections/`.
- **The address:** `src/lib/directory/listings-dashboard-search.ts`. Listings
  is the row with no `section`. The open record is `?open=`.
- **The left page's table:** `directory_listing_pages`, one row per site,
  from `drizzle/0155_cms_listing_pages.sql`. It is owed on live until the next
  deploy runs it.

## The rows

The Dashboards block lists them in Tyler's order, records first and then the
queues:

| Row | What it holds | Its pill counts |
| --- | --- | --- |
| Overview | Widgets, no right panel | Widgets shown |
| Listings | Every listing | Every listing |
| Categories | The category tree | Every category |
| Custom fields | The site's own sections of fields | Every section |
| Guides | The guides the editor writes | Every guide |
| Promotions | The site's deals, each at one listing | Every deal |
| Submissions | Listings the public asked for | Waiting ones |
| Claims | People asking to look after a listing | Waiting ones |
| Owner changes | Changes owners asked for | Waiting ones |
| Deals from owners | Deals and changes owners sent | Waiting ones |
| Reports | Problems visitors reported | Open ones |
| Featured plans | What the site sells the top of its pages for | Every plan |
| Placements | Featured spots sold | Running ones |
| Saved lists | Visitors' saved lists | Every list |
| Outreach | Unclaimed listings to invite owners to | Every one with an email |

- **Hiding and moving rows:** the block's ⋮ hides any row but Overview and
  drags the rows into order. The choice is the site's, saved with its page.
  A row added after a site dragged its rows goes in its own place, after the
  row it follows above, not at the end.
- **Promotions and Deals from owners moved in on 18 Nov 2026** (Tyler: "we
  have to move promotions in the new dashboard too"), since every deal
  belongs to one listing. `workspace/docs/promotions.md` says what is
  particular to them.
- **Owner changes has a row of its own.** It was the second table on the old
  Claims page, and a row has one header only.
- **Old addresses forward.** `/admin/listing-fields`, `listing-submissions`,
  `listing-claims`, `listing-reports`, `listing-featured`, `listing-guides`,
  `listing-saves`, `listing-outreach`, `/admin/categories`,
  `/admin/promotions` and `/admin/promotion-requests` each go to their
  row with the same search, filters and open record. `listing-claims?request=`
  goes to Owner changes. A link to one submission, claim, owner change, deal
  request or report shows every status, so one already decided is still in the list
  rather than left out by the Waiting filter. The admin emails in `src/server/directory/notify.ts`
  link straight to the rows.
- **Event submissions stays where it was,** at `/admin/event-submissions`.

## The left page

The site's own page of blocks, saved 700ms after typing stops, under a
cover photo when one is set. Every admin of the site shares it.

- **Dashboards block:** fixed. The editor refuses to delete it, and the
  server puts it back at the top of a page saved without it.
- **Needs you block:** the oldest waiting submissions, claims, owner changes,
  deals from owners and reports, all kinds together, five rows and then Show all. Each row says
  how long it has waited, with an amber dot from three days. A row opens its
  record.
- **Categories block:** every one of the site's categories, biggest first, with empty ones last at 0, so "Show all" lists the same number as the Categories row.
  Pressing one narrows Listings to it and keeps the other filters. Pressing it
  again lets it go.
- **The +** opens New listing over the middle.
- **The ⋮** has three tabs. General holds the cover photo and Lock the notes.
  Widgets holds Overview's rows and spots. Claims holds what the site says
  about claiming, which sat in a card on the old Claims page.

## The middle

Every row has the same header and table, the shell's `CrmListHeader` and
`CrmTable`.

- **Header, left to right:** the row's icon and name, the "N selected" menu
  while rows are ticked, the search box, Select, Filter, then the one New …
  button where the row makes things.
- **Filter is remembered** per person and site in this browser, for each row
  on its own (Tyler's pick: "remembered per person and site"). Going back to a
  row from the Dashboards block brings its filters back.
  `useRememberedFilters` in `section-parts.tsx` keeps them.
- **Every row has a right-click menu** (Tyler, 18 Nov 2026: "Make sure right
  click is enabled for mass select, duplicates and delete"). It starts with
  Mass select, then Duplicate where the admin makes the record (listings,
  categories, custom fields, guides, plans), then Delete in red where a record
  can be deleted. A row that is a decision rather than a record (a
  submission, claim, owner change, report, placement or outreach row) offers
  Mass select alone.
- **What Select does on each row:**
  - Listings: Set a category, Publish, Unpublish and Delete.
  - Categories, Custom fields, Guides, Featured plans and Saved lists:
    Delete.
  - Submissions and Claims: Reject.
  - Owner changes: Turn down.
  - Reports: Mark fixed and Dismiss.
  - Placements: Revoke.
  - Outreach: Send invitations.
- **Approving stays one at a time.** Submissions, claims and owner changes
  approve only from the record. Handing out several listings unread, or
  applying several people's edits unread, is what those queues exist to stop.
  Rejecting several at once is allowed, and each one still emails its person.
- **A batch that only partly works says how far it got:** "3 of 5 rejected.
  Two could not be, and stay waiting."
- **A queue opens on its waiting records.** Status in Filter shows the
  others, and All shows every one.
- **Waiting time:** Submissions, Claims, Owner changes and Reports show how
  long each record has waited. From three days the chip turns amber (Tyler,
  18 Nov 2026, picked 3 days).
- **Listings** fall under folding Published, Draft and Closed headings, and
  each heading counts every listing under it rather than the page in view.
  Closed starts folded. The search also finds the street address and any
  category's name.
- **Categories** fold by family. A top-level category with subcategories is
  a heading over itself and every category under it. Categories with no
  parent and no children sit last under "On their own". Pressing a count opens
  Listings narrowed to that category.
- **Custom fields** keep the order they have on a listing's page. Move up and
  Move down are in a row's right-click menu and its ⋮. New section never
  greys out: at twelve sections it opens and says "A site can have 12
  sections. Delete one to add another."
- **Featured plans** say how many spots are taken: "2 of 3 spots taken" for a
  plan selling one category's spots, counting checkouts that are still open,
  or how many placements run on a plan with no limit.
- **Placements** ending within seven days are tinted amber and come first.
- **Outreach** ticks survive paging. Sending to more than 50 owners goes out
  in groups of 50, one after another, and a refused group says how many went
  before it.
- **Rows open at once.** Listings, Guides and Saved lists read a record
  while the pointer is on its way to the row, so the right panel has nothing
  to wait for. The other rows already hold their records.

## The right panel

Every record opens in the shell's `RecordFrame`: its icon or photo, its name
and one line, its ⋮, and the collapse button. There is no ×. A first visit
opens the first row, and after that the dashboard remembers the record.

- **A listing or guide stays open** when it is not on the page in view: one
  opened from a link in another row, one past the first page or under the
  folded Closed heading, and one an edit has just moved out of the list (set
  to Closed, or renamed away from the search). A new search, filter, sort or
  page that leaves it out opens the first row; deleting it does too. The
  queue rows draw their record from the list, so there the first row opens
  whenever the open one is not in it.
- **A bulk change reaches the open listing.** Publish, Unpublish or Set a
  category on ticked rows that include the open listing reads its record
  again, so the next edit cannot save the old values back.

- **Records save themselves.** A listing, category, custom section, guide,
  plan or saved list saves 700ms after the last change, or at once when
  another record opens. The footer says Saving or Saved. A field the server
  would refuse (an empty name, a rating that is not a number, half a map pin)
  holds the save, and the footer says which field to fix. Leaving the record
  then says its last changes were not saved. An address part
  saves when its box is left, never mid-word, because it moves the public
  page.
- **The record ⋮** is one General tab: grouped rows (a listing's Status,
  Primary category and Display order), then actions, then the red one under a
  line.
- **The footer** holds the record's state and its main button: Publish or
  Unpublish, Approve or Reject, Mark fixed or Dismiss, Put on sale, Send
  invitation.
- **A listing** also shows three cards of facts about it, each opening its
  own record:
  - Owner, reports and saves: who looks after it, any waiting claim, its
    open reports, and how many people saved it.
  - Views: the last 7 days, 30 days, year and all time.
  - Where it appears: the guides it is in, its upcoming events and its live
    deals.
- **An owner change** shows each field they touched twice: what the listing
  says now, then what they asked for.
- **Links never leave the dashboard.** A claim, report, placement or saved
  list opens its listing on the Listings row. Events and deals open on their
  own admin pages, which are not part of Listings.
- **A new record** starts from a small New … dropdown under its button, then
  opens on the right.

## Overview

Two panels, the left page and the widgets, with no right panel. The widgets
are what used to sit above or beside the old tables:

- Featured income, Running placements and Plans offered, from the Featured
  page's three cards.
- Most saved listings, from the Saves page. A row opens the listing.
- Send history, from the Outreach page. A row opens that listing on the
  Outreach row.

## Why it draws in the browser only

The route has `ssr: false`. Drawn on the server, the shell's three-panel
frame has no Settings → Styling to read, so it drew the side panels at other
widths than the browser did, and React refused to patch the difference.

## Checking it

1. Open `http://localhost:3015/admin/listings`. The left page shows the
   Dashboards, Needs you and Categories blocks, and the first listing opens on
   the right.
2. Change a listing's search description and wait a second. The footer says
   Saved. Reload and the change is still there.
3. Right-click a listing row. The menu shows Mass select, Duplicate and
   Delete.
4. Press Submissions on the left. Waiting submissions show, with amber chips
   from three days.
5. Open `http://localhost:3015/admin/listing-claims`. It lands on the Claims
   row.
