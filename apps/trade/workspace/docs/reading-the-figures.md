# Reading the figures

Every number on the Trade screens is printed by one set of rules and painted by
one pair of colours. This file is those rules. When a panel disagrees with this
file, the panel is what is wrong.

## One green for money made

`src/lib/trade/money-tone.ts` is the only place a figure of money is given a
colour, and every panel asks it.

- **Made money** is `text-emerald-600 dark:text-emerald-400`. It is the same
  green a rising candle is drawn in: `chart-theme.ts` reads that exact pair off
  the page and hands the result to the chart library, so a row that made money
  and a candle that went up are one colour rather than two that nearly match.
- **Lost money** is `text-destructive`. That is the theme's own token, and the
  theme already gives it a different value on a dark screen, so a call site
  cannot get the dark half wrong by forgetting it.
- **Broke even is left alone.** Zero keeps whatever colour the text around it
  has. Zero is a real answer, and greying it out is how this app says "the
  exchange never told us", which it prints as a dash. A real $0.00 and an
  unknown figure must never look the same.

Three panels used to keep their own pairing. One was teal, one was emerald, and
the Positions tooltip had no dark-mode colour at all, so it stayed pale green on
a dark screen every night.

**Pills and badges are not money figures.** The market list's day's-move pill
and the "Long" badge wear green because of what they are, not because of what
they made, so they keep their own colours and do not call this helper.

**A stand-in figure is still never coloured** — see "Stand-in figures" in
`ui-ux.md`. Colour is what makes a made-up number look real.

## One spelling for every number

`src/lib/trade/format.ts` is the only place a number becomes a string. Nothing
else formats one.

- **A price** — `formatPrice`, five significant digits with a dollar sign:
  `$67,413`, `$142.38`, `$0.023411`. The market picker used to keep its own at
  six digits and no dollar sign, so the same coin read two ways in two panels
  that sit beside each other.
- **Money someone owns** — `formatUsd`, to the cent: `$9,999.78`.
- **A gain or a loss** — `formatSignedUsd`. The sign is always shown and the
  minus goes outside the dollar sign: `-$12.34`, never `$-12.34`.
- **A big figure** — `formatCompactUsd`, lower case: `$1.24b`, `$88.6m`,
  `$532k`. The picker used to print `$1.24B` beside the list's `$1.24b`.
- **How much of the coin** — `formatSize`, six decimals at most and grouped:
  `0.3`, `0.0125`, `1,500`. A row rarely carries a size somebody typed; it
  carries dollars divided by a price. $1,000 of a $68,069 bitcoin is
  0.0146910489320014 in full, where the exchange accepts five decimals and will
  fill 0.01469. Everything past the sixth is what dividing left behind.

**Leverage is written with `×`**, the multiplication sign, everywhere: `10×`,
`40×`. The tables already did; the market header and the picker wrote a letter
`x`.

## One spelling for how long

`formatDuration` in `src/lib/format/format-time.ts` writes every elapsed time.
The Journal, chart ruler, flow runs and backtests all use the same answer:
`20s`, `9m`, `3h 12m`, or `3d 4h`. The smaller part stays when it changes the
answer. A decimal such as `3.2h` makes the reader turn the fraction back into
minutes, and rounding the same stretch to `3h` loses twelve minutes.

A backtest span of zero still says `under one candle`. Zero has a specific
meaning there, and the shared formatter lets that screen name the meaning
without keeping a second set of duration rules.

## One text scale

Trade uses the app's type scale and nothing else. The smallest step it offers
is `text-xs`, which is 12px, and that is the floor for anything a person reads.

Twenty-nine places used to type a size in by hand — `text-[10px]` nineteen
times and `text-[11px]` ten — which is why the bottom panel and the right
panel never quite agreed about how small "small" was, and why no setting could
ever move them.

**Two exceptions, both marks rather than words:**

- The letter inside a market's fallback circle (`market-icon.tsx`). One letter
  has to sit inside a 16px circle standing in for a coin's logo, and 12px fills
  it edge to edge.
- The count tucked into the corner of the Indicators button on a phone
  (`indicators-menu.tsx`). At 12px it lands on top of the icon it is marking.

Both are commented where they sit. Nothing else in `src/components/trade` types
a size in by hand.

**The chart's own labels are not on this scale** and are not meant to be. They
are drawn into the canvas or positioned as SVG by chart geometry
(`trade-lines-layer.tsx`, the overview's chart axes), so their size is a
drawing decision rather than a typographic one.

## One small badge

`src/components/trade/trade-badge.tsx` draws every short word beside a market:
Long, Short, Real, Testnet, Practice, Reduce only, and how a trade ended. The
shape is fixed in that one file and a call site picks a tone and nothing else.

The tones and what each one means:

- `made` and `lost` — this went the way you wanted, or the other way.
- `real` — real money is involved. Amber, everywhere, so it is never missed.
- `testnet` — the practice network, pretend money on a real exchange.
- `neutral` — says what a row is without judging it.
- `alarm` — something happened TO the account. A liquidation, and nothing else.

**How a trade ended is coloured by the money, not by the word.** A stop that
followed the price up can close well above what the trade paid, so painting
every "Stopped out" red would call a good trade a failure. Only the exchange
taking the trade away is `alarm` whatever it made.
