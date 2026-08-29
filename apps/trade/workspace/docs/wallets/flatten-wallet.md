# Emptying one wallet

Open a wallet from the chart header and press its three-dot button. The details
window has two actions at its foot: Edit wallet and **Empty wallet**. Emptying
it calls off everything that wallet has waiting and then sells everything it
holds.

## The order is fixed, and it is the whole reason this exists

**Stand down first, then sell.** Selling first leaves a window where a rung
waiting below fills and reopens the coin that was just closed.

The gap is real whenever the selling happens first. "Close all" in the bottom
panel now offers the ladders and the watched prices in the same press, but
untick them and a ladder keeps working after it, so the first rung to fill puts
a position straight back. Emptying a wallet never offers that choice.

## A cancel that is refused stops the whole thing

If a ladder will not come off, nothing is sold, and the refusal is named. The
wallet is left exactly as it was apart from whatever did come off.

Selling under a live ladder would leave the wallet flat for a minute and then
holding again, having spent money in both directions. Stopping is worth the
inconvenience: the one order in the way can be dealt with by hand and the press
tried again.

## Each position is sold as a maker, not at the market

Every close goes through the same chased reduce-only post-only limit a part
close uses — see `../orders/part-close.md`. It rests just off the price, follows it, and
never crosses the book.

**That is a real difference from "Close all", and it is deliberate.** Close all
pays the spread on every coin to be out this second. Emptying a wallet is the
calmer decision — something is wrong and you want this account quiet — and the
trading rules say a close chases. If being out this second is what is wanted,
"Close all" is still there and still means that.

**It does not give up.** The orders follow the price for as long as it takes, the
same rule a part close follows.

## What the press returns, and what it does not

Nothing is sent to an exchange while the press runs. One row per position is
written and the engine rests and follows the orders on its next pass. So the
answer is a list of what was **started**, not a list of what sold:

> Duong is emptying — 4 positions are being sold with limits that follow the
> price. 2 smart orders were called off first.

Each position gets its own attempt, so one coin the exchange refuses never
stops the other three. What did not start is named and its row stays on screen.

## What the confirm counts

- **How many positions and what they are worth**, in dollars, at today's price.
- **How many ladders and grids** come off first, and that they lose their plan.
- **That it is real money**, on a live wallet.
- **That a refused cancel stops the sale**, when there is anything to cancel.

A wallet holding nothing says so instead of counting zero.

## Calling one off after the press

The resting orders show under Open orders like any other. The × on one stops
that coin's close rather than taking the order back — see `../orders/part-close.md`.

## What is not covered

The all-wallets "Close all" keeps its own behaviour: it sells at the market to
be out this second, and it works across every wallet rather than one. See
`../screens/workspace.md` for the list it opens. Plain watched orders are not cancelled by
emptying a wallet; they are a hand-placed level rather than a strategy, and each
has its own × on the chart and in Open orders. Close all can take them off.
