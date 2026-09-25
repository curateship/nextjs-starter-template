# Following and copying a trader

A member can follow a public trader for free, or copy them. Copying places
every trade the trader makes on one of the member's own wallets too, at the
dollars per trade the member picks. Trade adds a fee to each copied real-money
trade and owes the trader part of it. That fee is how Trade makes money from
the social side: no subscription and no coin.

## What Tyler decided on 25 Sep 2026

- **The fee is 0.1% of each copied trade, and the trader is owed half.** A $200
  copy that opens and later closes at $219.80 pays $0.20 + $0.22 = $0.42, and
  the trader is owed $0.21. Admin → Copy trading can change both. The fee can
  be at most 0.1%, because that is the most Hyperliquid lets an app add to a
  perp order.
- **Real money copies on Hyperliquid only.** Every other exchange can be copied
  with a practice wallet, for free.
- **Practice copying is live; real-money copying is built but switched off.**
  The switch is in Admin → Copy trading, and it stays off until a lawyer has
  looked at copying for a fee. Real money also needs `TRADE_BUILDER_ADDRESS`
  set on the server: Trade's own address that Hyperliquid pays the fee to.

## Following

- The Follow button is on every public profile. It is free and needs no
  wallet. It never places an order.
- A member looking at their own profile sees the same Follow and Copy buttons
  a visitor sees, so they know what their page offers. Pressing one says it is
  their own profile instead of doing anything. They used to be hidden there,
  and the page then said "Anyone can copy these trades" with no button on it.
- A follower gets a bell notice each time the trader closes a trade: "@sam
  closed SOL and made $120.40". Only fills from the last 15 minutes send one,
  so a wallet's first read of months of old history tells nobody anything.
- The Following page (`/following`, and the Following row in the settings cog)
  lists everybody the member follows, with each trader's 30-day figure and the
  state of any copy.
- Copying somebody follows them too. Unfollowing is refused while a copy runs,
  because the copy has to stop first.

## Who can be copied

A trader can be copied only when all of these hold:

- their profile is public and not hidden by an admin,
- the record passes the leaderboard minimums from task 01: 30 days long and 20
  closed trades,
- they switched "Allow copying" on in their Public profile window,
- no admin stopped new copies of them.

A copy follows one of the trader's wallets: a real-money wallet on the main
network. The copier picks one of their own wallets on the same exchange, also
on the main network.

## Setting up a copy

The Copy button opens a window with:

- the copier's wallet,
- dollars per trade (default $200),
- the most money in copied positions at once (default $1,000),
- the highest leverage they accept (default 5x),
- every coin, or a list of coins,
- the price allowance: how far the price may move past the trader's before the
  copy is skipped (default $1 in every $100),
- an optional loss limit that pauses the copy.

A member's first copy ever starts on one screen they must accept: this is not
advice, copies can lose money, and copies fill at different prices from the
trader's.

A real Hyperliquid wallet adds one more step. Hyperliquid only takes an app's
fee once the account's main wallet approves it, and the key Trade holds is an
agent key, not the main wallet. So the window asks the member's browser wallet
(MetaMask, Rabby) to sign the approval, Trade hands it to Hyperliquid, and then
reads back what Hyperliquid now allows before the copy starts.

## What happens when the trader trades

**How a trade is heard.** Every real fill Trade records goes through the fills
sweep (`recordLiveFills` in `src/server/trade/live-fills.ts`), and the new ones
are handed to `copyFreshLiveFills` in `src/server/trade/copy-engine.ts`. Only
the process whose database insert went in gets them, so a fill pushed to both
the website and the engine is copied once.

The trader's own app is not always open, so the engine keeps every copied or
followed trader's wallets heard (`hearCopiedTraders`, every 5 seconds):

| Exchange | How Trade hears a trade | Measured |
| --- | --- | --- |
| Hyperliquid | Pushed on its fills socket the moment it happens | Not yet |
| Phemex, KuCoin, Aster, Lighter, ApeX Omni, edgeX | Pushed on each exchange's private socket | Not yet |
| Binance, Solana, BNB Chain, Robinhood Chain | Asked every 2 minutes, only while somebody copies the trader | Not yet |

