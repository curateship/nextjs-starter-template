# Liquidation warning

Settings → Trading engine holds the account's default liquidation warning.
Dollars away and out of 100 away can be used separately or together. A position
warns when it crosses either distance in use for its wallet. Leaving both
account boxes blank switches off the default, but a wallet can still set its
own warning.

## Each wallet's distances

Wallet settings has two optional fields under Warn before liquidation. Each
blank field uses the matching account setting. A wallet with $50 saved uses
$50 even when the account dollar distance is $200. If the wallet's out of 100
field is blank, the account's out of 100 distance can still cause an earlier
notice. The warning fires when either distance is reached.

Clearing both wallet fields returns both distances to the account settings.
Wallets created before these fields existed have blank values and keep using
the account settings. Changing a wallet's name or key leaves its distances
alone. Zero is refused. Dollar distances must be above zero and no more than
$1,000,000,000. Out of 100 distances must be above zero and no more than 100.

Wallet rows show the distances in use when either differs from the account.
The row includes the inherited distance too, so both ways to receive a notice
are visible. The row stops showing the extra text when both distances match
the account again. The browser keeps those distances in its saved display
while a wallet refresh is loading or has failed. Saving the account defaults
also refreshes the next dashboard visit, so the opening answer uses the new
fallback distances.

The two nullable columns arrive in migration
`0167_trade_wallet_liquidation_warning.sql`. Apply the migration before running
the updated web app or engine. Existing wallet rows need no backfill.

## Which wallets are checked

If the setting cannot load, the card shows the error and a Try again button
instead of presenting blank values as though the warning were switched off.

The engine checks the active wallets it is already working once per pass. The
check uses the portfolio and live prices already in that pass, so the warning
does not make another exchange request. A wallet with no active ladder, grid,
or watched order is outside this first version and is not checked.

## How the distance is measured

The Positions table and the engine call the same calculation. The dollar gap
is the current price minus the liquidation price, without a sign. The out of
100 figure divides that gap by the current price.

Real positions use the liquidation price supplied by the exchange. KuCoin and
Phemex both map their liquidation-price fields into the shared portfolio. If an
exchange omits the price, the app cannot warn for that position. Cross-margin
prices describe the account even though the notice names the coin.

Practice positions use the app's liquidation formula. The practice engine uses
the same formula when it forces a position closed, so the warning and the close
cannot disagree about the line.

## One notice per crossing

The app records when each wallet and market enters the warning distance. Price
can move around inside the line without sending another notice. Moving outside
clears the record, and crossing back inside sends one new notice. Closing the
position deletes the record. The record survives an engine restart.

The bell and inbox receive a critical notice such as "ETH on Hyperliquid main
is 5.86% from liquidation at $82.00. Price is $87.10." A notice failure does
not stop the engine from working orders, stops, or exits. The failed crossing
remains available for the next pass to retry.
