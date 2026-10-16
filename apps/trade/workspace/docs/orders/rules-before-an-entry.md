# Rules before an entry

Tyler builds his own rules in Settings, under Trading rules. Each rule is a
stack of conditions, the way a contact segment is built in CMS, plus his own
bullet-point notes that he ticks on the chart before an entry. Each condition
is something that must hold before he trades. When he places a real-money
Long, Short, DCA ladder or grid and a rule's conditions do not hold, the rule
either warns him and lets him confirm, or blocks the entry. The
Rules box in the left panel shows the same rules and the notes to tick before he
presses anything, and warns when a trade he already holds starts breaking one.

Tyler, 4 Sep 2026: "This is not to completely block me from trading, it just
gives me a warning and I have to confirm to enter the trade." That is Warn.

Tyler, 15 Oct 2026: "the flow rule would be like timeframe 1 week > ema 50 >
trade grid 5 > trigger modal alert", and "if I enter a trade that does not
fit the currant rule, it would block me". He chose a table of rules with
stacked conditions over a node canvas, and chose Warn or Block per rule.

## A rule

Settings, Trading rules is a table. Each row is one rule, with its name, its
conditions as one sentence, what it covers, Warns or Blocks, and a switch.
New rule adds one and opens it. The row's buttons copy it (the copy starts
switched off, so one condition never warns twice), open it, or delete it.
Everything saves 700ms after the last change, with no Save button.

A rule's window has:

- **Name.** Shown in the window and on the Journal row. 1 to 40 letters, with
  no comma or full stop, because the Journal lists rule names after commas. A
  name that does not fit stays in the box, marked, and the rule keeps its last
  good name.
- **Switched on.**
- **When I place.** A long or short order, a DCA ladder, a grid. Tick any. A
  rule with nothing ticked never checks anything.
- **Which way.** Longs and shorts, longs only, or shorts only. A DCA ladder is
  always a long. A grid counts by the way it trades.
- **When it is not met.** Warn me and let me confirm, or block the trade.
- **Conditions.** "Add a condition" stacks a card under the last one, up to 20.
  "Fine to trade when" is All of these are true, or Any of these is true. With
  All, one condition that does not hold breaks the rule; with Any, one that
  holds is enough. Each card has a bin. There are no groups inside groups.

A condition is something that must hold before Tyler trades. A rule with no
conditions never warns or blocks, but its notes are still asked for. Tyler, 15
Oct 2026, shown a tick beside "At least 5 grids in this wallet" with 18
running: "this should be an x", and "It should be max 5 grid running". A
condition that holds gets a green tick, one that does not gets a red cross.

- **Notes to tick.** "Add a note" adds a bullet point, up to 10, each up to
  200 letters. A Block rule's notes must all be ticked on the chart before an
  entry that rule covers can go out, whatever its conditions say. A Warn
  rule's notes are asked for the same way, but the entry can go past them
  "anyway", like a broken Warn condition. A blank note asks for nothing. A
  rule with only notes is a checklist.
- **Notes reorder by dragging the grip** at the left of each note (Tyler,
  15 Oct 2026: "I want to drag and drop the notes to reorder it"). Only the
  grip drags, because the rest of the row is a box to type in. Space on the
  grip picks the note up for the keyboard, and the arrows move it. The order
  is the order of the boxes in the Rules box and the window before an entry.

Tyler, 15 Oct 2026: "Note on each rule and also make it a checkbox on the
trading chart that I must check off before I can place a trade".

## The conditions

- **EMA.** Price is above or under EMA N on a timeframe, from 1 minute to 1
  month. It reads the price now, the last closed candle's close, or the whole
  last closed candle (its high under the line, or its low above it). The EMA is
  built from closed candles only, with the same `ema()` the chart draws. A week
  and a month are built from day bars, the way the chart builds them
  (`chart-history.ts` `groupCandles`). The chart reads three times N candles so
  the average has settled, and a coin with fewer than N closed candles says
  so: "EMA 50 needs 50 closed weekly candles. This coin has 30."
- **Price and a line.** Price is within X% of the nearest line, or above,
  under or within X% of a line by its name. A name is matched on whichever
  coin is open, so one rule can mean "Weekly support" on BTC and on ETH. A
  trendline is read where it is today.
- **Grids on this exchange.** At most N real-money grids running on this
  exchange, every wallet on it. Before an entry the new grid is counted, so
  with N at 5 and 5 running, a sixth breaks it.
- **Grids in this wallet.** At most N grids running in the wallet the order
  goes to.
- **Grids on this coin.** At most N real-money grids running on this coin.
- **Open positions on this exchange.** At most N real-money positions open.
- **Lines on the chart.** At least N lines above the price and N below it.
  Trendlines, levels or either. A line exactly on the price counts for neither
  side, and a vertical line has no price.
- **Time on this chart.** At least N minutes since this coin was opened on
  this page. Changing coin or reloading starts the clock again.
