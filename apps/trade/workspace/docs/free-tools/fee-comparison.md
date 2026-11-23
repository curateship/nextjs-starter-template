# Fee comparison

`/tools/fee-comparison` shows what the same trading costs in fees on each
exchange Trade connects to, cheapest first. $10,000 a trade and 40 trades a
month, all filled at once, costs $180 a month on Hyperliquid at 0.045% and $240
on KuCoin at 0.06%. The page opens without an account and works everything out
in the browser.

## Where each rate comes from

Every rate is the exchange's published fee on perpetual futures for a new
account: no trading volume, no staked tokens, no referral code. Each one was
read off the exchange's own page on 25 Sep 2026. No rate is a guess, and an
exchange whose own page does not state a rate is left out.

| Exchange | Maker | Taker | Source |
| --- | ---: | ---: | --- |
| Hyperliquid | 0.015% | 0.045% | hyperliquid.gitbook.io, Trading → Fees, tier 0 |
| Lighter, Standard account | 0% | 0% | docs.lighter.xyz, Trading fees |
| Aster, most coins | 0% | 0.04% | docs.asterdex.com, "Crypto — General" |
| KuCoin | 0.02% | 0.06% | kucoin.com futures fee announcement, still live |
| Phemex | 0.01% | 0.06% | phemex.com/fees-conditions, lowest futures tier |
| ApeX | 0.02% | 0.05% | ApeX blog, "standard rates" |
| edgeX | 0.04% | 0.045% | pro.edgex.exchange/vip, Regular User, Contract |
| Binance, USDT markets | 0.02% | 0.05% | binance.com/en/fee/futureFee, Regular User |

The exact links are in `src/lib/free-tools/fee-comparison.ts`, one per row, and
the page links to each one.

- **Lighter:** a Standard account pays nothing. A Premium account pays 0.004%
  and 0.028% at its lowest tier, and the table shows Standard because every
  new Lighter account starts there.
- **Aster:** some coins, which Aster calls Group B, charge a 0.1% taker fee.
  The table shows the rate for most coins.
- **KuCoin:** the source is KuCoin's futures fee announcement from 1 Apr 2020,
  which KuCoin still publishes. KuCoin's VIP page shows only VIP 5 and up to
  a visitor who is signed out.
- **ApeX:** the source is ApeX's July 2024 blog post naming 0.02% and 0.05% as
  its standard rates. ApeX's own fee tier page draws nothing for a visitor who
  is signed out.
- **edgeX:** the VIP page read on 25 Sep 2026 says 0.04% maker and 0.045%
  taker for a regular account. That is higher than the 0.015% and 0.038% edgeX
  announced in July 2025, and the page is what the table follows.
- **Binance:** Binance's USDC markets charge 0% maker and 0.04% taker. The
  table shows USDT markets, which Trade's Binance connection uses.

## Who is not in the table

Solana, BNB Chain and Robinhood Chain are listed under "Not in the table".
Trade trades there by swapping through Jupiter, KyberSwap or Velora, and each
pool on a swap's route charges its own fee, so there is no one rate to put in
a row.

## The monthly sum

The maths is `compareFees` in `src/lib/free-tools/fee-comparison.ts`.

- **One trade:** trade size × (maker share × maker rate + taker share × taker
  rate). With 30 out of 100 trades waiting on the book on Hyperliquid, $10,000
  × (0.3 × 0.015% + 0.7 × 0.045%) = $3.60.
- **One month:** the fee on one trade × trades a month. $3.60 × 100 = $360.
- **Order:** cheapest month first. Exchanges that cost the same are in name
  order, and the answer names every exchange tied for cheapest or most
  expensive.
- **Difference over a year:** the most expensive month minus the cheapest,
  times 12.
- **Sorting:** clicking a column heading re-sorts the table by that column.

## The form

- **Size of each trade:** $1 to $1,000,000,000. The whole trade's value, with
  leverage, because exchanges charge on that.
- **Trades a month:** 1 to 100,000. Opening and closing a trade are two trades.
- **Out of 100 trades, how many wait on the book:** 0 to 100. A limit order
  that waits pays the maker fee. A market order, or a limit order that fills at
  once, pays the taker fee.
- **A number outside the limits:** the field is marked, leaving it shows an
  error saying what is allowed, and the answer keeps the last number that fit.

## The 90-day warning

A row checked more than 90 days ago shows, in red and in words, "over 90 days
ago. The rate may have changed." beside its date. Today's date comes from the
server when the page loads, so the page drawn by the server and the page in
the browser always agree on which rows are old.

## Updating the table

1. Open the row's source link.
2. Copy the base maker and taker rate for perpetual futures, for a new account.
3. Change `makerPercent` and `takerPercent` in `FEE_TABLE`, and set `checkedOn`
   to that day, even if the rates did not change.
4. If the exchange moved its fee page, change `sourceUrl` too.
5. Run `fee-comparison.test.ts`.

A new exchange gets a row only once its own page states a rate. Put it in
`LEFT_OUT` with the reason until then.

## Not counted

Discounts for big traders, staked tokens and referral codes are left out. So is
funding, the charge for holding a trade open, which is task 07. Trade's own fee
on copied trades is not an exchange fee and is not in the table either.

## Where it is listed

The entry in `src/lib/free-tools/registry.ts` is marked shipped, so its card
shows on `/tools`. `src/routes/tools_.fee-comparison.page.ts` declares the
page, which puts it in the sitemap and on the Pages dashboard, and its title and
share preview come from that declaration through `freeToolHead`. A visitor who
is signed out sees the Create account card at the end.
