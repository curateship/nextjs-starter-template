---
name: The interval picker is one choice
status: done
---

## In Plain English

**What it is:** The row of candle sizes above the chart — 1m, 5m, 15m and the
rest — is built as seven separate on/off buttons rather than one set you pick
from. This makes it one set.

**Use case:** `src/components/trade/chart-panel.tsx:117-136` puts seven toggle
buttons in a plain row with nothing tying them together. Two things follow from
that. A screen reader hears seven unrelated buttons named "1m", "5m" and so on,
each announced as pressed or not pressed, with nothing saying only one can be
chosen. And the chosen one is shown by heavier text and a colour change only —
no background, no underline — which is the faintest "this one is selected" mark
on a screen where every other tab row uses the shared raised or underlined
treatment.

**Why it's a good idea:** The candle size decides what every line on the chart
means, so which one is picked should be the easiest thing on the row to see. The
app already has the component for this, used by the market list, the wallet
panel and the bottom panel — the chart is the odd one out.

## Tasks:

- **Rebuild the row on the shared tabs.** Use `src/components/ui/tabs.tsx`, or
  the underline version if it should match the panel tab rows sitting right
  beside it. That brings the group label, arrow-key movement between intervals,
  and the selected treatment with it, so none of those need writing.

- **Drop the hand-written height.** The buttons are `h-6` today, off the shared
  control heights. Take whatever the shared component gives rather than
  overriding it at the call site.

- **Name the group.** Whatever the row ends up as, it needs to say what the
  choice is about, so it is not read out as seven loose buttons.

- **Do not rely on colour alone.** The chosen interval must still be obvious in
  black and white and to anyone who cannot tell the two shades apart.

- **Out of scope:** which intervals are offered, what each one loads, and the
  chart's remembered zoom and skew — picking an interval must go on behaving
  exactly as it does now.

- **Acceptance:** the row reads as one choice rather than seven buttons; the
  arrow keys move between intervals and there is a visible focus mark; the
  chosen interval is clear without colour; the row's height matches the shared
  control heights; switching intervals still redraws the chart with the view
  kept.

- **Verification:** `npm run test`, then
  `./node_modules/.bin/tsc --noEmit -p tsconfig.app.json` (the plain `typecheck`
  script checks nothing), then `npx eslint` on the changed files, then
  `.agents/skills/validate-app` against the server already running on port 3014
  — switch through every interval by mouse and by keyboard, in light and dark,
  and check the chart's zoom and skew survive each switch. Console clean.
  Never start a server.

## Rules

- Follow Ui Ux design at workspace/docs/ui-ux.md
- Use .agents/skills/audit-change to follow coding standards
- Don't make assumptions. If not clear, use @.agents/skills/interview-me
- For big changes use skill @.agents/skills/validate-live

## The Review Checklist

[x] Brief in plain english
[x] Edge cases handled
[x] Error paths handled
[x] Update documents (if applicable)
[x] Add brief and what you changed below.

## Brief

The six candle intervals are now one named segmented choice. The selected tab
has a raised background and shadow, so colour is no longer the only mark. Tab
moves focus into the choice and the arrow keys move between intervals. Mouse
selection still changes every interval, and switching intervals leaves the
loaded chart frame and remembered view alone.

An automated test covers the group name, the interval order, the selected
state, and Right Arrow movement. The picker has no separate failure path. It
still hands the chosen interval to the existing chart state.
