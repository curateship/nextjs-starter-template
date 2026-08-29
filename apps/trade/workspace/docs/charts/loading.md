# When the chart asks for candles

The remembered market's first 4-hour candles arrive inside the dashboard's
opening answer. The chart paints those bars without making its own first server
call. Exchanges that load deeper history ask for it on the next turn of the
browser's event loop, after the first slice is already on screen. Lighter keeps
its 90-day slice and makes no automatic deeper request.

The timeframe is remembered in local storage, not on the server. A browser
left on another timeframe ignores the carried 4-hour candles and sends the
normal first request on the next event-loop turn. A direct market link that is
different from the account's remembered market does the same.

Every request after the first still waits 250 milliseconds. Picking several
markets or timeframes during that pause cancels the earlier timers, so only the
last choice reaches the exchange. Every answer keeps the market and timeframe
it was requested for. An answer from an older choice cannot draw over the chart
now on screen.

The zero millisecond timer is deliberate for both the deeper-history request
and a first request that could not ride the opening answer. React checks an
effect twice in development. The timer lets the discarded check cancel before
it sends a duplicate request.

The live-run page reads its coin list and its open coin chart separately. If a
coin is open while the automation is still looking, the chart may first answer
with no rungs. When the next run refresh changes that coin to `Rungs placed`,
the chart asks for the coin again and draws the new ladder. The status and chart
therefore change together without requiring a second click.

The chart panel test starts with carried 4-hour candles and sees one request,
the deeper-history chase, with no duplicate first slice. The same test still
changes market six times during the later 250 millisecond pause and sees one
request for the sixth market.
