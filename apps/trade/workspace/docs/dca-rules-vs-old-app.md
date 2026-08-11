# The DCA rules, old app beside this one

Every line below is copied from the two codebases, with the file and line so
you can open both and check. Nothing here is my opinion about what it does.

Old app = `apps/trading`. This app = `apps/trade`.

## Where a rung buys

**Identical — character for character.**

Old app, `src/lib/automations/dca.ts:48`:

```ts
export function dcaLevels(base: number, rungs: AutomationDcaRung[]): number[] {
  const levels: number[] = []
  let price = base
  for (const rung of rungs) {
    price = price * (1 - rung.deviation / 100)
    levels.push(price)
  }
  return levels
}
```

This app, `src/lib/trade/dca.ts:261`: the same function, same body.

So: rung 1 at 5% under the base, rung 2 a further 8% under rung 1, and so on —
the drops compound, they are not all measured from the base.

## How big each buy is

**Identical.** Old app `dca.ts:64`, this app `dca.ts:278` — same function, same
body: rung *i* gets `sizeMultiplier ** i` of the weight, and the shares always
add up to the maximum position.

## Where a rung sells

**Identical.** Old app, `src/lib/automations/automation.ts:90`:

> "previousRungSellAll" peels the ladder: as price recovers, each averaged-in
> buy is sold at the price of the buy above it (the second sells where the
> first bought, the first at the base).

This app, `src/lib/trade/dca.ts:549`:

```ts
export function ladderExitLevels(plan) {
  return plan.rungs.map((_rung, index) =>
    index === 0 ? plan.anchorPx : plan.rungs[index - 1].px
  )
}
```

`anchorPx` is the base. So rung 1 sells at the base, rung 2 sells where rung 1
bought. Same rule.

Both apps offer the same three choices: at the average price, at the previous
rung, everything at the nearest rung. Neither one is forced.

## The stop

**This is the one real difference, and it is an addition, not a change.**

Old app, `src/lib/automations/automation.ts:135` — the stop sits *on* the base:

> "confirmedBase": at the price of the confirmed base drawn by the Base node
> wired into this stop — the level the trade is betting holds. If price loses
> the base, the reason for the trade is gone.

This app adds a percent under it — `underPct`, `src/lib/trade/dca.ts`. Set to 1,
the stop sits 1% below the base rather than on it.

**Kept on purpose.** It means exactly what it says, and a wick 1% through the
base takes the trade out. Removing it would be a different rule, not the old
one.

## Coming back after a stop

**Same rule, different name.** Old app calls it `baseReclaimDays`
(`automation.ts:141`), this app calls it `reclaimDays`. Both mean: days price
must spend back above the base it was cut at before the trade is re-entered,
measured on closes — a wick back over does not count.

## Things the old app has that this one does not

Not bugs, just not built yet. None of them are part of the DCA rule:

- A trailing stop (`mode: "trailing"`)
- Risk-reward take profit (`rrRatio` — target is the stop's distance × a ratio)
- Stop measured from the first buy instead of the average (`anchor: "first"`)
- The stop sitting at a session's opening price (`level: "sessionOpen"`)

## What was actually wrong, and it was never the rules

Three faults in this app's plumbing, all found on 9 Aug 2026:

1. **The ladder started at the wrong price.** The step offered "the price you
   clicked" as well as the base, and a saved flow had it set to the click. In a
   replay nobody clicks anything, so it started the ladder at whatever price the
   test happened to be at. Buys landed mid-rally with no floor under them. The
   old app has no such choice at all — its first rung is always measured from
   the base. The choice is gone from the step now.

2. **Only 14 coins ever traded, out of 168.** What decides which coins trade is
   which coins break a base — nothing else. But with fault 1 above, every coin
   tried to start on the very same bar, the first of the test. A practice wallet
   may hold 50 resting orders and the replay was held to the same 50, so the
   first fourteen ladders filled it and every coin after them was refused for
   the whole run. The order they were refused in was just the order the list was
   walked; the pile-up is the fault, not the order. A 40-coin test proves the
   cap: 12 of 40 traded before, 40 of 40 after.

3. **The coin list and history came from different exchanges.** Coins selected
   from Hyperliquid were replayed against Binance prices, and coins Binance had
   never listed were skipped. History now follows the full selected market key:
   Hyperliquid stays Hyperliquid, and Binance stays Binance.

Every run made before those three were fixed is worthless, whatever its numbers
said.
