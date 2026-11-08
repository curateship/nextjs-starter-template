# Block styling

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
