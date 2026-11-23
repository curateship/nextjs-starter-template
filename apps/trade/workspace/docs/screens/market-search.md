# Searching every exchange from the header

One field at the top right of the signed-in header finds a market by its ticker
on every exchange at once, and each row says which exchange it belongs to.

It is a header control the app owns, so it sits in Settings → Top right menu
beside Active trades and Goal, can be dragged along the row and can be switched
off. A new install draws it first in the row. Members and admins both get it:
the search reads market lists, which are public, and never an account.

## What a row says

A row is the ticker and the exchange, and nothing else. A venue that hosts more
than one book gets that book's name in front of the ticker, because two rows
both reading "BTC" have to be told apart. A ticker already holding a colon keeps
what it has, since the exchange has spelled the book into the name itself.

Clicking a row opens that exchange's chart screen with the market already
selected. Holding cmd, ctrl, shift or alt opens it in another tab instead, the
way any other link on the page does. A venue with no chart screen yet is still
listed, dimmed, with a hover saying why, rather than left out of the answer.

## The order of the rows

Best match first, and the busiest market inside each tier. Four tiers, in
order: the ticker is exactly what was typed, the ticker starts with it, the
ticker contains it, and last the exchange's own id contains it. Typing `btc`
would otherwise bury Bitcoin under `WBTC-USDC`.

The last tier is what makes a pasted contract address work: on Solana a market's
id is the coin's mint address, so the address finds the coin without letting ids
outrank real tickers.

Thirty rows at most. More than that and the panel says how many were left out
and to type more letters.

## When it asks, and what it costs

- **Two letters at least.** One letter matches half the app.
- **250ms after the last keystroke.** Typing "sol" is one search, not three.
- **Only the newest answer counts.** A slow reply for "so" can never overwrite
  the list for "sol".
- **The rows wait where they are.** While the newer search runs, the rows from
  the older words stay on screen and the bottom of the panel says "Searching
  every exchange", rather than the list blanking on every keystroke.
- **The exchanges are not asked again.** Every market list comes from
  `loadRawMarketCatalog`, the same one-minute shared cache the dashboards and
  the market explorer read. A search right after a dashboard has loaded costs
  the exchange nothing.

## Mainnet only, and no volume cutoff

Only mainnet markets are searched. A testnet market trades pretend dollars, and
`rules/trading-rules.md` forbids a list where a pretend dollar could be read as
a real one.

The daily-volume cutoff in Settings does not apply here. That cutoff keeps a
browsing list readable. Somebody typing a ticker has already named the market
they want, and hiding it would read as the exchange not listing it.

## When an exchange will not answer

The rows from the exchanges that did answer are shown, and the bottom of the
panel names the ones that did not: "Aster, Binance did not answer." A search
that fails outright says "The markets could not be searched." with a Try again
button. No results at all says so in words, naming what was typed.

## On a narrow window

Below 1024px the field becomes a magnifying-glass button and the field moves
inside the panel it opens. The header has room for one control at that width,
which is where the maintenance and view-as reminders collapse too.

## Keyboard

The field is a combobox. Down and Up move through the rows, Enter opens the
highlighted one, Escape shuts the panel. Moving the mouse over a row highlights
it, so the keyboard and the mouse never disagree about which row Enter would
open.

## Where it lives

- `src/components/trade/market-search-header.tsx` — the field, the panel and
  the rows.
- `src/lib/trade/market-search.ts` — the ranking and ordering rules, plus the
  two-letter minimum and the thirty-row cap.
- `src/lib/api/trade/market-search.ts` — the one server read that asks every
  exchange.
- `src/app/options.ts` — the line that puts it in the header.
