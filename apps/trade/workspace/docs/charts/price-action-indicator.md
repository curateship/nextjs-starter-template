# The price action indicator

Price action marks candle patterns. A pattern is a rule about the shape of one,
two or three candles in a row, and each of the eighteen patterns has its own
switch. When a switched-on pattern finishes, a teal arrow prints under the
candle for a buy, or a red arrow prints over it for a sell.

The code is `src/lib/trade/indicators/price-action.ts`.

## Reading a candle

Every pattern below uses the same few words.

- **Up candle.** It closed higher than it opened.
- **Down candle.** It closed lower than it opened.
- **Body.** The part between the open and the close.
- **Wick.** The thin line above or below the body. It shows how far price went
  before coming back.
- **Height.** The whole candle, from the lowest wick to the highest.
- **Middle.** Halfway between a candle's open and its close.

A worked example. BTC falls for four candles in a row. The next candle opens at
$100,000, drops to $98,000 and closes at $99,800. Its body is $200 and its lower
wick is $1,800, nine times the body. It has no upper wick. That candle is a
hammer, so a teal buy arrow prints under it at $98,000. The buy signal goes to
automation on that same candle, which closed at $99,800.

## The nine buy patterns

1. **Bullish engulfing.** A down candle, then an up candle whose body covers
   the whole of the down candle's body and closes above the down candle's
   highest wick.
2. **Hammer.** A small body at the top of the candle, a long wick below it and
   almost no wick above it. Price was pushed down and bought back up.
3. **Morning star.** Three candles. A down candle, then a small candle that
   sits at or below the first one's close, then an up candle that closes above
   the first one's middle.
4. **Piercing pattern.** A down candle, then an up candle that opens at or
   below its close and closes above its middle, but not above its open. It
   wins back more than half of the fall without all of it.
5. **Marubozu.** An up candle with almost no wicks, so it opened near its low
   and closed near its high.
6. **Three white soldiers.** Three up candles in a row, each closing higher
   than the last, and none of them small.
7. **Bullish harami.** A large down candle, then a small up candle whose body
   sits inside the first candle's body.
8. **Inverted hammer.** A small body at the bottom of the candle, a long wick
   above it and almost no wick below it.
9. **Tweezer bottom.** A down candle, then an up candle, both reaching the same
   low.

## The nine sell patterns

Each one is a buy pattern turned upside down.

1. **Bearish engulfing.** An up candle, then a down candle whose body covers the
   whole of the up candle's body and closes below the up candle's lowest wick.
2. **Shooting star.** A small body at the bottom, a long wick above it and
   almost no wick below it. Price was pushed up and sold back down.
3. **Evening star.** An up candle, then a small candle that sits at or above the
   first one's close, then a down candle that closes below the first one's
   middle.
4. **Dark cloud cover.** An up candle, then a down candle that opens at or above
   its close and closes below its middle, but not below its open.
5. **Bearish marubozu.** A down candle with almost no wicks.
6. **Three black crows.** Three down candles in a row, each closing lower than
   the last, and none of them small.
7. **Bearish harami.** A large up candle, then a small down candle whose body
   sits inside the first candle's body.
8. **Hanging man.** A small body at the top, a long wick below it and almost no
   wick above it.
9. **Tweezer top.** An up candle, then a down candle, both reaching the same
   high.

**Two pairs are the same shape.** A hammer and a hanging man look identical. So
do an inverted hammer and a shooting star. The only difference is which way
price was going before the candle, and that is the Trend before setting below.

## The trend before a pattern

Most of these patterns are reversals: they say a move is ending. A reversal
only counts after a move the other way.

- **A buy pattern needs falling closes before it.** With Trend before at 3, the
  three candles before the pattern's first candle must each close lower than
  the candle before them.
- **A sell pattern needs rising closes before it**, by the same count.
- **The pattern's own candles are not part of the count.** The trend is the
  move into the pattern.
- **Three patterns skip the check.** Marubozu, three white soldiers and three
  black crows say a move is strong, not that it is ending, so they print
  whatever came before.
- **Trend before at 0 switches the check off.** A hammer-shaped candle then
  prints both a hammer and a hanging man if both are switched on.

## Touching counts as a gap

Crypto trades all day and night, so each candle opens at the exact price the
last one closed. The textbook engulfing, piercing and star rules want a gap
between candles, and read strictly they would almost never print on a coin.

- **Opening at the last close counts as opening below it** for engulfing and
  piercing, and as opening above it for their sell twins.
