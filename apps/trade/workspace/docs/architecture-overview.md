# Architecture overview

How the Trade app is put together. The current dashboard belongs to
Hyperliquid; another protocol gets its own dashboard while reusing the shared
contracts and panels. The shell's own architecture — layout, navigation,
accounts, roles, billing — is the repo's `docs/shell/architecture-overview.md`;
this file only covers what Trade adds on top of it.

## What Trade is

Trade is a copy of Custom Shell being rebuilt into a trading app one section at
a time. Two rules from that model shape everything here:

- **Shell files are never edited.** Shell improvements arrive later by merging
  the shell in, and an edited shell file conflicts on every merge, forever.
  Everything Trade adds lives in files Trade created.
- **The old Trading app is a behaviour reference, not a source.** Its code
  wired one exchange into every screen — roughly two thousand lines of drift —
  which is exactly what this rebuild exists to avoid. Nothing is copied from
  it.

## The map

What Trade has added to the shell, and what each piece is for:

| Where | What |
| --- | --- |
| `src/routes/_authenticated/admin/<exchange>.tsx` | One dashboard per exchange (`hyper-liquid`, `phemex`, `kucoin`, `aster`). Each loads its own market list and carries the picked market in the address; the old `/trade` address redirects to Hyperliquid's, because a saved home setting or a bookmark may still point there. |
| `src/components/trade/` | The workspace and its panels. Draw only — no exchange code, no database. |
| `src/components/trade/paint/` | The paint tools: the rail, the layer the lines are drawn on, and their state. |
| `src/lib/trade/` | Small app helpers: panel-layout keys, number formatting, drawing shapes, chart maths. |
| `src/lib/protocols/contracts.ts` | The shapes screens and exchanges agree on, including each market's quote token. Browser-safe. |
| `src/lib/api/markets.ts` | The guarded endpoints: the market list, and saved stars. |
| `src/lib/api/drawings.ts` | The guarded endpoints for the lines drawn on a chart. |
| `src/server/protocols/` | The exchange side: the registry, and one folder per exchange. |
| `src/server/trade/` | Trade's own tables and the code that touches them. |
| `drizzle/0100_…` | Trade's own migrations, numbered from 0100. |
| `workspace/docs/ui-ux.md` | The approved look and behaviour of every screen. |
| `workspace/tasks/Platform/` | The task files, where decisions are recorded. |

## The protocol layer

The one idea: **screens never know which exchange they are talking to.**

- A screen draws `MarketRow`s — plain numbers with a key — and reads labels
  like "Hyperliquid" off the data. It never imports an exchange package and
  never asks `which protocol is this?`.
- Everything Hyperliquid lives in `src/server/protocols/hyperliquid/`. Its SDK,
  its endpoints, its response checking and its quirks stop at that folder's
  edge.
- `src/server/protocols/registry.ts` is the lookup: protocol id in, adapters
  out. Every exchange in it gets its own dashboard route; Binance carries no
  dashboard and serves backtests. The real-money gate and the secret
  scrubbers live beside it (`real-money.ts`, `scrub.ts`) — policy shared by
  every exchange, above the per-exchange folders.
- Socket reconnect waits and ordinary candle lengths live once in
  `src/lib/protocols/timing.ts`. Exchanges use the shared answers unless an
  exchange supplies its own reconnect schedule. Exchanges whose legal price
  rule is a market tick also share the adapter in `src/lib/protocols/tick.ts`.
- Exchange response translators use one number reader in
  `src/lib/protocols/number.ts`. A finite number or a nonblank decimal string
  is accepted. Blank text, including whitespace, is unknown on every venue.
- Phemex and KuCoin account-change marks live in
  `src/server/protocols/touched.ts`, keyed by exchange on `globalThis`. A module
  reload keeps both marks, while clearing one in a test leaves the other alone.
- **The rule is a test, not a hope.** `src/server/protocols/fence.test.ts`
  fails the suite if the exchange package is imported anywhere else, or if
  shared code compares against a protocol id.

### Where a fact about one exchange goes

An exchange's habits are recorded in that exchange's own entry, and shared code
reads the record. Never `if (protocol === "kucoin")` somewhere in a screen.
There are two shapes this takes.

- **A fact answers a yes-or-no question**, so the entry carries a line and the
  shared code reads it. `account.profitPerSale` is one: KuCoin only states
  money when a whole position closes, so its partial sales report a zero that
  means "not said yet", and the Dashboard's Settled sum would otherwise count
  those zeros as a flat day. Adding an exchange means answering the question in
  its entry, and the answer sits next to the code it is true of.
