# When the chart asks for candles

A chart loads in two requests. The first is the venue's own recent slice: the
last 30 days, capped at a thousand bars on the fast timeframes. The second is
the store's older rows behind it, from the market's history source.
`candle-store.md` explains the store and the sources; this file is about the
order things arrive in.

The remembered market's first 4-hour slice arrives inside the dashboard's
opening answer, in its exchange-facing half, which streams into the page after
the panels have painted. While that slice is on its way the chart shows its
loading state and sends nothing. The chart paints the streamed bars without
making its own first server call, then asks for the store's rows on the next
turn of the browser's event loop. The older rows go in behind the venue's bars
without a flicker: the newer bars are the same bars and the chart keeps its own
zoom. Where both have a bar, the venue's wins.

The timeframe is remembered in local storage, not on the server. A browser
left on another timeframe ignores the carried 4-hour candles and sends the
normal first request on the next event-loop turn. A direct market link that is
different from the account's remembered market does the same.

Every request after the first still waits 250 milliseconds. Picking several
markets or timeframes during that pause cancels the earlier timers, so only the
last choice reaches the exchange. Every answer keeps the market and timeframe
it was requested for. An answer from an older choice cannot draw over the chart
now on screen.

A refresh on a bar close asks the venue again and leaves the store alone once
older rows have been drawn for that market and timeframe. The older rows
cannot have changed, and the refresh job keeps the store itself current. The
new venue slice is stitched over what is already drawn. A store answer with no
rows is not remembered, so a market that gains a source later is asked again
on its next open.

If the source will not answer, the store answers with the rows it already
holds and marks the answer partial. Those rows are drawn, the header line says
the older bars were not all loaded and offers Try again, and the market is
asked again on its next open. A failure never overwrites bars already drawn.

The zero millisecond timer is deliberate for both the store request and a
first request that could not ride the opening answer. React checks an effect
twice in development. The timer lets the discarded check cancel before it
sends a duplicate request.

The live-run page reads its coin list and its open coin chart separately. If a
coin is open while the automation is still looking, the chart may first answer
with no rungs. When the next run refresh changes that coin to `Rungs placed`,
the chart asks for the coin again and draws the new ladder. The status and chart
therefore change together without requiring a second click.

The chart panel test starts with carried 4-hour candles and sees one request,
the store read, with no duplicate first slice. A second test hands the chart
the streaming marker first and the slice afterwards: no request leaves while
the marker is up, the streamed bars draw, and only the store read follows. A
third stitches store rows behind venue rows and reports "Binance" as the
source; a fourth fails the store read and checks the venue's bars stay on
screen. The market-change test still switches six times during the later 250
millisecond pause and sees one request for the sixth market.
