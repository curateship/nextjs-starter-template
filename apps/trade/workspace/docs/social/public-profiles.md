# Public trader profiles

A member can switch on a public page at `/t/<handle>` that shows what their
real wallets made and lost. Trade works every figure out from the trades it
recorded. Nobody types a number in. Anyone can open the page without an
account, and `/traders` ranks every public profile.

The point is the one thing Kolscan and GMGN cannot offer. There, a trader
can show the one wallet that made money and hide the nine that lost. Here,
every real wallet counts and none can leave.

## The rules

- **Every real wallet counts.** Every live wallet on mainnet a member has,
  and every one they add later, is on the profile. The member cannot pick.
  Tyler confirmed this on 24 Sep 2026 when asked whether a member may leave
  one out.
- **Practice and testnet wallets never count**, anywhere on the page.
- **A paused or inactive wallet still counts.**
- **Nothing can be removed.** Binning a Journal row changes nothing on the
  profile. A deleted wallet stays on the page with its trades, marked
  "Removed by Sam on 2 Sep 2026. Its trades still count."
- **Switching the page off hides it and nothing else.** The record keeps
  growing, and switching on again shows the same history.
- **Open positions are a count, never a coin.** The page says "2 positions".
  It never says which coins or at what price, so nobody can jump in front of
  a trader's next move.
- **The Hide P&L switch never blurs a public page**, even for a signed-in
  visitor who has it on. The switch is about a member's own screen.
- **Handles** are 3 to 20 lowercase letters, numbers and underscores, and
  start with a letter. Names that would read as Trade speaking (`admin`,
  `support`, `trade` and a few more) are refused. A handle somebody gives up is
  kept from everybody else for 90 days. Its old owner can take it back.

## The permanent record

The profile never reads `trade_live_fills`. It reads its own copy, so that
nothing a member does in the Journal or the wallet list can clean it up.

- **`trade_record_wallets`** holds every real mainnet wallet a member ever
  saved. A database rule adds the row when the wallet is saved. A second rule
  sets `removed_at` when the wallet is deleted, instead of deleting the row.
- **`trade_record_fills`** holds a copy of every fill of those wallets. A
  third rule copies every insert into `trade_live_fills`, and every later
  correction, such as KuCoin stating a sale's money after the position
  closes. The copy never reads `hidden`, so binned fills are kept.
- **Only deleting the whole account removes the record.** No member action
  deletes a row.

**Why database rules and not app code.** Fills are written from three places
today: the fills sweep, the BNB Chain ledger and the Robinhood Chain ledger.
The engine and the website both write. A rule on the table catches every one
of those, and any writer added later, without anyone having to remember.
Migration `0186_trade_public_profiles.sql` holds the three rules. It also
copied everything already saved when it ran: 10 wallets and 8,176 fills on
24 Sep 2026.

**Why a deleted wallet's money is fixed first.** A grid's sale is priced from
the grid that made it (`gridRoundTrips` in `src/lib/trade/live-trades.ts`),
and the grid is deleted with the wallet. Priced afterwards, the same sale
would fall back to the exchange's own figure and the total would move. So
`deleteWallet` works out each fill's money first and stores it on the record
row as `money`, marked `frozen`, in the same transaction as the delete. Those
rows never change again.

**Adding a deleted wallet again does not count its trades twice.** The first
sweep of the new wallet reads the same fills again. The copy rule skips a fill
the member already has under another wallet with the same exchange and
address.

## The figures

Every figure uses the P&L page's counting, through the same code.

- **Money made** is each fill's money after fees, priced by `priceFills` in
  `src/server/trade/trading-overview.ts`. The P&L page, the trading overview,
  the daily goal and the public profile all price through that one function.
- **Made in the last 7 and 30 days** start at midnight in Toronto on the
  first of those days, counting today. So the 30-day figure is the last 30
  tiles of the P&L page's month grid added up.
- **A sale the exchange has not priced yet** is counted apart, never as zero:
  "plus 22 sales the exchange has not priced yet".
- **Fees** are shown beside each window: "-$483 after $48 of fees".
- **Trades that made money** is out of 100, from the Journal's flat-to-flat
  trades. A trade that broke even did not make money.
- **Worst stretch** is the biggest fall of the running total of dollars made,
  from its highest point to the lowest point after it: "Total made fell from
  +$141 to -$5,462, and has not recovered yet". It is the running total, not
  the account balance, because Trade does not keep deposit and withdrawal
  history.
- **Days traded** is the Toronto days with at least one fill.
- **The month grid** is the P&L page's own `PnlMonthGrid`, told where this
  record begins. The server adds the fills up by Toronto day and sends one
  total per day, so the page never carries the time of each trade.

**Where the profile and the P&L page differ, and why.** The P&L page leaves
binned trades out, and the profile keeps them. For the same 30 days the two
agree when nothing in them is binned. That is what the tests prove. On
24 Sep 2026 every one of Tyler's 5,739 September fills was binned, so his P&L
page read "No trades" for September while the profile counted them all.

## Proving a wallet is theirs

Trade can only trade on a wallet it holds a working key for, and every wallet
passes a proof before it can be saved (`agent.verify` on each exchange's
registry entry). The ownership check runs that same proof again:

- **Hyperliquid:** the agent key is approved for that main address.
- **Solana, BNB Chain and Robinhood Chain:** the private key produces that
  address.
- **Every exchange with API keys:** one signed read the account accepts.

It runs when the page is switched on, and when the member presses Check
wallets again. Saving a replacement key clears a failed check.

- **A wallet that fails does not count.** The page still lists it, so a
  visitor knows something is left out. A visitor reads "Trade could not
  confirm this wallet still belongs to its key". The member's own window shows
  the exchange's full reason, which can name the address a key really opens.
