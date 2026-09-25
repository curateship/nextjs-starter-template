# Markets

Markets at `/admin/markets` compares mainnet markets across exchanges.

- Each exchange loads independently. A failed exchange keeps its name and a
  Try again button, which asks that exchange alone. The account's minimum
  volume applies before rows reach the page, and the count names the hidden rows.
- Search, filters, sorting, columns, grouping and named views belong to the
  account. `trade_prefs.market_explorer` stores the settings. Migration
  `0166_trade_market_explorer.sql` adds the column. A failed save shows a toast
  and restores the last confirmed settings.
- Clear filters keeps the chosen columns, sort and grouping.
- Exchange and Market always show. Open interest starts hidden. A hidden
  sorted column falls back to 24h volume. Narrow screens hide secondary figures.
- The header uses the same shared toolbar as Newsletter. The icon, title and
  count sit left; search, Filters and View sit right. Exchanges live in Filters.
  View contains saved views, Table/Map, columns, grouping, live sorting,
  arrival settings and feed status. Pin actions appear only after selecting
  rows. The arrival strip appears only when it has arrivals to show.
- Header and row checkboxes use the shared table's matching left inset.
- The footer pages through 25, 50 or 100 results, starting at 50. Filters and
  sorting return to page one; incoming exchange lists keep the current page
  unless that page no longer exists. Markets that stop matching a filter are
  removed before page boundaries are calculated, so stale positions cannot
  leave a page short or empty. Grouped coins keep their exchange rows
  together on the same page.
- The table renders the visible rows of the current page and a small allowance
  above and below. Its viewport fills the space between the controls and the
  fixed footer, with no fixed viewport-height cap. Both themed scrollbars stay
  visible, and the final row clears the horizontal bar. The headings stay pinned.
  Rows measure 52 pixels. Arrow Up and Arrow Down move between market links,
  including rows outside the rendered section.
- A row opens the chart route supplied by the protocol contract. Venues without
  a chart route currently have a name without a link. The folder star uses the
  existing exchange-specific Fav and folder save paths.

## How the 5-second figures are worked out and why they are estimates

- Price move compares the latest price with the price at the window's start.
  Traded dollars subtract the earlier 24-hour volume from the latest one and
  clamp negative answers to zero. Yesterday's trades leave the same rolling
  total, so a small amount of trading can read as zero. Every traded-window
  heading says est. and explains the calculation on hover.
- A window stays blank until enough uninterrupted samples exist. A feed gap
  clears the history. KuCoin and other catalog-only venues have no windows.
  No trade subscriptions open for these calculations.
- The sample storage has a hard ceiling of 3,000 markets and 6,192,000 bytes,
  about 6.2 MB, excluding map keys and objects. Each market has 86 sample slots,
  61 recent seconds and 25 older ten-second slots. Markets beyond the cap keep
  their ordinary figures but have blank windows.
- Live sort runs every two seconds and pauses while the pointer or keyboard
  focus is inside the table. New top-ten rows get a word badge and a theme
  highlight. Reduced motion omits the highlight animation. Other market lists
  keep their original loaded order.
- Move columns show both dollars and percent. Sorting a move column uses its
  percent change, so differently priced coins can be compared.

## Feed cost and missing figures

- Hyperliquid, Phemex, Aster and Lighter can push figures for the whole list.
  The page calls a feed live only after figures arrive. After 30 seconds without
  figures, the rows use catalog values and the exchange says reconnecting.
- Lists refresh once a minute. Funding and open interest missing from live
  updates keep the catalog values. A missing reported number prints a dash.
- A hidden tab releases its subscriptions and stops asking for lists or prices.
  Returning starts the watches again and windows need to fill again.
- Solana's catalog supplies its refresh interval and market limit. Opening a
  Solana dashboard in another browser tab spends that refresh budget twice.
- The optional Moving now overview widget starts the same market watches.
  With all four socket venues available, the overview opens four sockets.
  Removing the widget releases its subscriptions. The first minute has no
  completed one-minute window to rank.
- Grouping compares normalized coin identities within the same market category.
  Contract multipliers such as 1000PEPE change the per-coin price comparison.
  Ambiguous duplicate listings on one exchange stay separate. Open mint listings
  keep their own identity. The displayed gap makes no trading recommendation.
  A grouped coin keeps its row position when a different exchange becomes
  busiest. The representative price and chart link follow the busiest exchange.
