# ApeX Omni's refusals in plain words

Every way ApeX Omni says no becomes one sentence that says what to do next.
The code is `src/server/protocols/apex/refusals.ts`.

## Why ApeX's own words are never shown

ApeX refuses on an ordinary HTTP 200, with a numeric `code` and a `msg`
inside. Measured on 24 Sep 2026 with made-up values: a bad API key answered
code 10002 with a message that quoted the key back,
`"Api credential is invalid [apiKey=…]!"`. So ApeX's message never leaves the
`apex/` folder. It is read only to find ApeX's own error key, such as
`ORDER_NOT_FOUND`, which its docs list and which carries no account data.

## The sentences

| ApeX says | Trade says |
| --- | --- |
| 20002, a refused timestamp | ApeX Omni refused the request's time. Trade re-read ApeX's clock and sent it once more, and ApeX refused that too. Check that this server's clock is set automatically. |
| 10002, a bad key, secret or passphrase | ApeX Omni did not accept these API values. Copy the API key, secret and passphrase again; a wrong secret or passphrase is refused the same way as a wrong key. |
| `INVALID_L2_SIGNATURE` | ApeX Omni refused the order's signature. Trade signs every order afresh, so this usually means the omni key does not belong to this account. |
| 429, 403 or 10003, rationing | ApeX Omni — asked Trade to slow down, asking again in 5 seconds (then 10, 20, 40, 60). |
| A window Trade counts itself is full | ApeX Omni — spent 240 of 240 requests from this server this minute, room again in 12 seconds. |
| Not enough margin | ApeX Omni says the account has $12.40 free and this order needs $25.00. |
| `ORDER_NOT_FOUND` | ApeX Omni says this order is not open any more. It may have filled or been cancelled on ApeX itself. |
| Below the smallest size | ApeX Omni's smallest order on this market is about $84.00 at today's price. |
| `ORDER_OPEN_ORDER_COUNT_LIMIT_EXCEED` | ApeX Omni allows 200 open orders per account, and this account has reached that. |
| `ORDER_SYMBOL_DISABLE_TRADE` | ApeX Omni is not taking new orders on this market right now. |
| `ORDER_SYMBOL_DISABLE_OPEN_POSITION` | ApeX Omni is only letting positions on this market be closed right now, not opened. |
| `PermissionDenied` | ApeX Omni says this API key is not allowed to do that. |
| Anything else | ApeX Omni refused it (code N). Nothing else is known about why. Check the order on ApeX's own site before trying again. |

## Refused before anything is sent

These never reach ApeX, because Trade already knows the answer:

- **A trigger on the wrong side of the price**: "A long position's stop has
  to sit below the price, which is 84000 now. Move the stop to the other
  side."
- **An order below the market's smallest size**, in dollars.
- **A stock, index or commodity contract.** ApeX trades those from a
  separate RWA account Trade does not set up.
- **A prelaunch contract or a prediction market.** Neither is in the market
  list, and an order naming one says Trade never trades it.
- **The 200th open order.**
- **A real-money switch that is off.**

A stock contract outside its trading hours was checked for and not found:
ApeX tags its stock contracts "7x24" and states no hours.

## The shapes they ride

Each refusal goes out as `LIVE_ORDER_REFUSED:` and its sentence, which the
order window and the Journal print as written, or `EXCHANGE_BUSY:` for
rationing. A sign-in refusal is the same sentence behind `KEY_NOT_APPROVED:`,
which the Add wallet window prints after its own first line.

## What was proved and how

- 20002 (twice), 10002 and a wrong spelling of a market (code 3) are saved
  real answers in `apex.fixture.json`.
- The rest are ApeX's documented error keys, tested with made-up answers,
  plus one unknown refusal carrying secret-looking text that must not come
  through.
- In the browser, made-up values in Add wallet printed the 10002 sentence and
  saved nothing; no key or secret appeared in any server answer.
- Not proved live: every refusal that needs a real account (not enough
  margin, a wrong-side trigger with the switch off, a missing order).
