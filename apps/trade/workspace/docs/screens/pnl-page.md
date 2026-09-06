# The P&L page

P&L is short for profit and loss. The page at `/pnl` answers how the trading
has gone: the whole Journal on the left, a month grid coloured by each day's
result top right, and three cards under it: an AI score out of 100, the
winning patterns and the losing patterns. Any signed-in member can open it.

```
┌──────────────────────────────┬────────────────────────┐
│ Journal                      │ September 2026   ‹ ›   │
│  every exchange, every       │ Mon Tue Wed Thu Fri …  │
│  wallet, newest first        │  +40 +12  -8 +65 -120  │
│                              ├────────────────────────┤
│                              │ Patterns   week|month|3m│
│                              │  AI score 62 / 100     │
│                              │  Winning patterns      │
│  Show older                  │  Losing patterns       │
└──────────────────────────────┴────────────────────────┘
```

## Getting there

- **The sidebar.** The admin adds the link under Settings → Members →
  Sidebar with the address `/pnl`. The page does not put itself in the
  sidebar, because the member sidebar is the admin's list.
- **The bottom panel.** The Journal tab on every exchange screen has an
  Open P&L button at its right-hand end.

## The three panels

The dividers drag and are remembered per browser, like every other workspace
here. Double-clicking blank space in the right column shuts it; a tab on the
Journal's edge opens it again. On a narrow screen the three stack: grid,
cards, Journal.

### The Journal

The same rows the bottom panel draws (`TradesTable` in
`src/components/trade/positions-table.tsx`), so the two can never disagree on
a trade. The differences are only what this page has no way to do:

- **Every exchange and every wallet at once.** The bottom panel shows one
  exchange's rows; this one shows them all, practice rows badged Practice
  and testnet rows badged Testnet.
- **Read-only.** No tick boxes, no bin, and pressing a row does nothing.
  Removing a trade is done on the exchange screen, beside the chart it is
  drawn on.
- **A History incomplete row stays.** Fills the app cannot pair into a whole
  trade are listed, as they are in the bottom panel. This page does not ask
  the exchanges what is open right now, so such a row cannot say whether its
  position is still open; its info mark says so.
- **Show older** reads the next page of practice and real history together,
  and says "That is everything" when both are exhausted.

### The month grid

One tile per day. Green is money made, red is money lost, plain grey is a
day with no trades. Days before 20 August 2026, where the records begin,
and days still to come are drawn faint. Hover a tile, or tab to it, for the
dollars and the trade count. The arrows walk from the current month back to
August 2026 and no further.

- **A day runs midnight to midnight in Toronto**, the same clock the trading
  overview keeps. A fill at 00:30 UTC on the 2nd belongs to the 1st.
- **The dollars are the PnL Graph's fills, split by day.** The grid reads
  the same real fills the overview's Made or lost figure reads, priced the
  same way, so a month's tiles add up to the graph's figure for that month.
- **An unpriced fill is counted apart, never as zero.** On an exchange that
  only states a trade's money when the whole position closes, the sales
  before that carry no figure yet. The tile says "plus 11 fills the exchange
  has not priced" and the money shown is the priced part alone.
- **The trade count is finished trades that closed that day.**

### The cards and their period

One picker, shared by all three cards: This week, This month, Three months.

- **This week** starts at midnight Toronto on the most recent Monday.
- **This month** starts at midnight Toronto on the 1st.
- **Three months** starts on the 1st of the month two months back, so it is
  this calendar month and the two whole months before it.
- **Nothing starts before 20 August 2026.** Three months opened in September
  2026 begins on 20 August.

Only real money on a real network is in the cards: practice wallets and
testnet wallets are in the Journal and nowhere else, so pretend money never
lifts the score. A trade is in a period when it closed inside it.

The cards work from each trade's own money, the Journal's Made / lost
column: the exchange's figure less what it charged, summed over the trade's
fills. On an exchange that prices every sale that is the same money the grid
shows. On one that does not, the grid's unpriced fills and the cards' trade
money can differ for the same day, and both are right about what they say.

### Winning and losing patterns

Plain counts, no AI. Each card takes the period's trades that made money (or
lost it; a trade that broke even is in neither) and splits them five ways,
showing the top three groups of each, biggest dollars first, with the trade
count and the dollars:

| Grouping | Groups |
| --- | --- |
| By coin | one per coin |
| By hour of entry | the Toronto hour the trade was entered, "22:00 to 23:00" |
| Long or short | Longs, Shorts |
| With or without a stop | With a stop, No stop |
| Rules kept or overridden | Rules kept, Rules overridden |

Every grouping is built from the same trades, so all of a grouping's groups
add up to the card's total.

**With a stop** means the app saw a stop order sitting on the position while
the trade was open, or a stop is what ended it. The app only started writing
down the stops it sees when the wallet was added, so an older trade with no
record reads as No stop: none was seen. **Rules overridden** means the entry
went out against the person's own trading rules and they pressed anyway; it
is the same "Overrode:" note the Journal row carries.

### The AI score

A score out of 100 and three reasons in plain sentences, asked of a model
after the page is on screen so the Journal never waits for it.

- **What leaves the app.** One line per closed real-money trade in the
  period, newest first, at most 300: coin, long or short, entered and exited
  (Toronto time), in and out prices, size, dollars put in, made or lost,
  fees, stop on or off, rules kept or overridden, and how it ended. Nothing
  about the account, the wallet or the person goes with it. This does mean
  the trades go to a third party, the AI provider whose key is saved.
- **Which model.** The first text provider with a key under Settings → AI,
  in the order Anthropic, OpenAI, Gemini, on its fast cheap model:
  Claude Haiku 4.5, GPT-5 mini or Gemini 2.5 Flash. The card names the
  provider and model the words came from.
- **The meter.** Every call goes through `runAiCall`, so it appears on the
  AI usage dashboard under `pnl-score` and stops at the monthly allowance.
- **Remembered until a trade closes.** The answer is kept per period and
  per account in `trade_prefs.pnl_scores`, together with a digest of the
  ids of the trades it was built from. The next open of the same period
  with the same closed trades shows the kept answer and makes no call. A
  trade closing, or one being removed from the Journal, changes the digest
  and the next open asks again.
- **No key.** The card shows one plain line saying an admin adds a key
  under Settings → AI. Never an error.
- **No trades.** The card says nothing closed in the period.
- **The provider fails.** The card says which provider failed and why in a
  sentence, with a Try again button. The failure is on the usage dashboard
  as a failed row, the way every AI failure is.

## What it never does

It places no order and changes none. It exports nothing and compares no two
periods. Practice wallets are never in the score.

## Where the code is

- Route: `src/routes/_authenticated/pnl.tsx`.
- Screen: `src/components/pnl/`.
- The arithmetic, with its tests: `src/lib/trade/pnl/` (`periods`,
  `day-buckets`, `patterns`, `score`).
- Reads: `src/server/trade/pnl.ts`; the score and its memory:
  `src/server/trade/pnl-score.ts`; the doors: `src/lib/api/trade/pnl.ts`
  and `src/lib/api/trade/pnl-score.ts`.
