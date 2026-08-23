# When the chart asks for candles

The first chart request leaves on the next turn of the browser's event loop.
There is no earlier market choice to wait for, so a cold chart does not pay the
250 millisecond pause used for switching.

Every request after the first still waits 250 milliseconds. Picking several
markets or timeframes during that pause cancels the earlier timers, so only the
last choice reaches the exchange. Every answer keeps the market and timeframe
it was requested for. An answer from an older choice cannot draw over the chart
now on screen.

The zero millisecond first timer is deliberate. React checks an effect twice in
development. The timer lets the discarded check cancel before it sends a
duplicate request, while taking the old 250 millisecond wait off the real first
load.

Before this change, the first request used the same 250 millisecond constant as
every switch. The chart panel test now measures a 0 millisecond cold-load timer.
The same test changes market six times during the later 250 millisecond pause
and sees one request for the sixth market.
