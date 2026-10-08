# The plans page

`/plans` is what the product's Pricing link opens: the old app's pricing
screen, drawn inside the product shell with the sidebar, the header and the
scene behind it, like every other member screen.

The shell also has a pricing page, at `/pricing`. Nothing in the product links
to it. The two are explained under "Why there are two" below.

## What is on it

Drawn to Tyler's design of 7 Oct 2026
(`assets/pasted-image-1791403503197534000.png`).

- **A headline over the hero:** "Focus longer, together." and "The timer,
  tasks and rooms are free. Pro unlocks every sound and scene, AI mixes,
  hosting and your full history." Both lines sit on the left edge, in line
  with the cards, at the same size as every other page's title (36px, with
  the line under it at the body size). The "Paid plans can't be bought just
  yet" notice sits on the left too. Tyler, 8 Oct 2026: "for the pricing page,
  align the header and subheader left", then "the header font is a bit bigger
  than the other pages header. match it".
- **Three cards, side by side on a wide screen and stacked on a phone:** Free,
  Pro monthly and Pro yearly. Each has a small capitals label, a large price,
  a line under it, a full-width button, then the plan's feature list under
  "Everything you need to start" (Free) or "Everything in Free, plus" (Pro).
- **Pro yearly is the featured card:** an orange outline, a soft glow, a "Best
  value" pill when the year saves anything, and the solid orange button. Pro
  monthly has a black button and Free an outlined one.
- **Free and Pro only.** Tyler chose this on 7 Oct 2026 over drawing every
  paid plan. Pro is the paid plan with a Highlight badge in Settings → Plans,
  or the cheapest paid plan when none has one. Team, Scale or any other paid
  plan stays in Settings and on the shell's `/pricing`, but is not drawn here.
- **A period Pro has no price for gets no card**, so a plan sold monthly only
  shows two cards. There is no Monthly / Yearly switch any more: the two
  periods are two cards.

## Where the numbers come from

**No price is written in this app.** The cards read the plan rows an admin
edits in Settings → Plans, their Stripe prices, and the same checkout call the
shell's own pricing page makes. See [Pro perks](pro-perks.md) for what is
still waiting on Tyler.

The yearly card's figures are worked out from the real prices:

- **The big price is the year per month**, the yearly price divided by twelve.
  A plan at $190 a year shows $15.83 / month.
- **The line under it is the yearly sum and the saving**, as the design draws
  it: "$190 billed yearly · save 17%". The saving is against twelve monthly
  payments: $19 × 12 = $228, and $190 is $38 less, which is 17 out of every
  $100 of $228.

**The feature lists are written from what the app does**
(`src/lib/pomodoro/plan-card-features.ts`). Tyler asked for them on 7 Oct 2026.

- **Free** lists what every account gets: the timer with tasks, steps and
  projects, the 4 free sounds and 4 free backgrounds, a personal room, joining
  open rooms, the leaderboard, private groups and a public profile, and 7 and
  30 days of history with CSV export.
- **Pro** lists only the perks its plan really unlocks, through the same rule
  the server uses (`planPerkAllowed` in `src/lib/pomodoro/pro.ts`): an
  explicit value on the plan wins, and a missing one means a paid plan has it.
  The numbers are the plan's own, or the defaults of 20 AI soundscapes and 5
  AI backgrounds a month and 2 GB of uploads. A plan that switches hosting off
  in Settings → Plans loses the hosting line on its card the same moment it
  loses hosting.
- **Anything else on the plan's feature record** ("Priority support") follows
  the app's own lines, worded the shell's way.
- **The sound and background counts come from the catalogues**, so adding a
  scene changes the card without anyone editing it.

## What each button does

- **The free plan is never bought.** A visitor goes to the sign-up, a member
  goes to the timer. It never reaches billing, which is how the old app's free
  card behaved.
- **A paid plan sends a visitor to the sign-up** carrying the plan and the
  period, so the choice survives the account being made.
- **A paid plan sends a member to the checkout**, or shows the change-of-plan
  confirmation when they already pay and are moving between plans.
- **A paid card says "Get Pro"**, or the plan's own checkout button text from
  Settings → Plans when it has one.
- **The plan already owned says "Current plan"** and does nothing. Only on the
  period actually being paid: a monthly subscriber's yearly card is still
  buyable, and says "Switch to yearly".
- **A card whose period has no Stripe price** says "Not on sale yet".
- **Payments switched off keeps the plans on show.** Tyler, 7 Oct 2026: "the
  pricing ui should be visible even if payment is turned off". A line over the
  grid says "Paid plans can't be bought just yet. Everything on the free plan
  works today." The free card works as usual, and every paid card's button
  reads "Coming soon" and is shut, so nothing looks like it works and then
  quietly fails. Until then the grid was swapped for the shell's "Payments are
  off" card. The shell's own `/pricing` and the account's billing page still
  show that card, because both are shell files.

## Why there are two pricing pages

The shell's `/pricing` is a shell file, `src/routes/pricing.tsx`. An app that
edits or moves a shell file has forked it, and a forked shell file conflicts on
every future merge, so this app cannot put the product shell around that
address. It built its own screen at its own address instead.

`/pricing` still answers and still works. It is not linked from the product,
and an admin who wants it gone can switch it off in Settings → Pages.

The same wall stands in front of `/search` and the missing-page screen: both
are the shell's route files and both draw the shell's public frame rather than
the product shell. What they do share is the colour, because
`src/app/options.ts` sets the app's public brand colour to the Pomoder orange.

The sign-in pages were behind the same wall until 6 Oct 2026. The shell now
offers `signIn.frame`, which lets an app draw its own frame around the shell's
sign-in card, and this app uses it. See "The sign-in pages" in
[The product shell](product-shell.md).

## Where it lives

- `src/routes/_pomodoro/plans.tsx` — the route and its loader.
- `src/components/pomodoro/pricing-page.tsx` — the screen.
- The look is the old app's `.reference-price-card`, in
  `apps/pomoder/src/styles.css`, carried over by value.
