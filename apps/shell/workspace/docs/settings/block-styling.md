# Block, widget and panel card styling

Settings → Styling → Blocks sets how every page block looks, on every page:
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
- **Edge around the tile**, 0 to 16px, 3px unless changed: how much grey shows
  between the block's edge and its white tile, at the sides and the bottom.

The values are saved on the site's styling (`blockRadius`, `blockShade`,
`blockInset` in `src/lib/layout/styling-values.ts`), and `ShellLayout` puts
them on the page root as `--shell-block-radius`, `--shell-block-shade` and
`--shell-block-inset`. A site that never set them shows the look blocks had
before, because the block card falls back to those numbers. The card in
Settings has a preview drawn from the sliders' own numbers, so it moves with
the thumb; every real block changes live too.

## Widgets

Settings → Styling → Widgets is the same three settings for the widgets on
the Admin dashboard's Overview (`WidgetCard` in
`src/components/admin-dashboard/widget-card.tsx`). Tyler split them off on
8 Nov 2026: "Because the widget sits in a shaded background it needs its own
block styling options". Overview has no middle panel, so its widgets sit on
the page's shade, where a block's grey reads differently than inside a white
panel.

- **The settings:** Rounded corners, Grey shade and Edge around the tile, with
  the blocks' ranges.
- **Unset, they follow the blocks' settings**, so the widgets look as they did
  before the card existed until one of its sliders is moved.
- **Stored** as `widgetRadius`, `widgetShade` and `widgetInset`, and put on
  the page root as `--shell-widget-radius`, `--shell-widget-shade` and
  `--shell-widget-inset`.
- **The preview** sits on the page's own shade, as the widgets do.

## Panel cards

Settings → Styling → Panel cards sets the background and the line of the grey
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