- **A fact needs sentences**, so the exchange writes them itself and sends them
  along. A refused trading key is the example. Hyperliquid can name the address
  the pasted key signs as and the addresses the account actually approved,
  because Hyperliquid is the only venue here with an approved-keys list. KuCoin
  can say which of its three values to check. Each folder writes its own
  sentence after the shared `KEY_NOT_APPROVED` code, and the wallet dialog
  shows whatever came back without ever learning who wrote it.

The test only catches the first kind of leak, since the second is prose. Both
are the same mistake.

How the market list flows, end to end:

```
route loader → loadMarkets() (guarded) → dashboard owner → hyperliquid/markets.ts
   → exchange API → response checked → translated to MarketRow[]
   → the panel draws rows, labels and all
```

## The chart's surface

The same idea one layer up: **the chart never learns what a line means.**

`PriceChart` takes candles and offers exactly two things beyond drawing them:

- a `ChartSurface` — where a time and a price land in the plot area, and back
  again, plus the plot area's size;
- an `overlay` slot, drawn over the candles and handed that surface.

Everything else is a consumer. The paint tools are the first one: they own
what a shape is, how it is picked up, where it is kept and what it looks like.
An alert on a drawn line attaches the same way later, without `price-chart.tsx`
hearing the word "alert" — which is what kept the old app's chart from being
3,961 lines.

Two things that make the surface work and are easy to break:

- **The overlay must out-stack the chart.** The library's canvases carry
  `z-index: 1` and `2`; an overlay left at `auto` is visible through them but
  never touched, because every click lands on the canvas.
- **Coordinates are recomputed on the chart's own repaint**, through a
  do-nothing primitive attached to the price series. Panning, zooming,
  resizing and the price scale rescaling itself all arrive there and nowhere
  else; a timer or a resize observer would miss half of them.
- **The whole history is framed once per series, never when data arrives.**
  The live feed refetches candles after every gap it recovers from, so fitting
  on new data throws a zoom away every few minutes. `PriceChart` takes a
  `viewKey` — market and timeframe as one string — and frames once per value
  of it.

**The remembered view** is `src/lib/trade/chart-view.ts`: four numbers, none of
them a price or a time, so they mean the same thing on any market.

- Sideways: **candles across the screen**, and **candles between the right edge
  and the newest one**. Measured from the newest candle, not the oldest — the
  library's own visible range counts from the oldest, and every market has a
  different number of candles, so carrying that across would land somewhere
  arbitrary.
- Up and down: **the share of the height above and below the candles**. Applied
  as the price scale's `scaleMargins`, which the library keeps honouring as the
  price moves, so the squash survives the next tick as well as the next market.
  There is no public way to set an exact price window, and there should not be:
  a $60,000 window on a $2,000 coin shows nothing.

`PriceChart` asks for the view through a function rather than taking it as a
value: it changes on every frame of a pan, and passing it in would re-render
the panel a hundred times per gesture to tell it what it is already showing.

### What it cost, and where it leans on the library

About 550 lines all in — 163 of them tests and roughly 200 of them comments, so
around **200 lines of working code**, in five small files and one database
column. Small. But three of those places are working *around* the chart library
rather than with it, and one is a timing guess. Anyone changing this should
know which is which.

- **There is no way to tell the library "show exactly this price window."** So
  the squash goes on as `scaleMargins` instead. That turned out better than a
  price window — a price window could not cross markets anyway — but it was
  arrived at by having no choice, not by design.
- **The library only reports sideways movement.** Dragging the price axis fires
  no event at all, so `subscribeVisibleLogicalRangeChange` is useless here; the
  view is read off the chart's repaint hook, which fires for everything. Watch
  for this if the reading ever moves back to a "proper" event — the squash will
  silently stop saving.
- **The highest and lowest candle on screen is worked out here**, including the
  half-finished live bar, to match a number the library already computes
  internally. This is the weakest joint in the whole thing: if their scaling
  maths ever changes, ours disagrees silently and the chart starts drifting.
- **Telling "the app moved the chart" from "a person moved the chart" is a
  200ms timer** (`framingRef`). While the app is framing a chart it ignores
  movement reports. It works, and no human gesture starts and finishes inside
  that window, but it is a guess about timing rather than a real signal.

