# The Viral dashboard

Viral is one three-panel dashboard at `/admin/viral`, laid out like the
shell's Admin and CRM dashboards. Tyler, 19 Nov 2026: "I want to consolidate
the currant 4 pages dashboard into one 3 panel dashboard using the shell's
design patter", and again on 21 Nov 2026: "combine all these dashboard into
one 3 panel dashboard". Today, Projects, Vault and Library became its rows.
Each project opens on its own three-panel dashboard, as Promo's do (`project-page.md`).

Code: `src/components/viral/dashboard/`, route
`src/routes/_authenticated/admin/viral.tsx`. Task:
`workspace/tasks/features/03-one-viral-dashboard.md`.

## The left menu and the home page

- **One link.** The left menu's Viral section holds one item, named "Viral",
  because the shell's own "Dashboard" link sits in the same menu.
- **No forwarding.** The old addresses `/admin/today`, `/admin/projects`,
  `/admin/vault` and `/admin/library` are gone, not forwarded (Tyler, 19 Nov
  2026: "one entry but dont need forward any links"). A link Video kept from
  before to `/admin/vault` no longer opens.
- **The menu job.** `src/server/viral/navigation.ts` swaps the four old
  links for the one in every saved menu, once per menu. An admin's own links
  in the section stay where they were. A home page still on `/admin/today`
  moves to `/admin/viral`, once. An admin who picked another home page
  keeps it.

## The left page

Each person has their own page, because every Viral record belongs to its
owner (`viral_dashboard_pages`, `drizzle/0129_viral_dashboard_pages.sql`).

- **Header.** The collapse button, "Viral", the + that opens New project,
  and the ⋮: General (Cover photo, and Lock blocks in its footer) and
  Widgets (Overview's rows and spots).
- **The cover** lies behind the top of the left panel and carries on behind
  the right panel.
- **The page** is written on like any page in the design, with these "/"
  blocks:
  - **Dashboards**, fixed: Overview, Projects, Vault, Hooks and Formats, each
    with its count. Its ⋮ hides and shows every row but Overview and drags
    them into order. It can move up and down but never leaves the page.
  - **Projects:** "All projects", then every project that isn't archived. As
    Promo's Projects block, a project narrows whichever row is showing to it
    (`?project=`): Overview's widgets, the Projects row to its own row, and
    Vault, Hooks and Formats to its ideas, hooks and the project Write a
    script writes for. Its pill counts the project's ideas, or its hooks on
    Hooks. Pressing it again lets it go.
  - **Folders:** All projects, No folder, each folder and Archived, each with
    its count. A row narrows the Projects row (`?folder=`). The block's ⋮
    holds New folder; a folder row's ⋯ holds Rename and Delete, which asks
    first and says the projects inside stay. These were the old Projects
    page's folder dropdown.
- **Where a bare address lands:** the row and record last open here, or
  Projects in a browser that never opened the dashboard.

## Overview

Two widgets straight on the dashboard, with no right panel, which were the
old Today page's two tables (Tyler, 19 Nov 2026: "Today's two tables become
Overview widgets"). The Widgets tab in the left ⋮ changes the rows and spots.

- **New and rising.** For each project that isn't archived, up to 5 videos
  that are new to you or rising fast, passing the project's minimum score
  and minimum views, best score first, under the project's name. A row opens
  the video on its project's dashboard. New means nobody has opened it yet
  (`finding-content.md`); rising fast means its views at least doubled since
  the day before (`sorts-and-score.md`).
- **Vault by status.** One row per project with ideas in its vault, saying
  how many sit at each status. A row opens Vault narrowed to that project.
- **Cost.** Overview never calls YouTube or an AI. It reads what the
  searches and creator reads already saved (`src/server/viral/today.ts`).

## Projects

Every project, pinned ones first, on the shell's table.

- **A row, or its name,** opens the project's own dashboard (Tyler, 19 Nov
  2026: "The link should go straight to the project dashboard and there
  should be an eye icon in action col to show a preview in the right panel
  for that project's details"), as Promo's Projects row does.
- **Actions:** the eye, Pin, Duplicate, Archive (Bring back on Archived),
  and the bin, which asks first and says what goes.
- **The eye** shows the project on the right: its cover, Your topic, the
  description, its socials, and its numbers. Its ⋮ is the project's settings,
  the same rows as the ⋮ on the project's own dashboard. Its footer has Open
  project. The first project shows on arrival.
- **Right-click** a row for Select, Show here, Duplicate, Archive and Delete.
- **Select** ticks projects, and "N selected" moves them to a folder,
  archives them or deletes them.
- **New project** opens the window with Name, Your topic, Niche (the
  description) and
  Socials. With no projects at all, the empty list offers Add a sample
  project.
- **Search** finds projects by name and description, and under a Videos
  heading up to 50 matching videos from every project, by title and channel
  (Tyler, 19 Nov 2026: Today's "Search every project" moves here). Pressing
  a video opens it on its project's dashboard.
- **While a project searches** in the background, the list reads itself
  again every 5 seconds.

## Vault

Every project's saved ideas, or one project's, picked in the Projects block
(`vault.md`). The header holds "N selected", search, Select, Filter (Status,
Tag, and Show as List or Board) and Views, then New idea. The open idea is
on the right in the shell's record frame. Its ⋮ holds Status as a row, then
Open, Copy link, Download to computer, Copy to another project, and Delete
from the vault in red. Right-click an idea for Select and Delete.

## Hooks and Formats

Library → Hooks and Library → Formats became two rows (`library.md`).

- **Hooks:** every hook, narrowed by the Projects block. Filter holds Tag
  and Type; Views and New hook sit in the header. The open hook is on the
  right; its ⋮ copies it and opens it in a project, and your own hook's ⋮
  also holds Words, Link and Type as rows, and Delete hook.
- **Formats:** every saved format. The project picked in the Projects block
  is the one Write a script writes for. The open format's ⋮ holds Name and
  Delete format.
