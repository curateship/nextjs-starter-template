# The market list

The left column is **one Folders panel** (decided 23 Aug 2026; the separate
market list panel above it is gone). Its header reads Folders, with the + that
creates a folder and the cog that opens the window for renaming,
drag-to-reorder and deletion. The header's buttons, and every row and market
line in the body, share the panel's one 12px gutter.

- **Every row wears a folder's shape**: the name, a count on the right, and a
  chevron; pressing the row opens its contents in place, one row open at a
  time. The open row uses the darker gray, while its list uses a very light gray
  so the two cannot blur together. The open row has a border above and below.
  Those are plain theme borders, so the shell's Borders setting controls them.
  A closed row turns gray under the pointer, so which section is open never
  depends on the chevron alone. **Watched is the first row** and the one the
  panel opens on, because
  a price you have money committed to beats a market you might look at — it
  is not a folder, it lists orders, but it dresses as one so the column is
  one panel. **All markets is the last row**: the whole catalogue under its
  own 24h Vol / 24h Change sort headers. The saved folders sit between them.
  Watched's count says "N waiting" only once the read has settled — before
  that, and after a failed read, it says nothing rather than claiming zero.
  An empty folder points at the star in the market header.
- **Searching lives in the market picker** — the market name at the top of
  the chart opens the whole catalogue with its own search. The panel has no
  search box of its own. The picker window is exactly as wide as its table's
  columns, capped by the screen, and the list scrolls in a `ScrollArea` with
  the thin themed thumb — never the browser's own scrollbar — while the
  heading row stays put.
- **On testnet, the amber strip sits at the panel's foot** with the Back to
  Mainnet link, exactly as it did on the old market list panel.
- **Both side panels open at their smallest useful width.** Folders starts at
  12% of the workspace and Smart orders starts at 17.5275rem. The chart takes
  the space left between them. Either width is still yours to drag and is
  remembered per browser, so a width you have already dragged to wins over
  these starting sizes.
- **A row is the symbol and the day's move, nothing else.** The percentage is
  signed and sits in a soft pill of its colour — green up, red down; the price
  belongs to the market header; a market with no yesterday price shows a plain
  dash, not a zero in a pill. A ticker longer than nine characters shows its
  first eight characters and an ellipsis. Hover and screen readers keep the
  full ticker.
- **Sub-exchange markets keep their full name** — "xyz:SNDK", never a
  stripped "SNDK" that could be read as a main-exchange coin. The (i)
  tooltip names the venue; coin art and the letter fallback use the bare
  name.
- **The bottom bar carries a kind-of-market filter** beside the search —
  crypto, stocks, indices, commodities, forex, other; only kinds actually in
  the list are offered. It narrows the All tab only (stars are stars), is
  remembered per browser, and reads as switched off on the other tabs.
- **The (i) tooltip ends with the market's ground rules:** the smallest size
  an order may use, the max leverage, and — where it applies — "Isolated
  only", explained in the same line. A rule the exchange does not state
  shows nothing, never a guess.
- **The market header's (i) tooltip names both kinds of price and the daily
  dollar volume.** The list and every order rule use the exchange's mark price.
  Chart bars show traded prices, so the newest candle may sit above or below
  the number the exchange uses for stops and account value.
- **A bare visit reopens your last market**, remembered against the account
  (a second machine gets it too). A link with `?market=` always wins, and a
  remembered market that no longer resolves shows the honest missing state.
- **Sort is drawn as column headers** — "24h Vol" left, "24h Change" right, the
  shared `TableSortButton` — and clicking the sorted one flips the direction.
  Both headings lead with the time window, and so does the market picker's "24h
  change", so the three read the same way round. All markets opens with 24h
  Change sorted from the largest gain to the largest loss. Every saved folder
  uses that same order. A market with no reported change comes last.
- **Stars are put on in the market header**, at the head of the row, before the
  logo of the market on screen. Every row of the market picker has the same
  star. An empty star adds the coin to Fav in one press. A filled star opens
  the folder list because the coin may be in more than one folder.
- **Folders save to the account, not the browser**, so Fav, named folders and
  their order follow you between machines. Each folder belongs to one
  exchange and network. Fav is first and cannot be renamed or deleted.
  Folder changes appear at once and revert with a toast if the save fails.