- The starting Big and cheap to hold view allows funding that pays longs or
  costs at most one cent per hour on $10,000 of exposure.

## Exchange selection and navigation

- Migration `0166_trade_market_explorer.sql` was applied to the remote database
  configured for local development on 5 September 2026. The nullable JSONB
  column and migration record were verified, and a second migration run applied
  nothing. Signed-in preference saving and loading in a separate browser context were verified.
- The requested sidebar-default and route-title files belong to Custom Shell.
  Trade leaves those files alone and uses its own browser-title helper. The
  recommended sidebar setup is a Markets link to `/admin/markets` through the
  existing sidebar settings. The signed-in local navigation now exposes the page as Explore markets;
  no shell-origin source change was needed.
- The Exchanges choices in the current saved view control which venues load.
  Unticking an exchange removes its rows and feed badge, stops its live watch
  and excludes it from minute refreshes. Requests already in flight may finish,
  but their answers are ignored while that exchange is off. Its short-window
  history clears, so switching it back on starts a new window.
- Initial page loads and Moving now request only the saved selection. The
  exchange menu still lists every supported mainnet venue, including those
  switched off. Switching one on requests that venue immediately, without
  waiting for the debounced preference save. An empty selection makes no
  market-list requests. Sidebar visibility does not control these choices.

## Checks completed locally

- The actual table and controls ran in Chromium with 3,000 sample markets.
  Only 31 table rows rendered in the desktop check. The scroll height was
  156,040 pixels, including the 40-pixel header. Search, empty results,
  reaching the last market, a named view and optional open interest worked.
- At a 390-pixel browser width, the page stayed 390 pixels wide. The table's
  own horizontal scrollbar held the overflow. Light and dark captures had
  no page JavaScript errors. This used sample data, not a signed-in account.
- A separate Chromium check used Aster's real public socket and the actual
  live store. Prices and a five-second window arrived. After the browser
  went offline, live figures expired. Recovery first returned a price with
  no window, then rebuilt the estimate after five seconds. No JavaScript
  errors appeared. The other exchanges have not had this browser check.
- Focused tests cover the fan-out, guarded endpoints, account separation,
  history, stale figures, matching coins, preferences, table states, live
  sort and the widget registry. Widget component tests cover the top ten,
  chart links, a failed-load retry and the empty first minute. The task records
  the final test count.

## Local testing

- Open Markets and check that each exchange adds rows without waiting for the
  slowest one. Check the named failure and retry if an exchange refuses.
- Search for BTC, use the volume and funding filters, and clear the filters.
  Save a named view, rename it, change columns, and reload. Use another signed-in
  browser to check that the account has the same saved choices.
- Wait five seconds before checking the first window, a minute for the second,
  and five minutes for the last. Hover over an estimated-trading heading.
  Sort a window column and check that rows stop moving under the pointer.
- Use Next and Last in the footer, change Rows per page, and scroll to the
  bottom and far right. Check the sticky headings, both scrollbar
  directions, keyboard access, light and dark themes, and a narrow viewport.
- Disconnect the browser's network and restore it. The feed label must stop
  saying live, stale figures must fall back, and windows must rebuild.
- Group coins and expand one. Compare the exchange names and per-coin prices.
  Add a row to Fav, open its folder menu, then open the coin's chart.
- Add Moving now in Widgets settings. Wait a minute and open one of its rows.

Browser validation and focused-check results are recorded in the task's Brief.

## Reference layout and pagination validation

The signed-in local page was checked after the September 5 reference-layout
update. At 1440 × 1000 the footer ended at 994px and the horizontal scrollbar
ended at the footer's top, 929px. Rows measured 52px and headings 40px. The
last row cleared the scrollbar by 10px. Next and Last showed the matching
result ranges. Filters, Columns and opening and cancelling Save view worked.
Light and dark layouts were inspected. At 390px the document stayed 390px
wide, with table overflow confined to its own scrollbar and the footer visible.
Five focused table tests cover rendering, empty and error states, live sorting,
coin identity and pagination. ESLint passed for the changed components.
TypeScript still reports existing errors in unrelated tests.

