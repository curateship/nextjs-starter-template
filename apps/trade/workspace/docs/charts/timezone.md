# The chart's timezone

The chart is on one clock, and everything that says a time reads it: the time
axis under the candles, the label the crosshair drags along that axis, and where
a trading session starts.

## Where it is set

The eye beside the Indicators menu — the **View options** dropdown — has a
**Timezone** picker under the show-and-hide boxes, and the choice lands as soon
as it is picked. Nine zones: UTC, New York, Chicago,
London, Frankfurt, Dubai, Hong Kong, Tokyo, Sydney. UTC to begin with.

The choice is saved against the account, not the browser, so the chart opens on
the same clock wherever you sign in. It rides in the same `chart_options` blob
as the show-and-hide boxes, so it needed no new column and no migration.

## Why it is stored as a place and not as an offset

New York opens at 09:30 New York time every day of the year. Against UTC that
is 13:30 in summer and 14:30 in winter, because the clocks move twice a year and
UTC's do not.

So a session written down as "13:30 UTC" is the New York open for about half the
year and an hour early for the other half — and the half it is wrong for is not
marked in any way, so nothing looks broken. Storing the place instead means the
offset is worked out per day, from the browser's own clock tables, and a summer
date and a winter date come out shifted by different amounts. That is what
`src/lib/trade/chart-timezone.test.ts` checks, and it is the test that matters.

## What does not change

- **Nothing stored changes shape.** Every candle time, order time and journal
  entry is still epoch milliseconds. A timezone is a way of reading them.
- **Nothing outside the chart moves.** The Journal, the order tables and the
  flow dashboards keep the one date format the rest of the app uses.
- **A saved zone this build no longer offers falls back to UTC** rather than
  throwing. A chart on the wrong clock is a bug; a chart that will not draw is a
  broken app.

## What reads it

- The axis labels and the crosshair label, through
  `src/components/trade/price-chart.tsx`.
- Every indicator, handed in as `context.zone` — see
  `opening-range-indicator.md`. An indicator carrying a timezone of its own
  could draw a box at 09:30 New York on an axis labelled in UTC, and there would
  be no way to tell which half of that picture was wrong.

The backtest chart and the flow-run chart are read against UTC on purpose. A
saved run is looked at long after it finished and by whoever opens it, so
drawing it against whatever the live chart happens to be set to would make one
run look like two.
