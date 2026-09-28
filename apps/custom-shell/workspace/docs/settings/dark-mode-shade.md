# The dark mode shade

Dark mode comes in four steps, from the shell's original near black up to a
soft grey, and an admin picks one in Settings → Styling → Dark mode. Tyler
asked for it on 27 September 2026, pointing at the same control in Pomodoro,
where the near-black canvas "is too dark and hurts the eye".

## The four steps

Each step lifts every grey surface by the same amount. The text, the accent,
the destructive red, the chart colours and both border alphas do not move, so
nothing loses contrast as the canvas rises.

| Name | Lift | Canvas |
| --- | --- | --- |
| Near black | 0 | the shell's own `oklch(0.145 0 0)` |
| Charcoal | 0.055 | about `#17171a` |
| Graphite | 0.098 | about `#212125` |
| Soft grey | 0.141 | about `#2b2b31` |

The lift numbers are the gaps between Pomodoro's four canvas colours, read in
oklch, so the two apps land on the same greys.

Near black is the default. Every workspace already looks like that, so a
saved row from before this existed keeps the screen it had, and nothing
changes until somebody picks a step.

`--muted-foreground` is the one colour outside the greys that moves. It rises
at about a third of the lift, because the same grey small print on a lighter
canvas would read as washed out.

## Where it lives

- `src/theme.css` writes every grey in the `.dark` block as its own lightness
  plus `--shell-dark-lift`, which the block itself declares as 0. One number
  moves the whole palette.
- `src/lib/layout/styling-values.ts` holds `DARK_SHADES`, the `darkShade`
  field on `ShellStyling`, and `getDarkShadeVars`, which turns the chosen step
  into that one variable.
- `src/components/shell/shell-layout.tsx` has `useDarkShadeVars`, which sets
  the variable as an inline style on `<html>`. Both the inline style and the
  `.dark` rule sit on the same element, and an inline style wins there, so the
  chosen lift beats the block's 0. Setting it on the root also reaches the
  popovers, dropdowns, selects, sheets and toasts, which portal to
  `document.body` outside the shell.
- `src/components/settings/styling-settings.tsx` draws the Dark mode card: one
  select, a colour dot beside each name, and a line saying what the step looks
  like.
- `src/lib/api/shell-settings.ts` accepts `darkShade` on save. It is defaulted
  in the schema, so a Styling tab left open from before this existed still
  saves and saves the near black it was showing.

## What it does not do

Light mode is untouched: the light palette has no lift in it, and the variable
is never read there.

The public, signed-out pages keep the near-black dark mode whatever the
signed-in app is set to. Settings → Public site → Styling has no shade control
of its own, and `publicShellStyling` in `src/lib/public-theme.ts` hands the
public frame `DEFAULT_DARK_SHADE` on purpose.

The choice is saved per workspace, in the same settings row as the rest of
Platform Styling, not per browser. Pomodoro's version of this is per browser;
this one follows the workspace, so every admin in it sees the same screen.