## Audit result

The September 5 audit reproduced and fixed pagination after live figures remove
markets from the current filters. The page range counted matching rows while
the table sliced an older ordering that still included removed rows. Filtering
that ordering before slicing keeps the rendered rows consistent with the range.
The regression failed before the fix and passed afterward.

All 49 focused tests passed across 12 files, including guards, account isolation,
protocol boundaries, live figures, estimates, preferences, coin matching, table
pagination and the overview widget. No full suite ran. ESLint reported no errors
and the existing route fast-refresh warning. The subsequent completion check
verified exchange exclusion, account preferences in a second browser context,
real row-star and folder writes, and the enabled overview widget. No new
migration was needed for exchange selection or pagination.

## Completion checks

The signed-in browser switched all eight exchanges off. The saved selection and
server request list were both empty, including after reload. Enabling Aster
loaded only Aster, whose feed became live. A separate browser context loaded the
same Aster-only account preference. The row star and Create folder saved a real
market into a temporary folder. Moving now on the actual overview produced ten
live rows after its first uninterrupted minute. Test folder changes, account
preferences and overview layout were restored afterward. No page JavaScript
errors appeared during the successful run.

51 focused tests passed in 13 files. The new tests prove the server omits disabled
venues, retains their menu choices, makes no requests for an empty selection,
releases disabled feeds and refreshes only enabled venues. ESLint passed on the
changed files. TypeScript reports no errors in the explorer files; unrelated
existing test errors remain. No full suite, commit or application deployment ran.

## Discovery

Discovery adds comparisons to the same catalogues and browser history.

- **Pace:** Last-minute estimated dollars divided by 24h dollars divided by
  1,440. A coin doing $60,000 against its usual $10,000 shows 6× usual.
  Pace stays blank without a complete live minute or positive 24h volume.
  Surging requires at least 5× and at least $10,000 traded in that minute.
- **Daily funding:** Long and Short columns show the signed daily cost or
  income on $1,000. Hourly funding of 0.0001 means a long loses $2.40 a day
  and a short makes $2.40. Venues without funding stay blank and sort last.
  Filters select the earning side or a daily cost ceiling for either side.
- **Wallet marks:** The existing portfolio readers supply one account-wide
  answer every four seconds. Held shows coin sizes and Waiting marks orders.
  Hover names each wallet. Failed wallets contribute no marks and the count
  names how many did not answer. Only mine filters these marks.
- **Folders:** The filter offers each loaded folder name once, including Fav.
  Matching names combine memberships across exchanges. Folders remain tied
  to one exchange. The optional Folders column lists a market's memberships.
  A deletion in an open tab clears its active filter when no matching folder
  remains. The count explains why the filter cleared.
- **First seen:** Migration `0169_trade_market_first_seen.sql` creates the
  timestamp table. Every one-minute catalogue refresh records unseen keys.
  Repeated and concurrent reads preserve the original timestamp. Listed
  means first seen by this app, never the exchange's listing date.
  The initial catalogue stamps all existing markets that day, so the age
  filter becomes useful only after the app has observed markets for a while.
  New since your last visit compares the timestamp with the account's saved
  previous visit. The first visit has no previous-visit badge.
- **Sparklines:** The optional 5m line column uses canvas and the existing
  five-minute samples. Fewer than 30 samples draws nothing. Lines use the
  chart's money colours. Reduced motion redraws once a minute.
- **Pins:** Select rows with the first-column checkboxes, then Pin selected.
  Pins stay above the sorted list in pin order and keep their live figures.
  Select them again and use Unpin selected to remove their pins. Pins belong
  to the current saved view and still obey its filters.
- **Arrivals:** Watch arrivals detects entry into the current sort's top ten
  or a crossing of the chosen pace threshold. The strip keeps the latest
  five entries for one minute. Initial rows and changed filters establish
  a fresh starting comparison without announcing the whole list.
- **Quiet:** Ten minutes of unchanged live prices earns Quiet. A feed gap or
  reconnect starts the ten-minute wait again. Catalogue-only feeds cannot
  earn Quiet. Hide quiet markets removes those rows. Stock and forex quiet
  badges are omitted because stillness does not establish session status.
