# The gutter shade

The page behind the cards, in the middle of every dashboard, has its own
shade, and an admin sets it in Admin → Styling → Gutter shade. Tyler asked
for it on 7 November 2026, after finding the left menu could change shade but
the middle could not.

## What the slider means

The slider runs from 0% to 100%. At 0% the page is the same colour as a card,
so the cards blend into it. At 100% it is the deepest grey the theme allows.
Every workspace starts at 50%, which is the page it has always had: 245 out of
255 in light mode.

| | 0% | 50% (start) | 100% |
| --- | --- | --- | --- |
| Light | 255, same as a card | 245 | 235 |
| Dark, Near black | 23, same as a card | 14 | about 6 |

The deep end sits as far below the starting page as a card sits above it, in
both palettes. It carries the dark mode lift like every other grey, so the
slider means the same thing at every step of
[the dark mode shade](dark-mode-shade.md).

The left menu and the top bar move with the page. Their colour is a mix of the
page and a card, so [the left menu shade](left-menu-shade.md) keeps them the
same distance between the two wherever the page is set.

## Where it lives

- `src/theme.css` declares `--shell-canvas-deep` in both palettes and builds
  `--shell-canvas` as a mix of it and `--card`, taking `--shell-page-depth` of
  the deep grey, with 50% when the variable is unset.
- `src/lib/layout/styling-values.ts` holds the optional `pageShade` field on
  `ShellStyling`, `DEFAULT_PAGE_SHADE`, and `getPageShadeVars`, which turns the
  number into that variable.
- `src/components/shell/shell-layout.tsx` has `usePageShadeVars`, which sets
  the variable on `<html>`, beside the left menu's.
- `src/components/settings/styling-settings.tsx` draws the card: the slider and
  a preview of a card on the page. The left menu preview below it uses the same
  page colour.
- `src/lib/api/shell-settings.ts` accepts `pageShade` on save. It is optional,
  so a saved row and a scaffold from before it existed still load and read as
  50%.

## What it does not do

The public, signed-out pages are not affected. They keep their own canvas
setting under Settings → Public site.

The setting is saved per workspace, with the rest of Styling. It is a shell
change, so each app gets it at its next shell merge.