- **Time since the last order.** At least N minutes since the last order
  placed by hand on this coin. A first order on a coin always holds.

The counts are what the page has loaded for this exchange, the same as the
grid count always was.

## Before an entry

The check runs when Long, Short, DCA or Grid is pressed on a real-money
wallet, before anything is sent or drawn. A rule is broken when it is
switched on, covers what is being placed, and its conditions do not hold (one
of them fails, with All; none holds, with Any).

- **Nothing is broken and every note is ticked.** The order goes out as it
  always did.
- **A note is not ticked.** The window lists the covering rules' notes as
  boxes, the same boxes as on the chart.
  - A Block rule's note holds the entry. The window says "Tick every note of
    a blocking rule before this goes out", and the send button appears once
    every one of those is ticked.
  - A Warn rule's note never holds it. The window says "you can still go
    ahead", and "Long $500 anyway" sends it. The Journal row names the rule,
    "Overrode: Main Grid rule", the same as for a broken condition.
  - Until 15 Oct 2026 every note held the entry, whatever the rule was set to.
    Tyler: "the trading rule modal warn me but dont let me ignore it".
- **A Warn rule is broken.** One window, titled with the action and the size,
  "Short $500?", holds a red panel headed "1 rule not met". Each rule shows
  its name, then every condition as a line with no prices: a green tick when
  it holds, a red cross when it does not. Go back sends nothing. "Short $500
  anyway" sends it.
- **A Block rule is broken.** The same window and panel, headed "Blocked by" the
  rule's name, with only Go back. Changing that is a choice made in Settings,
  not in the moment.
- **A condition cannot tell yet.** Candles still loading, a named line not on
  this coin, or a condition saved by a different version of Trade. The rule
  shows "Can't tell yet" in grey and warns. A Block rule never blocks on a
  condition it cannot read.

Go back on a Long or Short reopens the order window on the size it just
remembered. The DCA and grid windows were never closed.

A worked example, Tyler's own rule:

```
Weekly trend guard                                  on
When I place   A grid
Fine to trade when   All of these are true
  EMA                     Price is above EMA 50 on 1 week
  Grids on this exchange  At most 5 real-money grids running on this exchange
When it is not met   Block the trade
```

BTC is at $60,000 and its 50-week EMA is at $64,000. Four grids are running on
Hyperliquid, so this grid makes five. Grid for $500 opens:

```
Buy $500 in 5 levels?
  BLOCKED BY WEEKLY TREND GUARD
  Weekly trend guard                         Blocks
    ✗ EMA 50 on 1 week timeframe is above
    ✓ At most 5 grids on this exchange
[Go back]
```

With BTC at $70,000, both hold and the grid goes out with no window. With
five grids already running, the sixth breaks the limit too. Set to Any, one
condition holding would be enough.

## The Rules box

The Rules box fills the dashboard's left panel, laid out the way Tyler drew
it on 15 Oct 2026. Tyler moved it there from the chart's top left the same
day, into the space the market scanner left when it became a button in the
chart header.

- **With nothing to check, the left panel still shows the box** and says why:
  "No trading rules are switched on", or "Rules only check trades in a
  real-money wallet" on a practice wallet.
- **With the left panel shut, the box is not shown at all** (Tyler, 15 Oct
  2026: "dont need to see this when collapsed"). It used to float over the
  chart's top left. The window before an entry still checks every rule, so a
  block still stops the order.
- **Below the wide-screen line** the left panel is a sheet pulled out from the
  side. The box shows in that sheet while it is out, and nowhere while it is
  away.

```
Rules            [Main Grid rule  v]  (cog)
-------------------------------------------------
Main Grid rule     [1 warning] [1 to tick] 2 rules
1 other rule also needs a look.
  ! Your PUMP grid on HL1 - GRID
      ✗ At most 5 grids in this wallet
      ✓ EMA 50 on 1 week timeframe is above
  TICK BEFORE YOU TRADE
  [ ] Must be 2 stocks and 2 trendy ALT and BTC
```