- **Map:** Table and Map share filters and chart links. The map groups squares
  by exchange and uses the selected price-move window for colour. The
  largest square measures 160px. Area follows volume with an 8px minimum.
  Squares below 24px have no label. Hover or focus shows the figures.
  The busiest 400 markets appear, because 3,000 squares obscure useful moves.
  Updates run every two seconds, or every ten seconds with reduced motion.
  A live 400-square check recorded five pauses above 50ms in five seconds
  at the original one-second refresh, so the refresh was reduced.

## Discovery validation and release requirements

- **Focused checks:** 36 focused tests passed across twelve files during implementation.
  Coverage includes arithmetic, reconnects, first-seen concurrency, account
  preferences, pin actions, wallet failures, and the existing table workflow.
- **Migration:** The timestamp migration passed against the isolated test
  database and was applied to Trade's configured database on 6 September 2026.
  The app recorded 5,532 market keys with no missing dates. View → Status
  stopped reporting unavailable dates. Market rows still load if date storage fails.
- **Sound settings:** Discovery has a separate account switch in Sounds and
  alerts. The setting starts off and survives saves from an older open view.
  The sound requires a click in the Markets page and collapses bursts to one
  sound every ten seconds. The app currently has no master sound switch.
  Discovery deliberately keeps an independent switch, off by default.
- **Stock hours:** A Closed badge has not been added. Aster permits stock
  perpetual orders outside the underlying stock market's normal hours.
  Stock and forex rows omit closed and quiet badges because price stillness
  does not establish session status. See [Aster's trading sessions](https://docs.asterdex.com/product/aster-perpetual-pro/stock-contracts).

## Discovery browser checks

- **Saved controls:** Signed-in Chromium added Pace, Long and Short daily
  funding, Listed, Folders and the sparkline column. A selected market stayed
  pinned after reload. The original account preferences were restored.
- **Map:** The signed-in page rendered 400 squares. Document widths matched
  viewport widths at 1440px and 390px. Light and dark modes produced no
  Markets page errors. Map updates now skip unchanged squares. In the
  400-market fixture, measured changed-square updates fell from 121 to
  136ms to 7.8 to 8.8ms. Initial drawing took 111ms. These are local
  Chromium measurements, not a guarantee for every laptop.
- **Reduced motion:** Changing the fixture's move left the square unchanged
  at the early check. The square showed the new value after ten seconds.
- **Canvas:** Thirty samples produced 288 nontransparent pixels in the
  actual sparkline component. The fixture uses the same live-store module
  as the component. Helper tests cover blank lines before 30 samples and
  after a gap.
- **Sound:** Browser instrumentation counted no oscillator for an arrival
  before a click. Two later arrivals produced one oscillator. The real
  Sounds setting previewed once and remained on after reload. The previous
  sound choice was restored afterward.
- **Existing Settings error:** Direct loads of Sounds and alerts report
  Shell runtime is missing and recover through browser rendering. The same
  error occurred with the new discovery card removed. The shared Settings
  route was left unchanged. Markets itself had no page errors in these checks.
- **Limits:** Real wallet holdings were not verified against an existing
  funded wallet. Component and server tests cover wallet sizes and failures.
  First-seen dates were tested in the isolated database, not the running
  account. No full suite, commit, migration application or deployment ran.
- **Audit:** ESLint and diff whitespace checks passed. TypeScript reports
  unrelated existing test errors and none in the discovery implementation.
  The full task is not ready to commit while the master-switch choice,
  session wording and database authorization remain outstanding.

## Audit coverage

The discovery audit checked account guards, owner-scoped wallet reads, sound
preference writes, first-seen persistence, filtering, selection, live history
and the shared header. Account credentials stay on the server. Sound writes
validate a boolean and require the app origin.

All 36 focused tests across 12 files pass, along with lint on the changed
TypeScript files and the diff whitespace check. The header browser checks
cover desktop and mobile alignment, view menus and row selection. The audit's
cleanup only removes unused helper exports and a redundant disabled condition.
The latest type check still fails in unrelated test fixtures. The authorized first-seen migration is applied and the running app stores dates.
Sound and session choices are settled. Live wallet comparisons, a full quiet
interval and an actual new market's next-visit badge remain unverified.
