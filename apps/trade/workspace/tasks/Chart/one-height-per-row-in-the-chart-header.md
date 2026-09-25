---
name: One height per row in the chart header
status: done
---

## In Plain English

**What it is:** The row above the chart mixes 24px controls with 32px ones, so
the buttons on one line are visibly different sizes. This settles on one height.

**Use case:** The timeframe buttons are `h-6`, 24px
(`src/components/trade/chart-panel.tsx:125`), and the Indicators button matches
them at 24px with a comment saying why: it belongs to the chart's control strip,
not to a form. That reasoning is sound. The two panel buttons that appear on a
narrow screen are the app's standard 32px icon buttons
(`src/components/trade/market-header.tsx:64-86`), so on a phone the row holds
both sizes at once.

Separately, `src/components/trade/indicators-menu.tsx:37-42` asks for
`size="sm"`, which is 28px, then overrides it back to 24px in a className. There
is already a size that means 24px, so the override fights a prop for no reason.

**Why it's a good idea:** The UI standard's whole point about heights is that
size props are the way a control is sized and call sites do not override them.
Here one row breaks the rule twice, and it shows most on the screen size where
there is least room.

## Tasks:

- **Bring the narrow-screen panel buttons to the same height as the rest of the
  row**, or make the case in the doc for why they stay 32px. Either answer is
  fine; two heights on one line without a reason is not.

- **Replace the height override in the Indicators button** with the size that
  already means 24px, so no className fights a prop.

- **Check the eye button beside it** and any other control that lands in the
  row, so the whole strip is one height.

- **Out of scope:** the 24px choice itself, which is deliberate and explained,
  and the separate task about the timeframe row being seven buttons rather than
  one choice.

- **Acceptance:** every control in the chart header row is the same height,
  measured rather than eyeballed; no call site overrides a size prop with a
  className; the row still fits at the narrowest panel drag and on a phone;
  nothing moved on wide screens.

- **Verification:** `./node_modules/.bin/tsc --noEmit -p tsconfig.app.json`,
  then `npx eslint` on the changed files, then `.agents/skills/validate-app`
  against the server on port 3014. Measure each control with
  `getBoundingClientRect()` at desktop and phone widths. Console clean. Never
  start a server.

## Rules

- Follow Ui Ux design at workspace/docs/charts/
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

The chart header now uses one 32px height for the interval group, Indicators,
View options, and the two phone-only panel buttons. The interval task changed
the old deliberate 24px choice to the shared tabs height, so the other controls
follow that shared height too. On a 390px screen, Indicators becomes an icon
with its active count and the row tightens its horizontal spacing. Every
control remains visible without the header or page overflowing.

The picker has no separate failure path. Choosing an interval still changes
the same remembered value and candle request as before.
