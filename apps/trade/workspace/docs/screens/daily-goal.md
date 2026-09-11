# The daily goal

How much this account is trying to make in a day, and the button in the top
right of every page that says how today is going against it.

Tyler, 11 September 2026: "I want to make .1 percent per day of my total
wallets." So the target is written as a percent of what the wallets are worth
rather than as a number typed again every time the account grows.

## Setting it

Settings → Goals. One switch, one choice, one number.

- **A percent of all my wallets.** 0.1 means a tenth of one percent. Wallets
  worth $25,000 make today's target $25.
- **A fixed amount of money.** The same target every day, whatever the wallets
  are worth.

Under the number is what the goal means in dollars today, so nobody works a
percent of their own wallets out in their head. The goal is saved per person,
in that person's own trading preferences, and it changes nothing for anybody
else in the workspace.

**The goal never stops an order.** It is a figure to look at, in the same
family as the trading overview's Made or lost. The engine does not read it.

## The button

The header reads `$5/$25`: money made today over today's target, both in whole
dollars, at every screen width. The target icon beside it and the button's
spoken name say what the two figures are, so the word Goal is not worth the
room it took.

- **It is green once the target is met** and red on a day that lost money,
  from the one green in `reading-the-figures.md`. Any other day is plain.
- **A figure that never arrived is a dash**, never the last number drawn as if
  it were live. A read that fails blanks both figures to dashes rather than
  leaving the last ones on screen, and the panel says so with a Try again.
- **Nothing is drawn at all while the goal is switched off**, so somebody who
  never sets one sees the header they see today. Nothing is drawn before the
  first answer either, so the button never appears and then vanishes.
- Its place in the row is set in Settings → Top right menu, where it can be
  dragged or hidden like any other button.

Clicking it opens a panel holding today's target and where it came from, money
made today, what is still to go, what the open positions are up or down, and
any exchange that did not answer. What the open positions are up or down wears
the same green and red as every other figure of money. One link from there
opens P&L.

## What counts as money made

**Money banked today.** It is the same fills, priced the same way, that the
P&L page's month grid buckets and the PnL Graph adds up, so today's cell on
that grid and this figure are one number.

A day runs midnight to midnight in Toronto, the clock the whole app already
keeps.

**What the open positions are up or down is reported beside it, never inside
it.** A position opened last week would otherwise count its whole life as
today's work, and a good day would appear the moment an old trade moved.

**A wallet that did not answer is left out and its exchange is named** in the
panel. A total missing one account is not a smaller total, it is a wrong one.
Only live mainnet wallets count; a practice wallet is pretend money.

A fill the exchange has not priced yet is counted as unpriced and named in the
panel, never as zero, which is the overview's own rule.

## What the exchanges are asked, and how often

The button asks every 15 seconds while the tab is being looked at, and asks
nothing at all while it is not.

- **Money made today is a plain database read** of today's fills alone, and it
  is live at every ask.
- **What the wallets are worth is held for a minute** and reused. Every live
  wallet costs three requests to its exchange on every sweep, the exchange
  counts them all together, and being rationed is what makes a wallet answer
  with nothing. A target a minute stale is a target nobody can see move.
- Saving the goal drops the held sweep, so a goal just switched on gets its
  target at once rather than a minute later.

## Where it lives

The goal is one `goal` column on `trade_prefs`, added by migration 0176, read
through `readGoal` so an unreadable value reads as the goal switched off. A row
written by an older build is read field by field: one impossible number falls
back to its default and the rest of the goal stands.

The button is app-owned and reaches the header through the shell's
`header.rightActions` option, which is documented once for every app in the
repo's `docs/shell/shell-and-apps.md`.
