# An app's own Admin blocks and widgets

An app adds "/" blocks to the Admin dashboard's left page, and widgets to its
Overview, from its own `src/app/options.ts`. It never edits a shell file to do
it. Tyler asked for this on 8 Nov 2026: "We also need to build it in a way
that each individual app can add its own block and widget without having to
modify shell". What the Admin dashboard is, panel by panel, is in the shell's
`apps/shell/workspace/docs/ui/admin.md`.

## What an app writes

Two lists under `admin` in the app's options, one entry per block or widget:

```ts
// src/app/options.ts
import { CalendarIcon, PlaneIcon } from "lucide-react"
import type { AppOptions } from "@/lib/app-options"

export const appOptions: AppOptions = {
  admin: {
    blocks: [
      { key: "trips-today", label: "Trips today", icon: PlaneIcon, load: () => import("./admin/trips-today") },
    ],
    widgets: [
      { key: "bookings", label: "Bookings", icon: CalendarIcon, load: () => import("./admin/bookings-widget") },
    ],
  },
}
```

- **`key`:** lower-case letters, digits and single dashes, starting with a
  letter. It names what is saved: a block on a page, or a widget in the
  Overview layout. Changing it later loses every one already placed.
- **`label` and `icon`:** the "/" row or the widget's heading, and its
  lucide icon.
- **`load`:** a function returning an import of the file whose default export
  is the component. It is a pointer, never the component itself, for the same
  reason a Settings tab's `panel` is: the component reads its figures through
  `@/lib/api/*`, and the options are reachable from the server. The file is
  fetched the first time the block or widget shows.

## What the component gets

```tsx
// src/app/admin/bookings-widget.tsx
import type { AdminAdditionProps } from "@/lib/admin-dashboard/admin-additions"

export default function BookingsWidget({ days }: AdminAdditionProps) {
  // Read the app's own figures for the range, through its own src/lib/api/ reader.
}
```

- **`days`** is the Date range picked in the Admin ⋮'s General tab: 1, 7,
  30, 90 or 365.
- **It reads its own data** through a server function the app declares in
  `src/lib/api/`, never in `src/app/`, because the guard test only walks
  `src/lib/api` (`shell-and-apps.md`).
- **A member's name** can be `MemberName` from
  `components/admin-dashboard/admin-parts.tsx`, which opens that person in
  Users. `SideRows` (`components/shared/notes/side-rows.tsx`) draws the
  narrow rows the shell's own lists use.
- **A widget** sits in the shell's `WidgetCard`, with its label, icon and the
  widget's ⋮ on the heading, and scrolls inside the card. Draw only what goes
  on the white tile.
- **A block** sits in the shell's `BlockCard`, which folds by its title and
  has Delete block in its ⋮.
- **One that throws** says "This widget could not be drawn." or "This block
  could not be drawn." in its own card, and the rest of the dashboard
  carries on.

## Widgets on the CRM's Overview

The CRM dashboard has an Overview of widgets too, laid out as Admin's (Tyler,
8 Nov 2026: "We need to get the CRM dashboard up to date with the new admin
dashboard. We dont have any CRM widgets so lets leave it empty for now"). The
shell has none of its own there, so it says "No CRM widgets yet." until an
app adds some, in the same shape under `crm`:

```ts
export const appOptions: AppOptions = {
  crm: {
    widgets: [
      { key: "deals-won", label: "Deals won", icon: TrophyIcon, load: () => import("./crm/deals-won-widget") },
    ],
  },
}
```

A CRM widget gets the same props. The CRM has no Date range of its own, so
`days` is always the default range, 30. Its layout is kept apart from
Admin's (`admin_widget_layouts`, board `crm`), and its keys only have to
differ from each other.

## A grid of an app's own

An app can draw the same grid of widgets on a dashboard of its own, with its
own list of widgets and its own place to keep the layout. Trade's dashboard
is the first (8 Nov 2026): its six trading widgets, with the layout kept per
account rather than per site.

```tsx
const store: WidgetStore = { load: loadMyLayout, save: saveMyLayout, message: myErrorMessage }
const widgets = useWidgetLayout(store, seedFromTheRoute)

<WidgetGrid offer={{ choices: MY_WIDGETS }} layout={widgets.layout} onChange={widgets.change}
  drawWidget={(id, menu) => <MyWidget id={id} menu={menu} />} />
<WidgetSettings offer={{ choices: MY_WIDGETS }} layout={widgets.layout} error={widgets.error}
  onRetry={widgets.retry} onChange={widgets.change} />
```

- **`offer`** goes where `board` would: the widgets offered in the Widgets
  tab, each widget's ⋮ and an empty spot, and, as `none`, what an empty list
  says. Exactly one of `board` and `offer` is given.
- **`drawWidget`** draws every widget of an offer. There are no app widgets
  loaded by key on a grid of its own, so an id it does not draw shows as an
  empty spot.
- **The layout** has the same shape and rules: `cleanWidgetLayout`,
  `placeWidget`, `setRowColumns` and `widgetsShown` in
  `src/lib/admin-dashboard/overview-widgets.ts` work on it as they do on
  Admin's. The app's server cleans what it stores with `cleanWidgetLayout`
  and its own list of ids.
- **A widget's own buttons**, a Filter or a period picker, go in the card's
  heading beside its ⋮ through `WidgetHeadingActions` from `widget-card.tsx`
  (Tyler, 8 Nov 2026: "move the buttons here"). Outside a widget card it draws
  them where it is. A heading too narrow for them puts them and the ⋮ on a
  second line under the name.
- **Spacing and lines:** widgets sit the site's gutter apart (`pageGutter`,
  Settings → Styling), and a table's heading row inside a widget's or a
  block's tile is the tile's colour with the Divider lines colour alone as
  its line (8 Nov 2026).
- **The store** answers each save with the layout as stored, the way
  Admin's does, and its `message` turns a failure into words for the error
  row and the toast.

## What the shell does with them

- **The "/" list** on the Admin page offers the shell's Plans, then the
  app's blocks, under Advanced blocks. An app block's saved node name comes
  from its key (`trip-count` is `noteAdminAppTripCount`), so the app never
  names one, and the server keeps it on a saved page because it reads the
  same keys.
- **The Widgets tab** of the Admin ⋮, each widget's own ⋮ and an empty
  spot's "Add a widget" offer the shell's nine widgets, then the app's. An app widget is stored in the layout as `app:<key>`. If the app
  later drops it, its spot reads as Empty.
- **Refused out loud:** a key the shell already uses (the blocks `sections`
  and `plans`; the nine widget ids in `overview-widgets.ts`), a key used
  twice, or one that is not plain. The Admin dashboard fails to load with the reason,
  the way a clashing Settings tab does, rather than one quietly never
  showing.
- **With nothing set,** the dashboard is the shell's alone. The shell's own
  `src/app/options.ts` stays empty.

## Where it lives

- The entry's type and the key checks: `src/lib/admin-dashboard/admin-additions.ts`.
- The option and its readers, `appAdminBlocks` and `appAdminWidgets`:
  `src/lib/app-options.ts`.
- Blocks: `adminBlocks()` in `src/components/admin-dashboard/admin-blocks.tsx`,
  and the names the server cleans a page with, `adminPageBlockTypes()` in
  `src/lib/admin-dashboard/admin-page.ts`.
- Widgets: `widgetChoices()` in `src/lib/admin-dashboard/overview-widgets.ts`,
  drawn by `src/components/admin-dashboard/overview-tab.tsx`.
- Tests: `src/lib/admin-dashboard/admin-additions.test.ts`.
