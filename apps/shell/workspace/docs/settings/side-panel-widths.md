# Side panel widths

Settings → Styling → Side panels sets how wide the left and right panels open
on every three-panel dashboard (`ThreePanels` in
`src/components/shared/three-panels.tsx`): the CRM, the Admin dashboard and
any other. Tyler asked for it on 9 Nov 2026: "Add another option for me to
adjust the default width of the left and right panel".

- **Left panel width**, 10% unless changed, and **Right panel width**, 16%
  unless changed (Tyler, 9 Nov 2026: "default 14% on left and 16% on
  right", then "Set left side panel narrowest default to 10%"). Each default
  is also the narrowest: neither the slider nor a drag goes below it ("make
  the 14 and 16 default and cannot go lower than that"). Both go up to 36%.
  Both sides were 16% before that day, and the left 14% for part of it; a
  saved 14% left over from then was cleared on the local site so 10% shows.
- **At 10% the left panel is narrow:** a block's title and its rows' names
  end in "…" on one line rather than breaking mid-word (`FoldHeading`).
- **The middle takes the rest.** With both sides at 36% the middle has 28%,
  so the middle's own narrowest is 28% (it was 32%, which both sides at 36%
  would not leave).
- **A dashboard with no right panel**, such as Admin's Overview, uses only
  the left width, and the middle takes the right's room.
- **A dragged width still wins in that browser.** Each browser remembers
  where its dividers were left, under the dashboard's key in
  `src/lib/layout/panel-layout.ts`. A changed setting adds the two widths to
  that key (`crm-workspace-horizontal-4:14-16` at the defaults,
  `crm-workspace-horizontal-4:24-20` say), so every browser starts from the
  new widths. Widths dragged under the old 16% default, kept under the plain
  key, are left behind.
- **Reset panels** under the preview (Tyler, 9 Nov 2026: "Add a reset panel
  button here to reset all the panels to its default size", then "Not
  default 10 and 16 but to the default I set it as"). Each dashboard
  remembers its own dragged widths, so the CRM and Admin can differ. The
  button makes this browser forget all of them at once, on every
  three-panel dashboard of any app and in the editors, so each opens at the
  widths the sliders say again. The sliders stay where they are. Where a
  dashboard was and how its widget columns are split are kept
  (`forgetPanelWidths` in `src/lib/layout/panel-layout.ts`). A toast says
  the widths it went back to. It only clears the browser it is pressed in.
- **Stored** as `leftPanelWidth` and `rightPanelWidth` on the site's styling
  (`src/lib/layout/styling-values.ts`), for the whole site, not per person.
- **Below 1280px** one panel shows at a time, so the setting changes nothing
  there.
- **The preview** in the card is three boxes at the sliders' widths.
