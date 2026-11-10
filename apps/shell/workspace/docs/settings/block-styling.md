# Block, widget and panel card styling

Admin → Styling → Blocks sets how every page block looks, on every page:
the CRM's left page, Project's pages, Trade's dashboard blocks, anywhere a
page holds "/" blocks drawn as `BlockCard`
(`src/components/shared/notes/block-card.tsx`). Tyler asked for it on
7 Nov 2026: "I want to add blocks styling to styling settings. I want to
adjust to rounded corner, the gray shade bg and this padding."

- **Rounded corners**, 0 to 32px, 16px unless changed. The white tile inside
  is rounded by the same amount less the edge, so the edge stays even all
  round.
- **Grey shade**, 0 to 100%, 50% unless changed: how much of the theme's light
  grey is mixed into the block behind its white tile. 0% is white. It works
  the same in light and dark mode.
- **See-through:** the grey box is drawn at 60% (75% until Tyler's "a bit
  more see through" the same day), so a page's cover shows
  faintly through it, as through the CRM email box's header (Tyler, 8 Nov
  2026: "I like how the email box header as a bit of transparent, can you do
  that to the dashboard block", then "thats too transparent" of a box that
  was the grey alone at the shade set). What shows through is blurred 12px,
  like frosted glass ("how about we make it gassuan blur like a glass
  effect"); over the drawn sky, a smooth gradient, the blur barely shows, and
  over a picture it does. The white tile stays solid. On a plain panel the
  grey reads a shade lighter than the setting alone gives.
- **Edge around the tile**, 0 to 16px, 3px unless changed: how much grey shows
  between the block's edge and its white tile, at the sides and the bottom.
- **Body shade**, 0 to 100%, 0% unless changed: how much of the theme's light
  grey is mixed into the tile under the heading, where the block's rows sit.
  0% is the white tile blocks always had. A table's heading and totals rows
  inside the tile follow it, so they never show as white bands. Tyler asked
  for it on 9 Nov 2026: "add a block styling option to change the shade of
  the block body bg".
- **Border**, 0 to 3px, 0 unless changed: a line round the whole block.
- **Border shade**, 0 to 100%, 10% unless changed: how dark that line is, as
  a share of the theme's text colour. It has its own slider because the
  Divider lines colour is too faint to see as a block's edge. It is greyed out
  while Border is 0px.
- **Shadow**, 0 to 100%, 0% unless changed: a soft shade under the block so
  it lifts off the page. At 100% the shade is black at 20%, about a lifted
  card's. Tyler asked for both on 9 Nov 2026: "Add another styling option to
  add a border and shade around the block".
- **Edge to edge**, a switch, off unless changed: advanced blocks, the live
  ones an app draws such as Dashboards, Plans and the CRM's Stages, reach the
  panel's sides instead of sitting inside its 15px of space. Basic blocks
  (Image, Callout, Checklist and the rest) keep the space. Tyler asked for it
  on 9 Nov 2026: "Add another option for blocks that its edge to edge but for
  advanced blocks only". The panel's body says how much space it has as
  `--panel-gutter` (`PANEL_GUTTER` in `src/lib/layout/panel-gutter.ts`), and
  the block's frame takes that much off each side when `--shell-block-bleed`
  is 1. A page outside such a panel has no `--panel-gutter`, so its blocks
  stay put. Rounded corners, Border and Shadow still apply; set the corners to
  0px for a block that meets the panel's sides square.

The values are saved on the site's styling (`blockRadius`, `blockShade`,
`blockInset`, `blockBodyShade`, `blockBorder`, `blockBorderShade`,
`blockShadow`, `blockEdgeToEdge` in
`src/lib/layout/styling-values.ts`), and `ShellLayout` puts them on the page
root as `--shell-block-radius`, `--shell-block-shade`, `--shell-block-inset`,
`--shell-block-body-shade`, `--shell-block-border`,
`--shell-block-border-shade`, `--shell-block-shadow` and
`--shell-block-bleed`. A site that never set them shows the look blocks had
before, because the block card falls back to those numbers. The card in
Settings has a preview drawn from the sliders' own numbers, so it moves with
the thumb; every real block changes live too.

## Widgets

Admin → Styling → Widgets is the same three settings for the widgets on
the Admin dashboard's Overview and the CRM's (`WidgetCard` in
`src/components/shared/widgets/widget-card.tsx`). Tyler split them off on
8 Nov 2026: "Because the widget sits in a shaded background it needs its own
block styling options". Overview has no middle panel, so its widgets sit on
the page's shade, where a block's grey reads differently than inside a white
panel.

- **The settings:** all seven of the blocks', with the blocks' ranges:
  Rounded corners, Grey shade, Edge around the tile, Body shade, Border,
  Border shade and Shadow. Tyler added the last four on 9 Nov 2026: "add the
  same 2 styling feature for widgets".
- **Unset, they follow the blocks' settings**, so the widgets look as they did
  before the card existed until one of its sliders is moved.
- **Stored** as `widgetRadius`, `widgetShade`, `widgetInset`,
  `widgetBodyShade`, `widgetBorder`, `widgetBorderShade` and `widgetShadow`,
  and put on the page root as `--shell-widget-radius`, `--shell-widget-shade`,
  `--shell-widget-inset`, `--shell-widget-body-shade`, `--shell-widget-border`,
  `--shell-widget-border-shade` and `--shell-widget-shadow`.
- **The preview** sits on the page's own shade, as the widgets do.

## Panel cards

Admin → Styling → Panel cards sets the background and the line of the grey
folding cards in a right panel, such as a person's Profile and Plan on the
Admin dashboard (`PanelCard` and `PanelBox` in
`src/components/shared/panel-card.tsx`). Tyler asked for it on 8 Nov 2026:
"Add styling options for this card ui ... I want to change border and bg".

- **Background:** Theme default (the theme's light grey at 40%, the look the
  cards always had), a strength of the theme's grey, or a colour of its own.
- **Border:** 0 to 3px, 1px unless changed; 0 removes it.
- **Border color:** Theme default (the Divider lines colour every plain line
  uses), a strength of the theme's text grey, or a colour of its own.
- **Stored** as `panelCardBackground`, `panelCardBorderWidth` and
  `panelCardBorderColor`, and put on the page root as
  `--shell-panel-card-bg`, `--shell-panel-card-border-width` and
  `--shell-panel-card-border-color`. A colour left to the theme sets no
  variable, so the rule's own fallback shows.
- **The rule** is `[data-slot="panel-card"]` in theme.css, in the components
  layer, so a class a screen puts on one card still wins.
- **The preview** is a real panel card, so it reads the values the way every
  card does.