Trade's rule is no polling unless it is needed. A follower's notice is not
worth a poll, so a trader on an exchange that has to be asked is only asked
while somebody copies them. None of the times above has been measured with a
real trade yet: that needs a real trade on each exchange, and it belongs in
this table when it has been done.

**What the copy does about it.** `decideCopy` in
`src/lib/trade/copy/copy-rules.ts` answers, per copy and per coin:

- **The trader opens from nothing:** the copier puts in one trade's dollars.
- **The trader adds to a position the copy follows:** another trade's dollars.
- **The trader sells part:** the copier sells the same share of theirs. Sam
  selling 11.08 of 27.7 SOL is 40 in every 100, so a copier holding 1.11 SOL
  sells 0.444.
- **The trader's stop sells everything:** the copier sells everything.
- **The trader turns a long into a short in one trade:** the copier closes, and
  the new side is not copied, because a copy only opens from nothing.
- **A position the trader held before the copy began** is not followed. Adds
  to it are skipped with a reason; sales of it are ignored.

The share is measured against what the exchange says the trader holds after the
trade, read once per trade for every copy. When that read fails, the copy's own
memory of the trader's size stands in.

**How the copy is placed.** Never a market order. An opening copy is the same
limit order that follows the price that a part close uses (`orders/part-close.md`):
it rests just off the price and moves with it. Unlike a close, it gives up once
the price runs past the copier's allowance from the trader's price, and the
Journal says so. If the copier's position shrinks while an opening copy is
still chasing, because their own stop fired or they sold by hand, the copy
stops and keeps what it bought. Counting on would read that sale as coins still
to buy and buy them back. Following the trader out is an ordinary part close,
which never gives up. A copy carries no stop of its own; a stop the copier sets by
hand stays theirs and wins if it is hit first.

## When a copy is skipped

Every skip writes a row in the copier's Journal with the reason in plain words:

- the trade was heard more than 5 minutes after it happened,
- the coin is not on the copier's list,
- the market trades less than $1,000,000 a day,
- copies of that market already came to $1 in every $100 it traded in the last
  day, every copier together,
