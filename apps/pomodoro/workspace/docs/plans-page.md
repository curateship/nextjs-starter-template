# The plans page

`/plans` is what the product's Pricing link opens: the old app's pricing
screen, drawn inside the product shell with the sidebar, the header and the
scene behind it, like every other member screen.

The shell also has a pricing page, at `/pricing`. Nothing in the product links
to it. The two are explained under "Why there are two" below.

## What is on it

- **A heading over the hero**, "Simple pricing" and "Focus alone for free. Go
  premium to focus together.", the old app's own words.
- **Monthly or Yearly**, one choice for the whole grid. Two cards priced on
  different periods would not be comparable, so the switch moves all of them.
  It is only drawn when some plan actually has a yearly price.
- **One card per plan**, three to a row on a desktop and one on a phone: the
  name, the price at 42px, a ticked feature list and a pill button.
- **The card with a badge is the featured one.** The badge is the plan's own
  Highlight badge in Settings → Plans. A card with one gets the accent outline,
  the glow beneath it and the solid orange button; the rest get an outline
  button.

## Where the numbers come from

**No price is written in this app.** The cards read the plan rows an admin
edits in Settings → Plans, their Stripe prices, and the same checkout call the
shell's own pricing page makes. The old app's $9 a month and $78 a year are
nowhere in the code; see [Pro perks](pro-perks.md) for what is still waiting
on Tyler.

The two lines of small print under a yearly price are worked out from the real
prices rather than typed:

- **What the year costs per month**, the yearly price divided by twelve. A
  plan at $190 a year shows `$15.83 / month, billed once`.
- **What the year saves**, twelve monthly payments minus the yearly price. That
  same plan at $19 a month shows `saves $38 a year`, because $19 × 12 = $228
  and $228 − $190 = $38.

## What each button does

- **The free plan is never bought.** A visitor goes to the sign-up, a member
  goes to the timer. It never reaches billing, which is how the old app's free
  card behaved.
- **A paid plan sends a visitor to the sign-up** carrying the plan and the
  period, so the choice survives the account being made.
- **A paid plan sends a member to the checkout**, or shows the change-of-plan
  confirmation when they already pay and are moving between plans.
- **The plan already owned says "Your plan"** and does nothing. Only on the
  period actually being paid: a monthly subscriber's yearly card is still
  buyable, and says "Switch to yearly".
- **A plan with no Stripe price for the period on show** names the period that
  does work, "Sold monthly only", rather than a dead end. With neither period
  on sale it says "Not on sale yet".
- **Payments switched off replaces the whole grid** with one line saying so. A
  grid of normal-looking cards whose buttons quietly do nothing reads as
  broken.

## Why there are two pricing pages

The shell's `/pricing` is a shell file, `src/routes/pricing.tsx`. An app that
edits or moves a shell file has forked it, and a forked shell file conflicts on
every future merge, so this app cannot put the product shell around that
address. It built its own screen at its own address instead.

`/pricing` still answers and still works. It is not linked from the product,
and an admin who wants it gone can switch it off in Settings → Pages.

The same wall stands in front of `/login`, `/register`, `/search` and the
missing-page screen: all five are the shell's route files and all five draw the
shell's public frame rather than the product shell. What they do share is the
colour — `src/app/options.ts` sets the app's public brand colour to the
Pomoder orange — so the Register button on the sign-in page is the same orange
as the one in the product header.

Closing that seam properly needs a new option in the shell, letting an app wrap
the shell's signed-out pages in its own frame. That is a change to
`apps/custom-shell` and has not been made.

## Where it lives

- `src/routes/_pomodoro/plans.tsx` — the route and its loader.
- `src/components/pomodoro/pricing-page.tsx` — the screen.
- The look is the old app's `.reference-price-card`, in
  `apps/pomoder/src/styles.css`, carried over by value.