**The lesson from the first attempt, which did not work.** It failed on
complexity nobody asked for: two clamps added defensively — "do not scroll past
here", "do not zoom in further than this market has candles". Both quietly
overrode what the user had set, and one of them fed its own clamped answer back
into the saved value, so it compounded. Deleting them made the code shorter
*and* correct. The guard rails were the bug.

**What an unfinished exchange may leave out.** The registry's optional blocks
say which parts of a venue are not ready yet. A venue with no pushed-price feed
omits `livePrices`, but the engine may not replace it with a polling loop and
the venue is not ready for live trading. A socket that needs a handshake the
browser cannot make fills in `liveTicket`; a feed that cannot follow a whole
list at once omits `watchFigures`, so that list is a snapshot rather than a
pretend live feed. Each is absent rather than stubbed, because a subscription
that never fires looks exactly like a broken socket.

**The live-trading gate has two feeds.** Before `capabilities.orders` is enabled,
the venue must provide pushed prices and pushed account events for positions,
open orders, order changes and fills. A request read is allowed at startup and
after a disconnect to establish truth and recover a gap. It is not the steady
live loop. Placing, moving and cancelling remain authenticated request commands.
The registry test currently enforces the price half only. Hyperliquid, Phemex
and KuCoin predate the account-feed rule, so the missing account-feed check must
be added as their socket work is completed.

**Adding another exchange** is: one new folder under `src/server/protocols/`
that produces the same shapes, one new entry in the registry, and its own
dashboard route under `src/routes/_authenticated/admin/`. Shared panels are
reused as-is, but market lists from different protocols are never combined
into one list. Phemex (added 19 Aug 2026) is the worked example: an API-key
exchange, so its wallet signs in with a key id and secret packed into the one
encrypted blob, and its account reads carry that credential — the registry's
authenticated reads take a credential thunk that wallet-shaped venues simply
never call.

Aster has the full live contract. Its registry entry supplies credentials,
account figures, orders, funding, pushed mark prices and a private account
stream. Mainnet is the work target. Aster testnet support remains available,
but a testnet run is not required before using the mainnet connector.

## Saved data

- **A saved market is protocol + network + id in one key** —
  `hyperliquid:mainnet:BTC` — never a bare symbol, because BTC exists on every
  exchange. One builder and one parser in `contracts.ts`; a key that does not
  parse or is not listed resolves to "not available", never to a different
  market.
- **Trade's tables are declared in `src/server/trade/schema.ts`**, not in the
  shell's schema file. Market folders use `trade_market_folders` and
  `trade_market_folder_items`; `trade_prefs` holds the market they were last
  looking at, how far the chart was zoomed and scrolled, and the
  minimum daily market volume shown across every exchange; and
  `trade_chart_drawings` (one row per line drawn on a chart, tied to its market
  key). All are server-side, so they follow the account rather than the
  browser.
- **A drawing's shape is one `jsonb` column, read through one validator.** A
  level and a trendline hold different things, and a third kind later should
  be a new shape to validate rather than a migration. A row that cannot be
  read is left out of the answer, never drawn as something it is not, and
  never destroyed.
- **Trade's migrations are numbered from 0100.** The shell keeps adding its own
  under 00xx and the runner applies the folder in filename order, so the gap
  means a shell merge can never collide with an app migration or run after one
  it should have preceded.
- **An index is declared beside its table as well as created by its migration.**
  Partial indexes keep the same condition in both places. The current audit
  applies every migration to a fresh PostgreSQL-compatible database and then
  compares the surviving migration index names with the schema declarations.
  The shell owns 97 migration-created indexes and Trade owns 23; both lists
  now match with nothing missing or declared only in code. Shell declarations
  change in Custom Shell first, while Trade's own declarations stay in
  `src/server/trade/schema.ts`.
- **The practice engine settles when it is read, not on a clock.** Its four
  tables (`trade_paper_positions`, `trade_paper_orders`, `trade_paper_journal`
  and a per-wallet watermark) hold only facts. A wallet's cash is its starting
  balance plus every journal row's profit less its fee, worked out on read;
  margin, liquidation prices and open profit are arithmetic on the position's
  own figures. Nothing derived is ever stored, because a stored second answer
  drifts from the first. Reading an account replays the candles since the last
  look and then checks every level against today's price — both halves are
  safe to run twice, which is what lets two tabs poll at once.

## The large-file boundaries

