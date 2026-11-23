# Sweeping leftovers

A real Solana or BNB Chain wallet has a **Sweep leftovers** button in its
details window. It swaps every small coin balance back into the wallet's dollar
coin, one coin at a time, after showing what each swap would cost.

```
Solana wallet leftovers:  BONK $3.10   WIF $7.40   JUP $11.20
Fee each: about $0.02
Swept: $21.70 in, about $21.64 USDC out
Skipped: a coin worth $0.30 whose fee is $0.22
```

## Where it is

Open a wallet from the chart header and press its three-dot button. The
details window's foot reads Empty wallet, Sweep leftovers, Edit wallet, Done.
Sweep leftovers only shows on a real wallet on Solana or BNB Chain mainnet.
Practice wallets and futures exchanges do not have it.

## What comes back

- **Solana sweeps into USDC.**
- **BNB Chain sweeps into USDT**, not USDC. Every BNB Chain swap in Trade buys
  with and sells into USDT, and the wallet's Free figure is its USDT, so the
  sweep uses the same road.

## What counts as a leftover

- **A coin worth less than the limit.** The limit is $25 when the window
  opens and can be set from $1 to $1,000. The list reloads half a second after
  the number changes.
- **Worth is the wallet's own price for the coin**, the same price the wallet
  card values it at.
- **Never SOL.** SOL pays every Solana fee, so sweeping it would leave the
  wallet unable to send anything. BNB pays BNB Chain's fees and never shows as
  a holding at all.
- **Never BNB Chain's USDC.** It is already dollars.
- **A coin with no price is listed as skipped.** Its worth is unknown, so it
  cannot be measured against the limit.
- **A coin worth under one cent is not listed.** The wallet read already hides
  those.

## The fee rule

A coin is swapped only when the fee is at most half of what the coin is worth.
A $0.30 coin with a $0.22 fee is skipped, because $0.22 is more than $0.15.

The fee is two parts added together:

- **What the swap loses.** The coin's worth minus the dollars the quote says
  come back. This holds the router's own cut and how far the sale moves the
  price. A quote that pays more than the wallet's price counts as zero here,
  never as a negative fee.
- **The chain's fee for sending it.** KyberSwap states its estimate in dollars
  on every BNB Chain route. Jupiter states Solana's in SOL, and Trade turns it
  into dollars at the last SOL price. When Jupiter pays the fee itself (its
  "gasless" swaps), this part is zero.

The rule is checked twice: once for the preview, and again for each coin just
before it is sold, with a fresh quote. A coin whose price moved so that it now
fails the rule, or is no longer under the limit, is skipped at that moment and
nothing is sent for it.

## What the window shows

One row per leftover, smallest first: the coin, its worth, the fee, the
dollars quoted back, and a result. Before the sweep the result says Will swap,
or Skipped with the reason in a sentence. Under the table one line adds it up:
"2 coins worth $10.50 would bring back about $10.46 USDC. 1 skipped."

## Running the sweep

- **One coin at a time, in the order shown.** Each row changes to Swapping,
  then to its result, before the next coin starts.
- **Each sale is an ordinary close.** It goes through the same server path as
  the Sell all button on a position: the whole holding, at today's price,
  within a 0.5% price limit. So the Journal gets one close row per coin, and
  every refusal reads the same as it would from the positions table.
- **A refused coin never stops the others.** Its row says Refused and why, and
  the next coin goes ahead.
- **The window stays open while it runs.** Escape, clicking outside and the
  close button do nothing until the last coin is done.
- **The line at the bottom compares what came back to what was quoted:**
  "Swept 1 of 2. $7.37 USDC came back, against $7.38 quoted." The two should
  differ by no more than the 0.5% price limit. When the chain has not reported
  a fill yet, the row says so and the total says "so far".
- **The wallet's figures reload** once anything was sold.

## Real money

Nothing is sent unless both real-money switches are on: the server's
`TRADE_ENABLE_MAINNET` lock and the switch in Settings. The window reads both
when it opens. With either off it says so above the table, and pressing Sweep
shows the same sentence in the error message and sends nothing. The close path
also checks both switches again just before signing, so a switch turned off
mid-sweep stops the coins that have not gone yet.

The Sweep button is never greyed out while idle. Pressing it with nothing to
sweep, or with real money off, explains why in the error message.

## What it does not do

- **Futures exchanges.** Hyperliquid and the rest hold positions, not coins.
- **A schedule.** It only runs when the button is pressed.
- **Coins Jupiter or KyberSwap will not quote.** They show as Skipped with the
  router's refusal.
- **Closing empty Solana token accounts.** Each one holds about 0.002 SOL of
  deposit that closing would hand back. Left for a later version.

## Known gaps

- **Coins that take a fee on every transfer** can return less than quoted. The
  bottom line's "came back" against "quoted" is where that shows.
- **A BNB Chain coin sold for the first time needs an approval first**, a
  second small transaction. Its fee is not in the estimate. At today's BNB
  Chain gas price it is a fraction of a cent.

## Code

- `src/lib/trade/dust-sweep.ts`: the leftover rule and the fee rule.
- `src/server/trade/dust-sweep.ts`: the preview read and the one-coin sale.
- `src/lib/api/trade/dust-sweep.ts`: the two server functions.
- `src/components/trade/dust-sweep-dialog.tsx`: the window.
- `SwapQuote.networkFeeUsd` in `src/lib/protocols/contracts.ts`: the chain fee
  each quote now carries.
