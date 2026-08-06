# Trade — screen structure and interaction rules

What the app looks like and how it behaves. One section per part of the product,
added as each part is approved. Anything not written down here has not been
agreed yet.

## The Trade workspace

Four areas on one screen, at `/trade`, which is also where signing in lands you.

```
┌────────────┬─────────────────────┬────────────┐
│ Markets    │ MARKET HEADER       │ Account    │
│  All|Fav…  │ ─────────────────── ├────────────┤
│  (list)    │ Chart               │ Order      │
│            │                     │            │
├────────────┴─────────────────────┴────────────┤
│ Positions | Open orders | Fills                │
└───────────────────────────────────────────────┘
```

- **Left — Markets.** The whole panel is the market list: which exchange it
  comes from, search, five tabs, a sort, and a star on every row. Live exchange
  data. (An earlier draft had a separate Favourites row below the list; it was
  replaced by the Fav tab — two homes for one list is duplication.)
- **Middle — the market you picked.** Its header holds the name, the exchange,
  the network and its live figures. The chart fills everything below.
- **Right, top — Account.** Which account you are trading with.
- **Right, bottom — Order.** The form. Below the account, because the account is
  what decides where an order goes and what it is allowed to be — reading down
  the panel is the same order as making the decision.
- **Bottom — what you are holding.** Positions, open orders and fills, as tabs.

The right panel is **two rows with a divider between them**. The rows drag
against each other and their split is remembered. The panel as a whole is what
shuts, so both rows go together — and both cards have to be taken away at once,
or a row with no width still paints its side borders and leaves a stray line
down the workspace.

## The market list

The panel is shaped like the automation palette, its sibling on the other
workspace: the underline tab row is the top of the panel, the sort headers sit
under it, the list fills the middle, and the search is the bottom bar — its
placeholder names the exchange ("Search Hyperliquid Mainnet"), so what the
list covers is on screen without spending a row on it.

- **Three tabs, with icons:** All (the whole catalog), Fav (starred), Watch
  (markets with an alert, once alerts exist). A tab whose data source does not
  exist yet says what it is waiting for instead of drawing an empty list that
  reads like a bug.
- **A row is the symbol and the day's move, nothing else.** The percentage is
  signed and sits in a soft pill of its colour — green up, red down; the price
  belongs to the market header; a market with no yesterday price shows a plain
  dash, not a zero in a pill.
- **Sort is drawn as column headers** — "Market / 24h Vol" left, "Change 24h"
  right, the shared `TableSortButton` — and clicking the sorted one flips the
  direction.
- **Stars save to the account, not the browser**, so favourites follow you
  between machines. Starring is optimistic and reverts with a toast if the save
  fails.
- **Markets nobody trades are hidden** (zero volume) — unless starred or
  selected, which keeps your own markets visible no matter what.
- **Selection lives in the address** as a full market key
  (`?market=hyperliquid:mainnet:BTC`), so a link means the same market even
  when a second exchange exists.
- **The exchange call failing does not take the page down.** The list shows
  the error and a retry; every other panel still works.

## The protocol layer (where the exchange lives)

- Screens draw `MarketRow`s from `src/lib/protocols/contracts.ts` — never an
  exchange's raw response. A market is identified by protocol + network + id.
- Everything Hyperliquid is in `src/server/protocols/hyperliquid/`, the only
  folder allowed to import its SDK. `fence.test.ts` fails the suite if it
  leaks, or if shared code ever asks `=== "hyperliquid"`.
- Adding an exchange is a new folder plus one entry in
  `src/server/protocols/registry.ts`. No screen changes.

Two things the old Trading app had that this does not, on purpose:

- **No bar across the top.** The old one put the market's figures and the
  account's picker in the same strip, where each could be read as the other's.
  The market's figures belong to the chart underneath them.
- **No order book or trades tape panels.**

## How the panels behave

The same panel parts as the Automation Canvas, not a second system. Anything
fixed in one is fixed in both.

- Every divider drags.
- **Left and right shut all the way to nothing.** A slim tab appears on the
  middle panel's edge where each one disappeared, and brings it back.
- **The bottom never disappears.** It shuts down to its own tab row, which stays
  on screen with its counts, and the divider above it stays draggable.
- **Double-clicking the blank part of a panel shuts it.** Double-clicking what
  is left opens it again. A double-click on a button, a box or a word is that
  control's, never the panel's.
- **Sizes and shut panels survive a reload**, remembered per browser.

## Narrow screens

Designed with the wide one, not bolted on.

- The middle panel takes the whole width and stays the main thing.
- Two labelled buttons in the market header slide the side panels in. The
  markets sheet is the full market list; the account sheet carries its two rows
  stacked, sharing the height — no divider, because a screen with no room to
  spare does not need a third way to size the same thing.
- The bottom panel stays where it is — it already works at any width.
- A slid-open sheet closes when the window crosses the width boundary, in
  either direction.

## Stand-in figures

While a part of the page is not connected to anything, its numbers are made up,
and they have to say so three ways at once, because any one of them can be
missed:

- **Quieter and dashed-underlined** — the shell's `SampleValue`.
- **A "Sample" badge in words** on the panel, for greyscale and screen readers.
- **Hovering says it plainly** — "a stand-in figure".

A stand-in figure is never coloured green or red. Colour is what makes a made-up
number look like a real one.

Watch for this: putting an `inline-flex` box inside `SampleValue` stops its
dashed underline painting at all. Arrows and icons go beside the figure, not
inside it.

## Empty states

Every panel says something true about itself rather than "coming soon". The
words written for an empty panel are the same words a brand-new account sees on
the finished page, so the empty page gets designed once, at the start.

- Markets — "Pick a market to chart it."
- Chart — "The chart goes here."
- Account — "No account connected yet."
- Positions / Open orders / Fills — each says what would be there.

## Rules that hold everywhere

- **Never swap a missing market for a different one.** If a saved market is gone
  or unavailable, say so. Never quietly fall back to BTC or anything else.
- **An unavailable action explains itself.** Never hide the reason, and never
  quietly change what the user asked for into something that is allowed.
- **The exchange and network are always visible** wherever a market or an
  account could otherwise be read as belonging to the wrong one.
- **Every icon-only control has a label**, focus stays visible, and every panel
  is reachable with the Tab key alone.

## Where the navigation lives

The sidebar and the signed-in home page are Settings, held in the app's
database — not in code. Trade is a copy of Custom Shell, and an app never edits
a shell file, so these are changed on the Settings screens:

- Settings → Sidebar — the **Trade** link.
- Settings → General settings — the admin and member home pages, both `/trade`.