Two server files have clean internal boundaries now. Live ladder placement and
reconciliation stay in `live-smart-orders.ts`. Live grid placement and grid
edits live in `live-grid-orders.ts`. Both send work through the same per-wallet
queue, so a grid edit cannot race a ladder pass on the same wallet.

The practice wallet's database loading, saving and commands stay in `paper.ts`.
The in-memory book and candle replay live in `paper-replay.ts`. Backtests and
practice wallets still call the same replay functions. The replay file imports
no database code.

The next useful split in `use-trading.ts` has three parts. The hook should keep
ownership of polling and command state. Pure code should build its derived
rows from the latest answer. Thin command wrappers can move to a second hook.
The existing mutation helper stays shared and unchanged.

`chart-panel.tsx` needs a design decision before code moves. One owner should
decide which dialog is open, instead of fifteen separate values that can allow
two dialogs at once. The chart drawing half can then become a separate layer
component. The current file stays intact until that dialog rule is agreed and
covered by browser tests.

## Real orders

Live wallets trade for real through the same chart flow the practice engine
uses (task `Trading/real-orders.md`). The shared row types in
`src/lib/trade/paper.ts` are named `TradePosition`, `TradeOrder` and
`TradeSide` — not "Paper" — because a real exchange row is shaped into the
same type (with its `live` field filled in) so every screen draws both kinds
with one set of code. Names that still say "Paper" belong to the practice
engine alone. The security rules, in the order they
bite:

- **A pasted trading key is proved before it is saved.** The account's own
  main key is refused outright (`KEY_IS_ACCOUNT` — it can move money out, and
  is never stored), and the exchange must list the key as approved to trade
  for that account. The approval's expiry is recorded and the wallet card
  warns inside two weeks of it.
- **The key never leaves the server.** Ciphertext in the row, decrypted for
  one signing call inside `src/server/protocols/hyperliquid/`, never cached,
  and every error message is scrubbed of anything key-shaped before it
  travels. The fence test also keeps `viem` (the signing library) inside that
  one folder.
- **Real money is blocked server-side.** Testnet signs freely; mainnet
  signing throws until `TRADE_ENABLE_MAINNET=true` and the Real-money trading
  switch in Settings are both on.
  A wallet can only ever trade a market on its OWN network.
- **Order numbers cannot collide.** One `trade_wallet_nonces` row per signing
  address, bumped atomically (`greatest(last + 1, now)`), shared by every
  producer.
- **Everything is written down.** Every ask, answer and refusal lands in
  `trade_live_journal` (never a secret; notes are pre-scrubbed), and a partly
  accepted order — entry stood, protection refused — is reported exactly,
  never folded into a success.
- **Market orders are capped**: sent as immediate-or-cancel limits no more
  than 3% through the price, so a thin book cannot fill one far from what was
  on screen. A venue's narrower live boundary wins; KuCoin reads that boundary
  just before the signed order.

Not yet: dragging a live resting order to a new price (`edit-open-orders.md`),
the recovery view (`recovery-tools.md`), and automations trading real money.

## Deliberately not built yet

- **Price alerts on drawn lines.** When they arrive they attach to a drawn
  line through the chart's surface, not through the chart. The market list's
  Watch tab is already used by markets with active smart orders. Notices about
  things that already happened — a fill, a stop firing, a flow stopping on its
  own — exist now; see `trade-notices.md`.
- **The Canvas and the Backtest stay outside this app's exchange boundary.**
  The Canvas will hand an automation to the Backtest or to a Bot tab through a
  door, not run either itself — decided in
  `workspace/tasks/archive/canvas-hands-off-to-backtest-and-bot.md`.

## The roadmap

The porting roadmap chosen on 7 Aug 2026 lives as 19 ordered task files in
`workspace/tasks/` under `Markets/`, `Chart/`, `Account/` and `Trading/` —
built category by category, in that order: public market data first, chart
depth second, read-only accounts third, and the path to real money last,
with testnet and paper trading before a real order can exist. Features
rejected during that selection (alerts, bots and their orbit, the scanner
family, and others) are on the record in those sessions and are not
re-suggested.

## Where decisions live

The task files under `workspace/tasks/` are the record: what was decided,
when, and why, including the decisions made mid-build — finished and
superseded ones move to `tasks/archive/`. The screen rules live in
`workspace/docs/ui-ux.md`. When this file and a task file disagree, the task
file is newer — fix this one.