- **Settings → Markets holds one minimum daily dollar volume for the account.**
  Every exchange uses the same number. Markets below it disappear from every
  list, including folders and search. The setting never disables a market:
  links, remembered markets, positions and orders still open its normal header,
  chart and order controls. A zero setting keeps the old rule, where markets
  with no reported volume stay hidden. When the cutoff hides every market, All
  says none meet the setting. A folder with no visible markets names the folder
  and points back to the star control.
- **Selection lives in the address** as a full market key
  (`?market=hyperliquid:mainnet:BTC`), so a link means the same market even
  when a second exchange exists. The selected row keeps its gray fill and adds
  a right border in the theme's text color in Watched, saved folders and All
  markets.

### The Watched row

Every price you are waiting at, across every coin and every wallet on this
exchange. A plain order does not rest on the exchange any more — the app holds
the level and sends nothing until the market comes to it, which
`../orders/watched-orders.md` explains — and those levels were only ever visible one coin
at a time on the chart, or mixed in with everything else under Open orders.

- **One row per market.** When several orders wait on the same market, the row
  shows the order nearest today's price. The market keeps the place given to
  its newest order, so a changing price can change the order shown without
  moving the row under the pointer. With no market price, or an equal distance,
  the newest order wins. The count beside Watched is also the number of markets,
  so the count and the rows agree. Watched rows show the coin name without its
  favicon.
- **One line per row, shaped like a market row.** The coin with what the
  order will spend beside it in the quiet grey the volume figure uses, and on
  the right a green pill saying how far today's price is from the level:
  "PENDLE $199  [36.09% away]". The dollars are whole dollars, because the
  row is for telling a $20 level from a $1,000 one. Which way, at what price
  and from which wallet sit on the row's tooltip; the chart the press opens
  shows the level itself. The coin gives way to an ellipsis first and the
  figures on the right never do.
- **The wallet is named only when the list spans more than one.** With every
  level in the same wallet its name is the same word on every row, pushing the
  level into an ellipsis to say nothing.
- **Newest first, and it stays that way** while prices move. Sorting by which
  level is closest would reshuffle the list under the pointer every second.
- **Pressing a row charts that coin**, the same press the market rows answer
  to. Calling an order off stays where it already is, the × in Open orders and
  the line on the chart, rather than becoming a second place to cancel.
- **The charted coin's row carries the same gray fill the All tab uses.** On
  both lists the fill runs edge to edge and the first row sits flush under the
  header line, the way the Folders panel already draws its rows.
- **The sort headers belong to All markets, not to Watched.** There is no
  volume and no day's move to sort a waiting price by.
- **"Reached" is the engine's own rule**, so the list and the engine can never
  disagree about whether a price has arrived: a buy is reached when today's
  price has come down to it, a sell when it has come up. The price is the
  live feed's where there is one, and the catalogue's last mark where there
  is not — KuCoin has no all-markets feed, so its rows had no distance at all
  until 23 Aug 2026. With neither, the pill is left off, because a dash there
  would read as zero.
- **Loading, empty and failed are three different answers.** "Nothing is
  waiting" is only said once the read has come back.
- **It opens on the levels this browser saw last time**, so there is no spinner
  on the first thing anybody looks at. Measured on 21 Aug 2026: the rows used
  to land 5.3 seconds after a reload and now land at 1.8, which is as soon as
  the panel itself exists. `../orders/watched-orders.md` says what is kept and why it is
  never trusted.
- **Nothing marks those rows while the read is on its way.** A "checking these
  are still waiting" line was tried and taken out on 21 Aug 2026: the read
  lands almost at once, the levels almost never differ, and a spinner on the
  first thing on screen is the wait wearing a different hat.
- **A read that FAILS is the one case that speaks up.** It keeps last time's
  answer and puts "The read failed. This is what was here last time." above it,
  with a Try again. Nothing is coming to correct it, so it has to say it is
  old. That line sits above the "nothing is waiting" wording just as it sits
  above rows. With no cache at all it says instead that it could not find out.
- **The cache only ever stands in until this session has an answer of its own.**
  A read that refuses in the afternoon never puts the morning's levels back
  over what is on screen.
- **The exchange call failing does not take the page down.** The list shows
  the error and a retry; every other panel still works.

