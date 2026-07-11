# App Guide

How the app's shell (sidebar, sticky header, workspaces) actually works. Read this before adding any new page or dashboard — the #1 recurring mistake is adding a route and wondering why it never shows up in the navigation.

## Navigation: there is no global registry

- **Every workspace stores its own copy of the sidebar** in the `workspaces` table (`settings.sections` JSON). There is no shared registry that pages join.
- `createDefaultWorkspaceSections()` in `src/server/workspaces.ts` only **seeds brand-new workspaces**. Existing workspaces never pick up changes to it.
- So adding an item to the defaults is NOT enough — every workspace that already exists keeps its old saved sidebar until its JSON is updated (via the nav editor UI, or a one-time DB update).

## Sticky header top-left nav = active sidebar item + its children

- The chip group in the top-left of the sticky header (e.g. `[Trade] [PNL] [Indicators]`) is not its own menu. It is built by `getStickyHeaderNavLinks()` in `src/components/shell-layout.tsx` from the sidebar item that matches the current URL **plus that item's child links**.
- A standalone sidebar item with no children only ever shows its own single chip on its own page.
- To make a page part of a hub's chip group (the PNL pattern): save it as a **child link of the hub item** (e.g. a child of Trade), not as a standalone item. Then every page in the group shows the same chips.

## Checklist: adding a new page/dashboard

1. Add the route under `src/routes/_authenticated/` (route tree regenerates automatically while dev runs).
2. Add the item to `createDefaultWorkspaceSections()` so **new** workspaces get it. Pick an icon key that exists in `iconMeta` (`src/lib/custom-shell.tsx`).
3. Update the default-sections expectation in `src/server/custom-shell.test.ts` (it asserts the seeded entries).
4. **Update existing workspaces** — this is the step that keeps getting missed:
   - Dev: update each `workspaces.settings` JSON row directly (insert the item / child link).
   - Prod: same one-time insert on deploy, or add it manually via the sidebar nav editor.
5. If the page belongs with an existing hub (Trade, Backtest, …), add it as a **child of that hub's item** so the sticky-header chip group includes it. Standalone items are only right for pages that stand alone.

## Related shell facts

- `settings.topNavigation` is a separate, usually-empty list; when the current URL is in it, the sticky header shows all of its entries instead of the sidebar-derived group.
- Workspace sidebars are edited in the UI via the sidebar nav editor; the per-workspace JSON is the source of truth, and `parseWorkspaceSettings()` falls back to the defaults only for workspaces with missing/invalid settings.
