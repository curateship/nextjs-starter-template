# Watched orders — how a plain order works now

Since 18 Aug 2026 a plain order does not rest in the exchange's book. The app
watches the price, and only when the market actually reaches the level does it
start placing anything. This doc says how that works, what dragging does for
each kind of order, and what the trade-offs are.

The rules this machinery must add up to are stated once, in
`trading-rules.md` — that file outranks both this doc and the code.

The code lives in `src/lib/trade/order-style.ts` (the setting),
`src/lib/trade/watch-order.ts` (what a watched level is),
`src/server/trade/smart-watch.ts` (the engine that works it), and
`src/server/trade/live-orders.ts` / `src/server/protocols/hyperliquid/orders.ts`
(the real-money doors).

## The two styles

- **Watch** (the default): the level stays inside this app as a row in the
  database. Nothing is sent to the exchange until the market touches the
  price. The money stays free until that moment, the level is nobody else's
  business — it never shows in the public book — and it does not use up the
  exchange's cap on open orders.
- **Rest** (the old way, still choosable in Settings → Trading engine): the
  order sits on the exchange itself. It fills even when this app is switched
  off, and anyone reading the book can see it.

Every account starts on watch. One saved setting flips the whole account back
to resting.

## What happens when the price hits the level

The engine never buys at market. When the market reaches a watched buy:

1. A **post-only limit** is rested just off the touch — post-only means the
   exchange refuses it rather than let it fill as a taker, so it always pays
   the cheaper maker fee.
2. If the price walks away, the engine moves the order after it — the same
   chase a signal trade uses — re-resting a little off the price each time.
3. **"How far it may follow"** is on the order: zero waits at the level for as
   long as it takes; a percent gives up once price has run that far past it.
4. The stop and target typed on the order ride along and are handed to the
   position the moment it opens.

The DCA ladder's rungs work the same way on real and practice wallets, and the
grid always has. In a backtest a rung is modelled as a resting order the
candle's wick fills — the replay cannot watch a price tick by tick, and the
wick-fill is the same price the chase would have chased to.

## Dragging, for each kind of line

Dragging is instant on screen: the line is pinned where the hand lets go, and
the saving happens behind it. If the save is refused, the line goes back and a
message says why.

- **A watched level**: the drag rewrites the price the app is watching.
  Nothing touches the exchange. Once the level has been hit and the chase is
  working the exchange, the drag is refused — at that point it is an order in
  flight, not a line to reposition.
- **A real resting order** (rest mode): the level never ends up with nothing
  on it. On Hyperliquid and Phemex the exchange's own *modify* command moves
  the order in place — same order, same size, new price, one call. For years
  the code said a real order "cannot be changed in place"; that was never
  true, the modify command existed all along.
- **A real resting order on KuCoin**: KuCoin Futures has no modify command,
  checked again on 21 Aug 2026 against the exchange's own SDK, whose futures
  order list is add, cancel and read with nothing between them. So a move
  there is two calls, and the new order goes on **first**. The old one comes
  off after it, so for a fraction of a second that level is covered twice
  rather than not at all. Three endings, and the screen says which:
  - The usual one. The new order goes on, the old one comes off, the line is
    where it was dropped and nothing is said.
  - The new order is refused, most often because both orders need margin at
    once and the wallet has not got it. Then **nothing moved**, the old order
    is still resting at its old price, the line snaps back and the message
    says why. A rate limit and a missing key are handed back as themselves
    rather than dressed up as a move that could not be made.
  - The new order goes on and the old one will not come off. Then **two orders
    may be resting**, the message says so in those words and says to check
    Open orders and cancel one. "May", because the old order might equally
    have filled while the new one was going on: the exchange is asked once,
    and only a straight answer that the old order has gone buys silence. An
    exchange that will not say is not an exchange saying no.

  `trading-rules.md` states what the doubled moment can cost in dollars. It
  used to be the other way round — cancel first, place second — and the moment
  in the middle was a level with nothing on it, which is the moment a fall can
  reach it.
- **A practice order**: re-prices its row, same as ever.
- A waiting order's **stop** drags too, and the order resizes so it still
  risks the same money. Its **target** drags without touching the size.

## What it costs

A watched order only fires **while the engine is running**. A resting order
filled at 3am with the laptop closed; a watched one is this app's own eyes,
and closed eyes see nothing. That is the price of the money staying free and
the level staying private. On the server deployment the engine runs all the
time, so this matters most when trading against a dev machine.

## The safety around it

- **A refused market is held back for one minute.** When the exchange refuses
  an order on some market, that market's triggers stop firing for sixty
  seconds instead of retrying every pass — a persistent refusal costs one
  request a minute, not sixty. The app once rate-limited itself off the
  exchange with exactly that loop. A fill clears the hold.
- **Wallet-wide entry rules fire where the trigger fires.** The cap on how
  many coins open per hour, and the crash rule's "only coins the exchange
  allows 10× or more on", are checked at the moment a trigger would open a
  new coin — on practice and real wallets alike, not only in backtests.
- **Money is one pool.** Hyperliquid unified its account on their side: the
  USDC balance backs orders on every market, main or side, with the exchange
  moving slices onto a market as orders there need them. The app no longer
  gates anything on "money parked on that market".