- the trader used more leverage than the copier accepts,
- the price moved more than the allowance before the copy could start,
- the copy would take the copier's copied positions past their limit,
- the copier's wallet already holds the coin, or has an order working on it
  (a copy never mixes with the copier's own trades),
- the copier already closed their copy of the position, so an add is not
  copied,
- the dollars per trade are below the exchange's smallest order.

The two market limits ($1,000,000 a day and $1 in every $100) are what stop a
trader buying a thin coin, letting copiers push the price up, and selling to
them. They are constants in `copy-rules.ts`, not admin settings.

## When a copy pauses

A pause never closes a position. It stops new copies and following out alike,
and the copier gets a bell notice saying why. A copy pauses when:

- the trader's profile goes private or an admin hides it,
- the trader switches "Allow copying" off,
- an admin stops new copies of the trader,
- the copier's key stops working, or the wallet is removed or switched off,
- copied trades have lost more than the copier's loss limit, counted when
  copied trades close,
- real-money copying is switched off, for a copy on a real wallet.

The copier resumes it from the Following page once the cause has cleared.

## Stopping

Stop copying asks one question: close the copied positions now, or leave them
open and only stop new copies. Closing uses the same chased limit order as a
part close.

## The Journal

Every trade a copy placed any part of says "Copied from @sam" under how it
ended, on the exchange page and the P&L page. It counts on the copier's own P&L
page and public profile like any other trade. Skipped copies sit in the same
Journal as their own rows; the bin takes one away.

## The fee record

`trade_copy_fills` holds one row per copied fill: the copier, the trader, the
exchange, the dollars traded, the exchange's fee, Trade's fee and the trader's
share. Practice fills get a row too, with no fee, so their Journal label and
the copier's figures read the same way. Nothing else works a fee out: the
trader's earnings, the admin's payout list and the profile's figures add these
rows up. The rows have no link to the copy or the wallet, so removing either
never removes money owed.

How a fill is known to be a copy: every order a copy's smart order sends is
written to `trade_copy_orders` the moment it has an id, in both the practice
engine and the real one. A fill arrives carrying its order id and nothing else.

## Paying the trader

The trader sets a payout address in their Copiers section. Admin → Copy trading
lists what each trader is owed; the admin sends the money by hand and marks it
sent with the transaction's link. Automatic payouts come later, once the
amounts are known.

## What the trader sees

The Copiers card in the Public profile window: the "Allow copying" switch, how
many follow and copy them, the most money their copies may hold together, what
they are owed and what has been paid. Never who.

## What everybody sees

The public profile has a Copying card: followers, copiers, "People copying Sam
made or lost" over the last 30 days from copiers' real wallets only, after
every fee, and how many of the trader's sales in 30 days came within five
minutes of real-money copiers buying the same coin. A sale is one order,
however many fills it took. Until somebody copies with real money, the last
line says there is nothing to compare yet.

## The fee on each exchange

| Exchange | Can Trade add a fee? | Copying |
| --- | --- | --- |
| Hyperliquid | Yes, a builder fee up to 0.1% on perps, approved once by the main wallet ([Hyperliquid API docs](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/exchange-endpoint#approve-a-builder-fee)) | Real money (when switched on) and practice |
| Lighter | Yes, a builder fee through its Partner Attribution Program, approved once by the member signing an ApproveIntegrator transaction ([Lighter partner attribution](https://docs.lighter.xyz/integrations/partner-attribution), [API](https://apidocs.lighter.xyz/docs/partner-integration)) | Practice only for now |
| Aster | Yes, through "Aster Code": the member approves the builder's agent and a highest fee (up to 0.1% on futures) on-chain, and the builder must hold 100 ASTER ([Aster Code](https://docs.asterdex.com/product/aster-perpetuals/aster-code), [API](https://asterdex.github.io/aster-api-website/asterCode/endpoints/)) | Practice only for now |
| KuCoin, Phemex | No: their keys are trade-only and have no app fee | Practice only |
| Binance, ApeX Omni, edgeX | No app fee through the keys Trade holds | Practice only |
| Solana, BNB Chain, Robinhood Chain swaps | Jupiter, Kyber and Velora each have a fee field | Practice only for now |

Lighter and Aster could take real money later. Aster's route is the larger job:
Trade's Aster wallets are API keys today, not an Aster Code agent.

**The swap fee check is unchanged.** Because no swap chain copies real money,
no swap carries Trade's fee yet, and `validateBuild` in
`src/server/protocols/evm-chain/kyber.ts` still refuses a built swap with any
fee in it. A test holds that. Allowing exactly Trade's fee, to Trade's address,
on copied swaps only, is the work to do if a swap chain is ever switched on
for real money.

## Admin

Admin → Copy trading (`/admin/copy-trading`) holds the fee, the trader's share,
the real-money switch, the traders who allow copying or are owed money, "Mark
paid", and a per-trader stop on new copies. Nothing admin does closes a
copier's position. An admin adds the link to the admin sidebar by hand, like
every other admin page here.

## Where the code is

- Rules, shapes and sentences, with tests: `src/lib/trade/copy/copy-rules.ts`.
- Hearing a trade, deciding, placing, skipping, pausing and follower notices,
  with tests: `src/server/trade/copy-engine.ts`.
- The fee record, copy orders, Journal labels and notes:
  `src/server/trade/copy-ledger.ts`.
- Follows, copies, the trader's settings and admin:
  `src/server/trade/copy-trading.ts`. Public figures:
  `src/server/trade/copy-figures.ts`.
- The browser wallet signature: `src/lib/trade/copy/builder-approval.ts`, and
  Hyperliquid's side in `src/server/protocols/hyperliquid/builder-fee.ts`.
- Screens: `src/components/social/` (`copy-dialog.tsx`,
  `profile-follow-copy.tsx`, `following-page.tsx`, `copiers-card.tsx`,
  `admin-copy-trading.tsx`).
- Tables: migration `0187_trade_copy_trading.sql`, applied to the live trade
  database on 25 Sep 2026 with Tyler's OK.

## Not measured yet

- **Load.** One popular trader's trade becomes one order per copier. The engine
  applies each exchange's request limits per copier wallet. One trader with 50
  practice copiers has not been run yet; it should be before real money.
- **How long each exchange takes to hear a trade**, in the table above.
