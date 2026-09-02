# The rules shared by exchange connectors

Each exchange keeps the code that understands its own addresses, subscription
messages and replies. The repeated connection and order rules live in shared
helpers. A new exchange supplies its differences instead of copying another
exchange's whole file.

## Prices, sizes and held answers

An outgoing price or size must be a finite number at zero or above. A negative
price answers `LIVE_PRICE`, and a negative size answers `LIVE_SIZE`, before the
connector opens the wallet credential or makes an exchange request. Decimal
text has no grouping, never uses scientific notation and keeps at most 12
places after the decimal.

The same entrance check covers an entry's stop and target. A complete stop and
target replacement is checked before any account setting changes and before an
old protection order can be cancelled. An invalid replacement therefore leaves
the existing orders alone.

Phemex's signed leverage is the deliberate exception. Phemex uses a negative
leverage number to mean cross margin, so that one call allows the negative sign
out loud. The exception does not apply to an order's price or size. Lighter
sends whole scaled numbers instead of decimal text, but its order entrance uses
the same negative price and size check.

A shared promise may stand in for a repeated exchange read. A refused promise
comes out of the map at once. An older refusal cannot remove a newer request for
the same key. Phemex and KuCoin may keep an older orders or fills answer only
while their private line says the account stayed quiet, and never beyond the
existing two-minute ceiling.

## Public price and candle lines

The browser connection helper owns one line per exchange network. Each exchange
supplies the address, subscription messages and reply reader. The helper owns
reconnect waits, stale-data checks, listener sharing, tab visibility and
shutdown.

The last listener starts a five-second shutdown wait on every exchange. A new
listener inside those five seconds keeps the same connection. The delay covers
a chart or tab handing its listener to the next screen without paying for a
disconnect and reconnect. A hidden browser tab closes its public connections.
The lines reconnect when the tab becomes visible and tell the chart to catch up
after a gap.

Each exchange keeps its measured stale-data limit. Hyperliquid waits 8 seconds,
Aster, Lighter and Phemex wait 12 seconds, and KuCoin waits 90 seconds because a
quiet candle channel is normal there. Every reconnect uses the same capped wait
from `reconnectDelay`.

## Private order lines

Phemex and KuCoin share one private-line manager. The exchange files still own
signing, ticket requests, heartbeat messages and the words that mean an order
changed. The manager owns one line per network and API key, reconnect waits,
idle cleanup and the rule for when silence can be trusted.

Both private lines stop vouching after 30 seconds without any message. Phemex
pings every 5 seconds and KuCoin normally pings about every 12 seconds, so 30
seconds allows two missed heartbeat windows before Trade falls back to the REST
read. A line that disconnected, never acknowledged its subscription or started
watching after the requested time never vouches for that time. A line nobody
has asked about for 10 minutes closes.

## How to prove the helpers

The focused checks are the connector helper test, the five order test files,
the public socket helper and stream tests, and both private-feed tests. The
cross-exchange order-value test sends a negative price and size through every
connector entrance and expects the same refusal codes.

For a live check, open one chart on each exchange and leave it moving for a few
minutes. Switch away and back inside five seconds. The browser should keep one
connection. Stay away longer than five seconds and the old connection should
close. Disconnect the browser network once, restore it and confirm the working
candle catches up. Phemex and KuCoin also need a wallet read before and after a
private-line reconnect. The first read after the gap must ask the exchange.
