# The dark mode shade

Dark mode comes in four steps, from the old app's near black up to a soft
grey, and you pick one in Settings → Appearance. Tyler asked for it on
27 September 2026: the near-black canvas "is too dark and hurts the eye. I
want to make it more grayish."

## The four steps

Each step only moves the greys. The orange accent, the text colours and the
border alphas are the same in all four, so nothing loses contrast as the
canvas lifts.

| Name | Canvas |
| --- | --- |
| Near black | `#0b0b0e` |
| Charcoal | `#17171a` |
| Graphite | `#212125` |
| Soft grey | `#2b2b31` |

Graphite is the default, so a browser that has never chosen one gets the
grey canvas rather than the near black Tyler objected to. Near black is
still one click away and is the old app's exact colour.

On the two lighter steps the smaller text lifts with the canvas
(`--p-text-subtle`, `--p-text-faint`), because the same grey on a lighter
background would read as washed out.

## Where it lives

- `src/components/pomodoro/theme.css` holds the colours, one block per step,
  keyed off `data-dark-shade` on `<html>`. Near black has no block: it is the
  `.dark` block's own values. Each selector adds the attribute to the same
  shape as that block, so it wins on specificity whatever the import order.
- `src/lib/pomodoro/dark-shade.ts` remembers the choice and puts the
  attribute on `<html>`. It runs as the module loads rather than in an
  effect, so the canvas never flashes near black on the way to the chosen
  step.
- `src/components/pomodoro/appearance-settings-panel.tsx` is the Appearance
  card: one shadcn Select, a colour dot beside each name, and a line of help
  that says what the step looks like.
- `src/components/pomodoro/pomodoro-shell.tsx` calls `ensureDarkShade()`, so
  every member screen carries the choice, not just Settings.

## What it does not do

The choice saves in this browser under `pomodoro:dark-shade:v1`, the same
place the light/dark switch keeps `theme`, so it does not follow an account
to another device. Nothing outside the member screens changes: the admin
pages and the platform's own screens keep the standard shell dark mode,
because the whole stylesheet is gated on `data-pomodoro-screen`.