- **A check that could not be asked changes nothing.** An exchange that did
  not answer, an exchange that asked Trade to slow down, or a saved key the
  server cannot read (most often a missing encryption setting) says nothing
  about ownership. The last answer stands.
- **A wallet never checked counts**, because saving it proved it.

**What a visitor sees for each wallet.** Hyperliquid, Solana, BNB Chain and
Robinhood Chain show the address and "On-chain, check it yourself", linking
to that chain's explorer. The link comes from `explorer` on the exchange's
registry entry. Every other exchange says "Checked by Trade, not visible
on-chain". That means Trade proved the key belongs to the account, and a
visitor has to take Trade's word for it.

## How far back the record goes

Each wallet shows the date of its earliest recorded trade, and the profile
shows the earliest of those. A wallet's first sweep already asks its exchange
for everything from the beginning, so no separate fetch runs when a profile
is switched on. How far back that reaches depends on the exchange, read from
each exchange's fills reader:

| Exchange | What the first read gets |
| --- | --- |
| Hyperliquid | Everything the account has, up to the 10,000 most recent fills Hyperliquid keeps (Hyperliquid's API docs). |
| Phemex | The last 30 days (`FIRST_SWEEP_MS`). |
| KuCoin | The last 24 hours (`FILLS_WINDOW_MS`), which is all that door answers. |
| Aster | Only markets Trade already knows the account traded, with no start date, so whatever Aster answers by default. |
| Lighter | The newest 500 trades: five pages of 100. |
| ApeX Omni, edgeX | The newest 1,000 fills: ten pages of 100. |
| Binance | The last 7 days, per market. |
| Solana | The wallet's newest 50 transactions. |
| BNB Chain | About two hours of blocks, which is what the public node keeps. |
| Robinhood Chain | The last 7 days (`LOOK_BACK_MS`). |

On the 24 Sep 2026 live data, Tyler's older Hyperliquid wallet starts on
12 Oct 2025 and his other wallets start between 14 Jul and 26 Aug 2026.

Reaching further back on the short-window exchanges needs a new history
reader for each one. It has not been built.

## The pages

- **`/t/<handle>`** (`src/routes/t.$handle.tsx`) opens without a login. It
  follows the Traders page's on/off switch in Settings → Pages. A handle that
  is not public right now answers the same "not found" whether it never
  existed, is switched off or was hidden, so none of the three can be told
  apart from outside. The worked-out page is kept for 60 seconds, so a link
  shared on X that a thousand people open is one read of the record. Any
  profile change empties that store.
- **The share picture** is `/t/share-image/<handle>`, a 1,200 by 630 PNG with
  the handle, the 30-day and all-time dollars and trades that made money. It
  is the plain version, because the Profit card task has not shipped. It is
  drawn with `@resvg/resvg-js` and the Inter font in `public/fonts`, because
  the server image has no fonts of its own and X and Telegram will not show an
  SVG. A drawn picture is kept for as long as the page answer it came from,
  a minute, so a crowd opening one link draws it once.
- **Search engines** list a profile in the sitemap only when the member
  ticked "Let search engines list me". Otherwise the page also asks search
  engines not to index it.
- **`/traders`** (`src/routes/traders.tsx`, declared in `traders.page.ts`)
  ranks by dollars made in the last 30 days, with 7 days and all time as the
  other choices, and filters by exchange. The period and exchange live in the
  address. The list is worked out every 5 minutes at most.

**The leaderboard minimums.** A profile appears only once its record is at
least 30 days long and has at least 20 closed trades, so one lucky trade
never tops the list. A profile with 19 trades is missing.

## Where the member sets it up

The settings cog at the top right of every signed-in page has a Public
profile row, under Hide profit and loss. Its Open button opens the window.
Tyler chose that spot on 24 Sep 2026.

The cog's panel belongs to the shell, and it removes its rows when it
closes. Opening a window closes it, so a window drawn by the row would
vanish as it opened. The window is drawn instead by
`PublicProfileDialogHost`, which the header's pinned-markets strip puts on
every signed-in page. The row only asks it to open.

The window holds the on/off switch, the handle, display name, picture, a bio
of up to 280 characters, up to three links, the search engine tick box, and
the wallet list. Switching on first saves the form, then shows one screen
saying plainly what becomes public: every live wallet's trades, the on-chain
addresses and that an explorer shows a wallet's whole history, and the dollar
amounts. Only then does the page go public.

## Reports and hiding

Every profile has a Report link. Anyone can send one without an account, at
most five an hour from one internet address. A report changes nothing on the
page.

Admin → Profiles (`/admin/profiles`) lists every saved profile with its
report count and latest report. Hide asks for a reason and takes the page and
its leaderboard row away. The member reads the reason in their own Public
profile window. Show again brings it back. Hiding never touches the record.
An admin adds the link to the admin sidebar by hand, like every other admin
page here.

## Where the code is

- Rules and shapes: `src/lib/trade/public-profile/profile.ts`.
- Figures, with tests: `src/lib/trade/public-profile/figures.ts`.
- The record, pricing, freezing and ownership checks, with tests:
  `src/server/trade/trade-record.ts`.
- Profiles, handles, the leaderboard, reports and hiding, with tests:
  `src/server/trade/public-profiles.ts`.
- The doors: `src/lib/api/trade/public-profiles.ts`. The three open to
  visitors are listed in `src/app/open-endpoints.ts`.
- Screens: `src/components/social/`. The cog row and the window's host are
  `public-profile-setting.tsx`.
- Share picture: `src/lib/trade/public-profile/share-image.ts` and
  `src/server/trade/profile-share-image.ts`.