- **The box shows one switched-on rule at a time** (Tyler, 15 Oct 2026: "move
  this to the panel body and replace it with a cog to edit currant rule and a
  rule switcher to swith to a different rule").
- **The header** holds the rule switcher and a cog. There is no fold arrow
  (Tyler, 15 Oct 2026: "remove the toggle"), so the body always shows. The
  switcher lists every switched-on rule, and this browser remembers the last
  one picked. The cog opens the same rule window as Settings, Trading rules,
  saving as it changes. The box and the check before an entry use the edit at
  once.
- **The counts sit in the body**, as chips on the rule's name row just before
  how many conditions it has (Tyler, 15 Oct 2026: "move the 2 chip before the
  rules"). They count the rule on screen: Blocking
  (red) when it would stop an entry placed now, warnings (amber) for an entry
  that breaks it and for each held trade that breaks it, Can't tell yet, and
  notes still to tick. With nothing to count it says All clear.
- **Other rules are never hidden silently.** When another switched-on rule
  would block, warn, cannot tell or has notes to tick, a line under the counts
  says how many, so he can pick it from the switcher. The window before an
  entry still checks every rule, whichever one the box shows.
- **An amber card per held trade that breaks the rule.** A real-money trade
  already held on the coin, a running grid, a running DCA ladder or a
  position that belongs to neither, is checked against the rules that cover
  that kind of entry. The card names the coin and the wallet in bold and
  lists the rule's conditions, failed ones first. It only warns. An entry
  that already happened cannot be undone, and nothing here closes or cancels
  anything. For a held trade the count includes the trade itself once, so a
  fifth grid under "at most 5" is the limit reached, not passed. The
  conditions about preparing an entry (lines on the chart, time on this
  chart, time since the last order) are skipped for held trades.
- **Tick before you trade** lists the rule's notes as boxes. An entry only
  waits for the notes of Block rules that cover it. Ticks belong to the coin on
  screen. Placing an order on the coin clears them, so the next entry asks
  again, and a reload starts with none.
- Each condition line has a green tick when it holds, a
  red cross when it does not, and a question mark with the reason when it
  cannot tell, with no prices: Tyler, 15 Oct 2026, "there is too much text and
  i dont care about the price".

It follows the price as it moves and the clock every second.

The box remembers whether it is open only while the page is open.

The EMA conditions read their candles once per coin and timeframe, and again
when that timeframe's candle closes, so a weekly EMA asks the exchange once a
week per coin on screen. A week needs the store's older day bars. On a stock
whose older history is still being filled, the weekly EMA can sit at "still
loading" until the store answers.

## What is recorded

A confirmed Warn entry carries the names of the rules it went against. A Long
or Short writes them on the Journal row the exchange answer creates:
"Overrode: Weekly trend guard. Resting on the exchange." A DCA ladder or grid
writes its own row at placement, because the engine sends their orders later.

The Journal tab reads those rows back and shows "Overrode: Weekly trend guard"
under How it ended on the trade the entry became part of: the earliest trade
on that wallet and coin with a fill at or after the row. A confirmed entry
that was cancelled without filling leaves its note on the next trade of that
coin instead. Saying it once too often is the safe side. Rows written before
15 Oct 2026 carry the old names, such as "lines on the chart", and still read.

A blocked entry records nothing, because nothing was sent. Ticked notes are
not recorded.

## What is never asked

- Closing, partial close, Turn around, Close all, Flatten, moving a stop or a
  target, and resuming a paused smart order. An exit is never slowed or
  blocked.
- Anything the engine places on its own: bots, running recipes, and the rungs
  and levels of a smart order already placed.
- A practice wallet. It never warns, never blocks and never records, and the
  Rules box only says that rules check real-money wallets.
- An order placed on the exchange's own site. It never passes through Trade.

There is no "don't ask again" box. A rule is on or off in Settings.

## Rules saved before 15 Oct 2026

`trade_prefs.trading_rules` used to hold four fixed rules. A row still in
that shape is read as one Warn rule for each one that was switched on, with
the same numbers: Lines on the chart, Time on this chart and Time since the
last order cover every entry on their old side; Grids on one exchange covers
grids only, as "At most N real-money grids running on this exchange", which is
exactly what it was. The
first save writes the new shape, `{ list: [...] }`. No migration: the column
is the same jsonb.

**Until this is deployed,** the deployed site reads a saved list as all four
old rules switched off, and saving rules on the deployed site writes the old
shape over the list. Build rules here after the deploy, not before.

## Where it lives

- `src/lib/trade/trading-rules.ts` holds the saved shape, reading old rows,
  the words for each condition, the check (`judgeRule`, `checkTradingRules`)
  and the Journal note. `trading-rules.test.ts` sits beside it.
- `src/components/trade/trading-rules-settings.tsx` is the table and the
  rule's window. `trading-rule-builder.tsx` is the stacked conditions, a
  Trade-owned copy of the anatomy of the shell's `segment-rule-builder.tsx`.
  `use-trading-rules.ts` keeps the list and saves it.
- `src/components/trade/chart-panel.tsx` gathers what the conditions read
  (`ruleFacts`), runs the check in the three place handlers, and owns the Warn
  and Block windows. `unmet-rules-panel.tsx` is the red panel.
  `rules-watch-panel.tsx` is the Rules box. `use-rule-candles.ts` reads the EMA
  candles. `last-order-memory.ts` remembers the last order per coin.
- `entry-rules-window.tsx` is the window before an entry: Block, notes to
  tick, and Warn. `rule-note-checklist.tsx` draws the boxes, and
  `note-ticks.ts` remembers the ticks per coin. Rules saved before notes
  existed read with none.
