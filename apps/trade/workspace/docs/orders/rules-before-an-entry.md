# Rules before an entry

Tyler sets a short list of rules for himself in Settings, under Trading rules.
When he clicks Long, Short, DCA or Grid on a real-money wallet and a rule is
not met, one window opens. It names every rule that is not met, puts the
number he asked for beside the number he has, and asks him to confirm or go
back. It never stops the trade.

Tyler, 4 Sep 2026: "This is not to completely block me from trading, it just
gives me a warning and I have to confirm to enter the trade."

## The three rules

Each rule has a switch, a number where one makes sense, and which side it
applies to: longs, shorts, or both. Every rule starts off. The rules are per
account and the same on every exchange and coin.

- **Lines on the chart.** At least N lines above the price and N below it on
  this coin. A dropdown says what counts: trendlines only, levels only, or
  either. Above or below is read from the line's price right now, so a sloping
  trendline is read where it is today, not where it was drawn. A vertical line
  has no price and counts for neither side. A line exactly on the price also
  counts for neither, and the window says so: "1 line sits on the price".
  Drawings belong to a coin, not to a timeframe, so the rule is per coin too.
  Default 2.
- **Time on this chart.** At least N minutes since this coin was opened on this
  page. The clock starts when the coin changes and starts again on a reload, so
  a reload just before a short makes the rule fire. Leaving for another coin
  and coming back starts it again. Default 3 minutes.
- **Time since the last order.** At least N minutes since the last order Tyler
  placed by hand on this coin. The browser remembers the moment each entry is
  sent. After a reload it starts from the newest thing the chart can see for
  the coin: a fill, a finished trade, a resting order or a watched level. A
  first order on a coin never fires this rule. Default 5 minutes.

## What the screen does

- **Before the click.** The Long, Short, DCA and Grid windows do not show the
  rules. Their button stays enabled.
- **On the click.** The rules are checked before anything is sent or drawn.
  Nothing is met: the order goes out exactly as it did before. Something is
  unmet: one window opens, titled with the action and the size, "Short $12.00?",
  with one red panel inside it. The panel is headed "3 rules not met", and each
  rule under it has its name, an "Asked" line with the number asked for, and a
  red "Now" line with the number at the moment of the click. There is one
  window for every unmet rule, never one window per rule.
- **Go back** sends nothing and draws nothing. For a Long or Short the order
  window opens again on the size it just remembered. The DCA and grid windows
  were never closed, so they are simply back on top.
- **The other button** repeats the action and the size, so what is confirmed
  is the trade: "Short $500 anyway", "Long $500 in 7 rungs anyway", "Buy
  $500 in 5 levels anyway". Pressing it sends the order as normal.

A worked example. BTC is at $60,000. One trendline is drawn above it at
$62,000 and nothing below. The coin was opened 40 seconds ago. Short for $500
opens the window with:

```
Short $500?
  2 RULES NOT MET
  Lines on the chart
    Asked  2 above and 2 below.
    Now    You have 1 above and 0 below.
  Time on this chart
    Asked  3 minutes before a short.
    Now    You have been here 40 seconds.
[Go back]   [Short $500 anyway]
```

## What is recorded

A confirmed entry carries the names of the rules it broke. A Long or Short
writes them on the Journal row the exchange answer creates: "Overrode: lines on
the chart, time on this chart. Resting on the exchange." A DCA ladder or grid
writes its own row at placement, because the engine sends their orders later,
one pass at a time.

The Journal tab reads those rows back and shows "Overrode: lines on the
chart" under How it ended on the trade the entry became part of. The row is
written before the fill, so it belongs to the earliest trade on that wallet and
coin that had a fill at or after it was written. A confirmed entry that was
then cancelled without filling leaves its note on the next trade of that coin
instead. Saying it once too often is the safe side.

## What is never asked

- Closing, partial close, Turn around, Close all, Flatten, moving a stop or a
  target, and resuming a paused smart order. An exit is never slowed.
- Anything the engine places on its own: bots, running flows and the rungs and
  levels of a smart order already placed.
- A practice wallet. It never warns and never records.

There is no "don't ask again" box. A rule is on or off in Settings, nowhere
else.

There is no "a stop loss is set" rule. One existed for a few hours on 4 Sep
2026 and Tyler had it removed: "How can I have a stoploss if I didn't even
place an order." A saved row from those hours still reads; the extra key is
ignored.

## Where it lives

- `src/lib/trade/trading-rules.ts` holds the saved shape, the defaults, the
  check itself and the words of every sentence. `trading-rules.test.ts` sits
  beside it.
- `trade_prefs.trading_rules` is the column, added by migration 0162. Never
  rename a field once saved.
- The rules arrive with the dashboard's opening answer and with the Settings
  tab's own loader, so neither screen flashes from the defaults.
- `src/components/trade/chart-panel.tsx` runs the check in the three place
  handlers and owns the one warning window. That window shows the red panel
  from `src/components/trade/unmet-rules-panel.tsx`.
- `src/components/trade/trading-rules-settings.tsx` is the Settings tab: one
  card per rule, the switch in the card's header, the number and choices in
  one short row under it. Rules save as they change, half a second after the
  last edit, with no save button.
