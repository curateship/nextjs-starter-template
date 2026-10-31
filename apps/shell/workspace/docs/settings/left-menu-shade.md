# The left menu shade

The left menu and the bar along the top share one background, and an admin
sets how light it is in Settings → Styling → Left menu shade. Tyler asked for
the card on 30 October 2026.

## What the slider means

The slider runs from 0% to 100%. At 0% the left menu is the same colour as the
page behind the cards. At 100% it is the same colour as a card. Every
workspace starts at 50%, which is where the left menu has always been.

The two ends are the page and a card, never a fixed grey, so the slider means
the same thing in light and dark mode and follows every step of
[the dark mode shade](dark-mode-shade.md). The old `chrome` setting mixed in a
fixed grey, which put the left menu darker than everything in dark mode and
made no visible change in light mode. [The app canvas](the-app-canvas.md)
explains that history.

The left menu and the top bar always move together. Both are painted with
`bg-sidebar`, and `--sidebar` is `--shell-rail` in both palettes.

## Where it lives

- `src/theme.css` builds `--shell-rail` as a mix of `--card` and
  `--shell-canvas`, taking `--shell-rail-card-share` of the card, with 50% when
  the variable is unset. Both the light and the dark block carry it.
- `src/lib/layout/styling-values.ts` holds the optional `sidebarShade` field on
  `ShellStyling`, `DEFAULT_SIDEBAR_SHADE`, and `getSidebarShadeVars`, which
  turns the number into that variable.
- `src/components/shell/shell-layout.tsx` has `useSidebarShadeVars`, which sets
  the variable on `<html>`, beside the dark shade's lift.
- `src/components/settings/styling-settings.tsx` draws the card: the slider and
  a small preview of a left menu, a top bar and a card.
- `src/lib/api/shell-settings.ts` accepts `sidebarShade` on save. It is
  optional, so a saved row and a scaffold from before it existed still load and
  read as 50%.

## What it does not do

The public, signed-out pages are not affected. They draw their own header and
have no left menu.

The setting is saved per workspace, with the rest of Styling, so every admin in
the workspace sees the same left menu.