- **A star's small body may sit at the first candle's close**, not only past it.
- **A harami's small body may touch the edge of the big body.**
- Tyler chose this on 23 Sep 2026. A stock that really does gap still passes.

## Engulfing closes past the wick

The textbook engulfing only asks the second body to cover the first body. The
wicks can stick out. On 23 Sep 2026 that printed a sell on a pair Tyler did not
recognise as one: a tiny green body with a long wick below it, then a red body
only a little bigger that stopped far above that wick.

- **Tyler picked the far-wick half of the textbook's ideal version.** The
  second candle must also close past the first candle's far wick: below its
  low for a bearish engulfing, above its high for a bullish one.
- **The near wick is left alone.** A coin's second candle opens where the first
  one closed, so it could almost never cover the wick on that side. Asking for
  both wicks kept 7 of 109 engulfings on 50 days of BTC 15 minute candles.
- **Asking for the far wick kept 70 of 109** on the same candles, and dropped
  the weak ones like the pair above.

## What the number settings mean

"Small" and "long" have to be numbers somewhere. These are those numbers, and
every pattern reads the same ones.

- **Small body.** A body is small when it is this many out of 100 of the
  candle's height or less. Anything bigger is large. Default 30, so a $1,000
  tall candle has a small body at $300 or less.
- **Long wick.** A wick is long when it is at least this many times the body.
  Default 2, so a $200 body needs a $400 wick.
- **No wick.** A wick counts as almost nothing when it is this many out of 100
  of the candle's height or less. Default 5, so a $1,000 tall candle may have a
  $50 wick and still count. Marubozu and the "almost no wick" side of the
  hammer shapes both use it.
- **Equal to.** Two lows or two highs are the same when they are this many
  tenths of a percent apart or less. Default 1. At $100,000 that is $100.
- **Trend before.** How many falling or rising candles must come before a
  reversal. Default 3.

"Small" and "large" always mean small or large for that candle's own height. A
harami's second candle therefore needs a small body AND wicks, not only a body
smaller than the first one's. Raise Small body if too few haramis and stars
print.

## What gets drawn

- **One arrow per pattern, on the pattern's last candle.** A buy arrow sits at
  the lowest low of the pattern's candles. A sell arrow sits at the highest
  high.
- **A box over patterns longer than one candle**, from the first candle to the
  last, as tall as their highest high and lowest low. The box is the same
  violet the opening range box uses.
- **Two patterns finishing on one candle draw two arrows** and send two
  signals. Nothing is merged. Two buy patterns that cover the same candles put
  their arrows at the same low, so they sit on top of each other and look like
  one.
- **A buy and a sell on one candle means the sell wins in automation.** The
  Signals step and signals backtests act only on the newest call, and the sell
  is listed after the buy. This is rare unless Trend before is 0, where a
  hammer-shaped candle is both a hammer and a hanging man.
- **Show arrows** under Signals hides the arrows and boxes. The signals keep
  going to automation.

## Where it is

- **On the chart:** open the Indicators menu above the chart and switch on
  **Price action**. Its settings window has four cards: Buy patterns, Sell
  patterns, What counts and Signals.
- **Starting switches:** only bullish engulfing and bearish engulfing are on.
  All eighteen at once would cover the chart in arrows.
- **In automation:** the Signals step lists Price action beside Base and EMA. An
  up arrow buys and a down arrow sells the whole position. A newly added
  Signals step starts with every indicator that can trade switched on, this one
  included. A step saved before this indicator existed keeps it off.
- **In backtests:** a signals backtest reads the same patterns. It loads the
  Trend before count plus three extra candles from before the window, so a
  pattern on the window's first candle can still see its trend.
- **Arrow and trade always name the same candle.** Both come out of one pass
  over the candles, and a test checks that.

## What is not there yet

- **The arrow does not say which pattern printed it.** With several switched
  on, switch them on one at a time to find out.
- **No colour settings.** Arrows use the chart's standard teal and red, the
  same as Base.
- **No volume check.** A pattern on a quiet candle counts the same as one on a
  busy candle.
- **"Large" is not compared with nearby candles.** A large body is large for
  its own candle, not larger than the candles around it.
- **Overlapping patterns all print.** Four up candles in a row give two three
  white soldiers arrows, one on the third candle and one on the fourth.
- **The candle still forming is never read**, the same as every indicator. A
  pattern prints once its last candle closes.
