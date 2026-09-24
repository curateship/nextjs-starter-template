# edgeX's refusals in plain words

Every way edgeX says no becomes one sentence that says what to do next. The
code is `src/server/protocols/edgex/refusals.ts`.

## Why edgeX's own words are never shown

edgeX answers a refusal with a word code, such as `INVALID_API_KEY`, and a
`msg`, on an HTTP 4xx or on an ordinary 200. Measured on 24 Sep 2026 with a
made-up key: the answer was `"msg":"invalid apiKey : nope"` and
`"errorParam":{"apiKey":"nope"}`, quoting the key back. So the app reads only
the code. The message and its parameters are never read, logged or shown.

## Which codes are known

edgeX publishes no list of its codes. Four were seen in real answers or in
edgeX's own SDK: `INVALID_API_KEY` (HTTP 401), `GATEWAY_HEADER_REQUIRED` and
`GATEWAY_PARAM_INVALID` (HTTP 400), `INVALID_GET_PAGE_SIZE`, and
`ACCOUNT_UPDATE_LEVERAGE_FAILED_ORDER` from the SDK's tests. The rest are
matched by the words edgeX's codes are made of (TIMESTAMP, SIGNATURE,
PASSPHRASE, NOT_FOUND and so on). As real refusals arrive from Tyler's
account, their codes go into `edgex.fixture.json` and this table.

## The sentences

| edgeX says | Trade says |
| --- | --- |
| `INVALID_API_KEY` | edgeX did not accept this API key. Copy the API key again from API Management → Perps V2 → SDK Signer on edgeX. |
| A request signature refused | edgeX did not accept the request's signature. The API key was right, so check the secret and the passphrase. |
| A passphrase refused | edgeX did not accept the passphrase. Type the passphrase you chose when you made this API key on edgeX. |
| A timestamp refused twice | edgeX refused the request's time. Trade re-read edgeX's clock and sent it once more, and edgeX refused that too. |
| An order's own signature refused | edgeX refused the order's own signature. This usually means the signer key does not belong to this account. Trade signs it once more first. |
| HTTP 429 | edgeX — asked Trade to slow down once, asking again in 5 seconds (then 10, 20, 40, 60, with the count). |
| A minute Trade counts itself is full | edgeX — spent 24 of 24 requests this minute, room again in 30 seconds. |
| Not enough collateral | edgeX says the account has $12.40 free and this order needs $25.00. |
| Order not found | edgeX says this order is not open any more. It may have filled or been cancelled on edgeX itself. |
| Below the smallest size | edgeX's smallest order on this market is about $84.40 at today's price. |
| A trigger on the wrong side | edgeX refused the trigger price because it sits on the wrong side of the price, where it would fire at once. |
| A stock market closed | SAMSUNG's market on edgeX is closed right now, because the stock exchange it follows is shut. edgeX does not say when it reopens. |
| `ACCOUNT_UPDATE_LEVERAGE_FAILED_ORDER` | edgeX will not change the leverage on this market while it has open orders. |
| An account id the key does not own | edgeX does not know this account id with this key. |
| A refused value (`GATEWAY_PARAM_INVALID`) | edgeX refused a value in the request. Refresh the market list and the account, then try again. |
| HTTP 5xx | edgeX had a problem on its own side and did not finish the request. |
| Anything else | edgeX refused it and said nothing Trade can put in words. Check the order and the account on edgeX's own site before trying again. |

An unknown code is thrown away along with the message. Tested with a made-up
code carrying secret-looking text: neither the code nor the text reached the
sentence.

## Refused before anything is sent

- An order below the smallest size, in dollars.
- An order on a stock market the price feed says is closed.
- A leverage above the market's ceiling.
- A stop or target on the wrong side of the price.
- An order while either real-money switch is off.
- An order on an account edgeX says is being liquidated.

## How each one reaches the screen

Every refusal travels as `LIVE_ORDER_REFUSED:` or `LIVE_EXCHANGE:` with its
sentence, or `EXCHANGE_BUSY:` for rationing, the shapes the order form and
the Journal already print. A refusal while signing in becomes
`KEY_NOT_APPROVED:` with the same sentence, which the Add wallet window shows.
