# The app canvas

A card is always lighter than the page it sits on, in light mode and in dark
mode. That is the rule, and the whole of this file exists to hold it.

Three tiers, darkest first: the page, then the sidebar rail and the sticky
bar, then the cards. `--shell-canvas` is the page and `--shell-rail` is the
rail, sitting halfway between the page and a card. Neither is adjustable in
Settings any more.

## The greys, measured

Sampled off a screenshot of the admin dashboard, on the 0 to 255 scale where 0
is black and 255 is white.

| | Page behind the cards | Sidebar and sticky bar | Cards |
| --- | --- | --- | --- |
| Light | 245 | 250 | 255 |
| Dark, Near black | 14 | 18 | 23 |
| Dark, Graphite | 36 | 41 | 46 |

Every row climbs in the same order and by about five steps at a time, so the
three surfaces stay as far apart in light mode as they are in dark. The rail is
derived from the other two with a `color-mix`, so it cannot drift out of the
middle when either end changes. The dark rows differ only by the shade
lift, so every step of [the dark mode shade](dark-mode-shade.md) keeps the same
arrangement.

## Why it needed fixing

The page used to be painted `bg-muted/60`, and the sidebar took its colour from
a Settings control saved as "muted at 27%". `--muted` is a fill colour for
badges and quiet buttons. It sits below `--card` in light mode and above it in
dark mode, so the same saved number means opposite things in the two modes.

What that produced in dark mode: a page at 51 against cards at 46, so the cards
read as holes punched into a lighter page, and a sidebar at 40, the darkest
strip on the screen. Tyler asked about the sidebar on 27 September 2026: "why
is the sidebar black when in light mode its light gray. I thought the contrast
would turn light gray into dark gray and white into black."

Turning the Settings controls off did not fix it, because the fallback was the
same `bg-muted/60`. The controls were never the cause; the choice of `--muted`
as a page colour was.

## Where it lives

- `src/theme.css` sets `--sidebar: var(--shell-rail)` in both palettes. Light
  mode used to carry its own `oklch(0.985)` there, which put the rail one step
  off the page, and Tyler said it "looks good in dark mode but terrible in
  light mode as the side and top bar color is too similair to the main content
  background". He then asked for the rail a touch off white rather than the
  same white as a card, so the page dropped to make room: light went from 249
  to 245 and dark from 0.183 to 0.162 plus the lift.
- `src/theme.css` declares `--shell-canvas` in both palettes, `oklch(0.982)`
  in light and `oklch(0.183)` plus the shade lift in dark, each a shade under
  that palette's `--card`. The same file has the `.shell-canvas` class, written
  as a plain class rather than a Tailwind utility so the colour survives
  whatever else lands on the same element.
- `src/components/shell/dashboard-content.tsx` and
  `src/components/shell/shell-layout.tsx` carry that class on the page and on
  the shell's outer wrapper.
- `src/components/settings/styling-settings.tsx` no longer draws a "Main
  content area" card or a "Sidebar & sticky bar" card.

## The two fields that stay

`content` and `chrome` are still on `ShellStyling` and still saved. The
signed-in app does not read either one. Two reasons they stay:

- Settings → Public site → Styling saves its own values through
  `publicShellStyling`, and the public pages still use them.
- A saved row must never lose a field. Dropping one means an older row and a
  newer row disagree about what is stored.

`src/lib/layout/styling-values.ts` carries the same note on each field.

## What this does not cover

The public, signed-out pages are untouched. They keep their own canvas and
chrome controls, and a public site can still be any colour its owner sets.

The change is in the shell, so Trade, CMS, Video and Pomodoro get it the next
time each takes a shell merge, not before.
