# Hyperliquid refusals

Hyperliquid sends refusal sentences rather than fixed codes. Trade matches the
parts that state the reason and replaces exchange wording with a sentence that
says what to change. The known reasons cover the $10 minimum, insufficient
cash, a post-only order that would trade immediately, a reduce-only order that
would add to a position, an order that is already gone and a request limit.

An unknown refusal keeps Hyperliquid's own scrubbed words after a sentence that
says Trade does not recognize the reason. The app never turns an unknown real
money refusal into the generic retry message.

The list came from refused Journal rows in the 30 days ending 24 August 2026.
The same Journal rows showed the $10 minimum 303 times, insufficient cash 10
times, request limits 9 times, an already-gone order twice and one post-only
crossing.

Trade carries Hyperliquid's venue-wide $10 minimum in every market row even
though Hyperliquid's market metadata does not repeat it. Plain and watched
orders can therefore refuse an undersized order before signing or saving it.
The check uses the coin size after rounding. If a $10 request becomes five
whole coins worth $8.75, Trade reports $8.75 and says how much the first valid
whole-coin order costs.

Trade sends prices and coin sizes as the shortest plain decimal that represents
the rounded value. Scientific notation is expanded, but the formatter never
pads an ordinary decimal to a fixed number of places. Padding through JavaScript
floating-point arithmetic once turned an STX size of `12724.7` into
`12724.700000000001`. Hyperliquid could not read that as a one-decimal STX size
and returned HTTP 422 before considering the order.
