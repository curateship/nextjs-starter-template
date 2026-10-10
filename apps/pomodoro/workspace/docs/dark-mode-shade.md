# The dark mode shade

Dark mode comes in four steps, from the old app's near black up to a soft
grey, and you pick one in Settings → Appearance. Tyler asked for it on
27 September 2026: the near-black canvas "is too dark and hurts the eye. I
want to make it more grayish."

## Light, dark or the device's own

Settings → Appearance starts with a Theme choice: Light, Dark, or "System, the
same as this device". It calls the same theme setter as the Dark mode row in
[the account menu](account-menu.md), so changing either one moves the other at
once, and the choice is kept in this browser across reloads.

A guest is always dark (see "Light and dark" in
[the product shell](product-shell.md)), so a guest gets the line "Pomoder is
dark for visitors. Sign in to choose light mode." in place of the Theme
choice. A guest still picks the shade.

Both read the theme actually on screen, from the `dark` class on `<html>`
(`src/lib/pomodoro/use-applied-dark.ts`), not the stored word. On a light-mode
computer "System" draws light, and the Dark mode row is unticked for it. The
shade's help says the shade shows once the theme is dark.

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
  effect, but that is still after the page has first been drawn.
- **Before the attribute arrives, the page is graphite, the default.** The
  graphite block also matches `<html>` with no `data-dark-shade` at all. Until
  6 Oct 2026 the attribute-less page was near black, so every load showed near
  black for about half a second and then graphite, even for somebody who had
  never chosen a shade. Now only somebody who picked another step sees one
  change, from graphite to theirs, measured on `/`, `/timer` and `/login`.
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
