# Trade — screen structure and interaction rules

What the app looks like and how it behaves. One section per part of the product,
added as each part is approved. Anything not written down here has not been
agreed yet.

## The Trade workspace

Four areas on each exchange screen, at `/admin/hyper-liquid`, `/admin/phemex`,
`/admin/kucoin`, and `/admin/aster`.

```
┌────────────┬─────────────────────┬────────────┐
│ Folders    │ MARKET HEADER       │ Account    │
│  Watched   │ ─────────────────── ├────────────┤
│  Fav …     │ Chart               │ Order      │
│  All       │                     │            │
├────────────┴─────────────────────┴────────────┤
│ Positions | Open orders | Fills                │
└───────────────────────────────────────────────┘
```

- **Left — one Folders panel** (decided 23 Aug 2026, replacing the market
  list panel that sat above it). Every row wears a folder's shape and opens
  in place: **Watched first** — it lists orders rather than markets, see "The
  Watched row" below — then the saved folders, then **All markets** last with
  its sort headers. Live exchange data. The panel opens on Watched.
- **Middle — the market you picked.** One header row, nothing more: the
  star for that market, the market's own logo (carried as data on the row,
  with a first-letter circle when an exchange has no art), its name, and on
  the right the timeframe dropdown (1m–1d, remembered per browser, 4h the
  default), the indicator button and the view button. The indicator button's
  small count says how many indicators are on. Each control uses the muted gray
  inside its border, while the rest of the header keeps the card background.
  The star is amber and filled when the market is in any folder and a hollow
  outline when it is not, so the two do not differ by colour alone. An empty
  star names the Fav action. A
  filled star names the folder menu. The star
  leads the row so that the name is what gives way as the panel narrows. On a
  phone the timeframe row leaves the name no width at all, and anything behind
  the name would never be on screen. The star has its own outlined button. The
  market logo, name, top leverage, arrow and info button sit in one outlined
  group. The leverage is secondary 12px text beside the larger market name.
  Every control in that row is 32px high. Pressing the market name
  opens the full market picker: search; segmented tabs; sortable figures; and
  a star on every row. Favorites, All and Trending are always there. Phemex and
  KuCoin stop there because every market is crypto. Hyperliquid also has Crypto,
  TradFi and HIP-3. Aster adds Crypto and TradFi only while its current list
  contains something outside crypto. An exchange omits funding or open
  interest when it cannot fill that column. Moving to an exchange that lacks
  the current sort returns the list to daily volume. Picking a market adds it
  to browser history, so Back returns to the market that was on screen before
  the pick. Below,
  the real candle chart fills everything, volume tucked into its bottom
  fifth. Candle green and red are the same colours as the list's pills, read
  off the page rather than hard-coded. Grid levels, ladder rungs and order
  lines read those same theme colours. Neutral waiting orders use the muted
  foreground so their labels and controls remain readable in either theme;
  only the chart frame uses the deliberately faint divider colour. Loading,
  no-history and failed-fetch states stay inside the panel; the rest of the
  page stands. While candles are
  loading, the whole empty chart surface gently fades in and out instead of
  showing an icon, spinner or loading screen. The completed chart fades in
  when ready. Reduced-motion settings keep both transitions still.
  **However you set the chart up is how every chart opens.** Remembered against
  the account and carried onto the next market, the next timeframe, the next
  visit and the other machine — four numbers, two for each direction: how many
  candles are across the screen and how far behind the newest one the right
  edge sits, plus how much of the height is left above and below the candles.
  That last pair is the up-and-down squash you get by dragging the price axis,
  and it is kept as a share of the height rather than a window of prices, which
  is the only form that means anything on a market trading at a different
  number. Fresh candles for the chart already on screen (the live feed
  refetches after every gap it recovers from) land without moving the view at
  all. A market with a shorter history keeps the zoom and shows the empty space,
  rather than quietly zooming out; only a view with no candles in it at all is
  slid back until it touches the data. **Double-clicking the dates along the
  bottom** puts a chart back to its whole history, which is also how the
  remembered view is reset.
  **The chart is feature-blind by rule:** candles in, candles drawn. Paint
  tools, alerts, indicators and orders arrive as their own modules against a
  small surface the chart offers — the chart never learns what a line means,
  and has never heard the word "indicator".
  Decided in `workspace/tasks/Platform/plain-price-chart.md`.
- **Middle header, Wallets.** The wallet control sits after the chart controls.
  It names the wallet in use, separates the name and total with " - ", then
  shows the made-or-lost figure. On a phone it becomes a wallet icon with a
  Manage wallets tooltip, so the header does not scroll sideways.
  Pressing the control opens Active, All and Inactive above the chart. Active
  lists every wallet that is switched on. Pressing a wallet row makes it the
  wallet used for the next trade. The checked control names the selected wallet
  and the row keeps the panel background. Each wallet fits on one line:
  selection, name, connection dot, total, profit and a vertical three-dot
  button. A fresh mainnet wallet does not repeat its exchange, connection state
  or a Real chip. A failed or old read still says what is wrong beside its dot.
  All and Inactive use the same row grid, selector size, figures and three-dot
  placement. The total of active wallets that answered and Add wallet sit in
  the menu footer.
  Every three-dot button opens the same wallet details window. The window shows
  the key-expiry notice, Free, In trades, margin health and profit figures. It
  ends with Empty wallet and Edit wallet. Edit closes the details window before
  the settings window opens, so two windows never sit on top of each other. The
  wallet menu stays open behind the details window and is still open when the
  window closes.
  The wallet menu is at most 384px wide. Wallet rows are 48px high and run from
  one menu edge to the other. The wallet name, total and
  profit keep their own columns, so each set of figures ends at the same point.
  A wallet turns light gray under the pointer and keeps that background while
  selected. The hover and selected backgrounds are square and reach both edges.
  The menu clips its header, rows and footer to the rounded outer edge.
  The rows use 12px inside gutters and 14px primary labels.
  Money is monospaced and tabular. Wallet and smart-order profit use the same
  12px type and end on the same right edge.
- **Right, Smart orders and Bots.** The wallet block no longer takes the top of
  this column. Smart orders and Bots use the full height.
- **Bottom, what you are holding.** Positions, open orders and fills, as tabs.

**Every tab row and header icon on the workspace uses the shared 32px style.**
The tab strip immediately behind the buttons uses the same light gray as the
market control in the middle panel. The buttons, header and panel keep their
existing backgrounds. The selected tab uses a small shadow, so it reads as the
raised shared button shape instead of using a black underline. Icon buttons in
a panel header, including the Folders panel's + and cog and the narrow-screen
Markets and Smart orders buttons, use the same height.
The tab itself lives on the shared `WorkspacePanelTab` in
`src/components/shared/workspace-panel-header.tsx`, a shell file changed in
Custom Shell first and carried here unchanged.

The right panel opens on **Smart orders**. The Smart orders tab keeps the
hand-placed ladders and grids it already showed. The header has only the Smart
orders and Bots tabs, with no working, holding or running summary beside them.
The **Bots** tab lists every running bot for the exchange on the page. Each row
shows the bot's name, strategy, banked money, and how many of its coins are
working. A bot with no closed trade shows a dash for money, never a made-up
zero. The name opens that run's results dashboard. A stopped bot leaves the
list on the next read.

The row's three-dot button opens the same small popover shape as a wallet row.
It shows the wallet, real or practice money, spending cap, closed trades,
working and held coins, and when the bot was switched on. Pause leaves every
order and position where it is. Stop opens the shared confirmation before it
calls off orders that have not bought anything. Coins already held keep their
stops and targets.

The Bots tab has a cached first answer when the dashboard opens, then asks for
a fresh one as soon as the tab is pressed. The cached rows stay on screen while
that answer lands. While Bots stays open, the list checks again every six
seconds. A failed first read says the bots could not be read and offers Try
again. A later failure keeps the last answer on screen and says the refresh
failed. An empty answer says no bot is running on this exchange.

**A smaller window shrinks the chart, never the panels.** The Folders panel,
the Smart orders column and the bottom Positions panel keep the pixel size they
were dragged to when the window changes size; the chart absorbs the whole
difference, both across and down. Before this every panel gave up its share,
and half a window's width left the market list too narrow to read (decided
23 Aug 2026). The panels' own minimums still hold on a screen too small for
everything, and a screen below the wide-screen line keeps its own layout —
the chart as the page with the side panels behind the header's two buttons.

### What the Positions tab lists

The Positions tab lists everything you are holding **except the coins the Smart
orders panel is already showing on the right** (decided 24 Aug 2026). A ladder's
coin appears there under the strategy that owns it, with what that strategy is
doing, so listing its position here too put the same holding on screen twice and
neither copy said which was which.

There is no filter to switch. The panel on the right is the other half of this
list, not a hidden state, and the old All positions / Manual only dropdown is
gone.

A flow's position stays in this tab. Nothing else on this screen shows it — the
flow's own orders live on that run's dashboard — so leaving it out would be
money with nowhere on the page to see it.

The tab's own count is the number of rows drawn, so the count and the table
never disagree. **Close all is the exception, and it says so**: it closes the
coins a ladder or grid is running as well, so its Positions row can read 5 while
the tab reads 4, and the list names how many of the five are in the panel on the
right rather than in this tab.

### Close all, and the list it opens

**Close all** is the bottom panel's emergency button. It sits in the tab row and
is only there while there is something for it to take off. Pressing it opens a
list rather than doing anything, and the list has three ticks, all ticked
already (decided 24 Aug 2026):

- **Positions** — every open position, real money included. Each real one goes
  through the same close its own row's button uses. They are closed at whatever
  their market costs right now.
- **Watched** — every watched price still waiting. Nothing is bought at it and
  its line leaves the chart. A watch is a row in this app until its level is
  touched, so nothing is taken back off an exchange.
- **Smart** — every ladder and every grid you placed yourself, across every
  wallet, through the same Stop each one has of its own. **It closes nothing.**
  What those orders already bought stays open with its stop still under it.

Untick whatever should stay. Closing what you hold and standing your waiting
orders down are different decisions, and a fast market is exactly when somebody
wants one without the other. Every opening starts with all three ticked again,
because last time's answer was about last time's market.

The button at the foot of the list says **Confirm close all**, and that press is
the confirmation — there is no second window. The three jobs start together and
none of them queues behind another, so a stuck watch can never be the reason
real money stayed open.

The button wears the muted grey and the icon the chart's own toolbar buttons
wear, and its icon is a cross rather than a bin: on the Journal tab it stands
beside **Remove**, which throws records away, and one icon meaning both "delete
these rows" and "sell everything I own" is how a fast press goes to the wrong
button.

#### What the list says before you press

Each row carries its own count, and how much of that count is real money —
"3, 2 real", or just "3 real" when every one of them is, because printing the
same number twice is noise. Under the rows, only the sentences that apply to
what is ticked are shown, so the question stays short enough to actually read
in a hurry:

- Real money gets its own line, counted across only what is ticked, with the
  dollars behind the real positions at today's price.
- **A cancelled ladder loses its plan.** `trading-rules.md` holds that a rung is
  never written off and a ladder ends only when its rungs are used up, so the
  waiting rungs were the plan, and calling them off ends that ladder for good.
- **A plain order still waiting is left alone**, and the line says how many and
  that any of them can buy back in if it fills. Closing positions without
  taking those off is how an emptied account holds coins again a minute later.
  The line says "waiting" rather than "resting on the exchange", because a
  practice wallet's orders wait inside this app and no exchange has heard of
  them.
- **A coin a ladder or grid is running closes with the rest**, and the line says
  how many, because those coins are listed in the Smart orders panel rather than
  the Positions tab and the row's count would otherwise look wrong.

With nothing ticked the list says so, and Confirm close all is still pressable:
pressing it answers with a toast rather than sitting greyed out with no way to
say why.

What Close all deliberately leaves alone: a flow's orders, because the flow
would place them again on its next pass and standing a flow down belongs on that
run's dashboard; and plain orders resting on an exchange, which are cancelled
from their own chart line or their Open orders row.

A refusal is never dressed up as success. Four called off and two refused says
which two are still running, in the exchange's own words, and the two that
refused come straight back onto the screen instead of staying hidden.

## Drawing on the chart

### By touch

A finger opens the chart's order menu by staying still for half a second. A
finger that moves more than eight pixels pans the chart and opens nothing.
Below the 1280-pixel wide layout, the order menu and every order window open in
the same bottom sheet used by the workspace side panels. A tap outside closes
the sheet and does not pass through to the chart.

Order lines keep their thin drawing, but the invisible area a finger can grab
is 44 pixels tall on a touch screen. Dragging that area moves the line and does
not pan the chart. Placing still takes one press on the order window's Place
button. Touch adds no second confirmation.

A small rail of tools sits at the chart's top-left corner, on the candles
rather than in the header row: the header says which market and which
timeframe, and the rail says what the pointer is holding.

- **Two tools: a level and a trendline.** Press a tool, draw one thing, and
  the tool puts itself down — staying armed would turn a stray click into
  another line. Pressing the tool that is already held puts it down too, and
  so does Escape. A right-click puts the held tool down without opening the
  browser menu or the order menu.
- **A level is one click**; a **trendline is a drag from one end to the
  other**, or a tap at each end, which is the only way there is on a
  touchscreen. Either way a dashed preview shows where the line will land
  before it lands.
- **A drawing is kept as a time and a price, never as pixels**, so it comes
  back at any zoom and on any timeframe — a base marked on 4h is in the same
  place on 1d.
- **Drawings belong to the market**, saved against the account, so what is
  marked on BTC never appears on ETH and a second machine sees the same
  lines. Saving is optimistic: a line appears the instant it is drawn, and a
  save that does not land takes it back with a toast.
- **Clicking a line picks it out** — it thickens and takes a soft glow along
  its length, and a trendline shows a handle at each end. Dragging the line
  moves the whole thing; dragging a handle moves that end alone. Pressing
  anywhere else on the chart, or Escape, lets it go.
- **The glow is the focus mark too, and the browser's own ring is turned
  off.** A focus ring draws a box round the whole element, and on a line
  running corner to corner that is a grey rectangle over half the chart.
- **The Tab key reaches every line**, and landing on one picks it out. Delete
  or Backspace throws the focused one away.
- **One line at a time goes from the line itself** — the small × over its
  middle while it is picked out, or Delete on the keyboard — and it comes back
  with **Undo** in the toast that follows. A marked base is work, and a slip of
  the mouse must not quietly erase it.
- **The bin in the rail clears the whole chart**, and asks first. It only
  appears once there is something to clear, it names how many go, and it takes
  this market's lines only — the others keep theirs. There is no Undo on that
  one; the question is asked before it runs instead.
- **The chart underneath still pans, zooms and shows its crosshair.** Only a
  line itself takes the pointer, plus the whole chart while a tool is held.
- Out of scope by the standing decision: alerts on lines and orders on lines.
  Each attaches to the same surface in its own task. Indicators now do —
  see below.

## Indicators

**An indicator is a chart control, so it lives in the chart's controls.** There
is no indicators page and no dashboard behind them. The indicator button sits
in the market header beside the timeframe, and the badge on its icon says how
many are switched on.

- **Each indicator has three separate controls.** Its switch turns the drawing
  on or off. A small mark previews its line colours. The settings button opens
  its window without changing whether the indicator is on.
- **The switches here are a tenth smaller than everywhere else**, 40 by 22
  instead of 44 by 24. This is the one place in the app that is not the shared
  size. Everywhere else a switch is the biggest thing on a settings row; here it
  sits in a 32px strip beside a 12px label and a colour chip, and at full size
  it was the loudest thing in a menu that is mostly words.
- **Indicator settings open in a window, not inside the dropdown.** Every
  indicator uses the same header, card, field and footer layout. The cards keep
  each indicator's own groups, such as **Settings** and **Visibility** for Base
  or **The session** and **Visibility** for Opening range.
- **The cards in that window are the shared `Card`, the same one every modal
  uses** — not a hand-drawn grey block. The EMA window's cards were already
  the shared one, and one window holding two kinds of card is what got this
  fixed. The same cards draw the indicator settings on the automation canvas's
  Signals step, white against the panel's grey.
- Every setting explains itself through the info icon beside its label.
  **Reset to defaults** resets the open indicator's draft. **Cancel** throws the
  draft away, and **Save changes** applies it to the chart and remembers it.
- **Reset all** at the bottom of the dropdown switches every indicator off and
  puts every setting back at its default.
- **Which indicators are on is remembered against the account**, not the market
  and not the browser — the same rule as the zoom, and for the same reason: an
  indicator is how you read a chart, not a fact about one coin. It carries onto
  the next market, the next timeframe and the other machine.
- **The eye after the indicator button opens the View options window.** Chart,
  Your activity and Timezone each have their own card. The five checkboxes show
  or hide the chart grid, volume bars, crosshair, order arrows and your drawings.
  All five start on, and each choice follows the account onto the next market,
  visit and machine. When order arrows are on, **Previous trades** accepts any
  positive whole number for how many finished trades to keep, and an empty
  field keeps them all. Fills from the position still open are never trimmed,
  and picking an older Journal row brings that trade's own arrows back while it
  is selected. Hiding drawings leaves every line saved in place, clears the
  picked line and switches off the paint tools until drawings are shown again.
  The bin still appears when hidden drawings exist because clearing and hiding
  are different actions.
- **Switches in the Indicators dropdown take effect at once.** Settings inside
  either window stay in a draft until **Save changes** is pressed. A save that
  does not land is said in a toast and does not undo what is already on the
  chart.
- **The layer takes no clicks.** An indicator is something to look at: the
  chart underneath still pans, zooms and shows its crosshair straight through
  it, and a drawn line or a stop sitting under a dash is still what the pointer
  finds. It also draws first, so nothing somebody put on the chart themselves
  ever ends up behind it.
- **Levels are worked out from closed candles only.** The bar the feed is still
  filling in cannot confirm a level anyway, and redoing every level on every
  tick would be work for an answer that cannot have changed.

**Base** is the first one, ported from the old Trading app with the same six
settings. It marks the floors price keeps bouncing off (a teal dash and a green
arrow up) and the ceilings it keeps getting turned away from (a red dash and a
red arrow down). The arrow lands on the candle that finished the wait, which is
usually well above the level itself — timing an entry near a level is a
different job.

Two of its settings only thin out the arrows and never the dashes, which is the
answer to "why does that level have a dash but no arrow": **Only mark levels
going the right way** (a base has to be above the base before it) and **Fewest
candles between arrows**.

### Smart orders on live wallets

The Smart order is the same ladder on practice, testnet, and real wallets. The
same state machine owns its base or clicked anchor, rung sizes, two-green entry,
targets, stops, step-down, reclaim, cancellation, and restart recovery. A live
ladder stores Hyperliquid's order IDs and reconciles exchange fills before it
takes another action. If only part of a new ladder is accepted, those orders
are cancelled and no ladder is saved.

**Neither window asks twice.** The ladder and the grid both place on the first
press, on every wallet including real money. There used to be a second,
confirming press on live wallets; Tyler had it removed. Two switches still
stand between a real-money order and the exchange. The server must allow
mainnet, and Real-money trading must be on in Settings.

Once an order or position window sends a change, every box, tick and choice in
that window locks while the answer is on its way. Cancel and Done lock too. The
save button shows its spinner for exactly the same time. A refusal unlocks the
window with every typed value still there, so the answer can be corrected and
sent again without guessing which version reached the exchange.

### The floating order frame

The quick order, DCA ladder and Grid forms use one floating frame on a wide
screen. Each form still opens at the price that was pressed. The frame keeps an
eight-pixel gap from every screen edge while it opens and while it is dragged.
Escape and a press outside close it.

The quick order stays 288 pixels wide and keeps its full form on screen. DCA
and Grid stay 304 pixels wide. Their fields scroll when the window gets short,
and their Place button remains visible because the frame never shrinks below
260 pixels. On a narrow screen all three use the existing bottom sheet instead
of dragging.

Every grab bar uses the same wallet line: the wallet name, followed by its free
cash and the word "free". The title and fields still belong to the order type.
Changing the frame does not change the order sent to the server.

### A stop that rests under the base

A DCA ladder can put its stop on the confirmed base instead of a fixed distance
below the entry. It is on the Stop loss part of both the window that places a
ladder and the one that edits a live ladder's exits, in its own grey card, and
it is a port of the QFL automation from the old app rather than anything new.

- **Bases are read off the 4h**, whatever chart the ladder was placed from. Not
  a setting: the rule was measured on the 4h, and a base found on the 5m is a
  different thing wearing the same name.
- **The base's own two numbers are frozen when the ladder is placed**, so
  nudging the indicator on the chart changes the chart and leaves every live
  stop exactly where it is.
- **There is always a stop.** Until a base has confirmed below what the ladder
  is holding, the plain percent stands. Setting that percent to 100 means price
  would have to reach zero, which is how you say "nothing until the base
  arrives" — and it writes no stop at all rather than one resting at zero.
- **A level above what is held is refused.** That is a place to take profit, not
  a place to give up, and a stop there would close winners as losses.
- **Being stopped is one rung failing, not the ladder failing.** Everything
  sells, every waiting rung comes off the book, and the next rung down is placed
  on its own with a fresh stop under whatever base is there by then. From the
  first stop onwards only one rung rests at a time.
- **The last rung stopping out ends it for good** — nothing is armed and nothing
  is remembered. A ladder whose bets double needs that full stop, or a long
  enough losing run outgrows the pot.
- **Buy back after a reclaim** puts the same rung back for the same money if
  price closes back above where the stop cut and keeps closing above it for the
  chosen number of days. A close back under starts the wait again; a wick under
  does not. It is capped in dollars rather than coins, so a level reclaimed
  months later costs what the rung was always allowed to spend.

### The grid window

Right-click the chart, pick Smart order, then Grid. The window floats where you
clicked and its cards read in the order the decisions are made. What the grid
does with each of these is in `grid-orders.md`; this is what is on screen.

- **Range** starts with **Where the range sits**, a two-item dropdown. "Around
  today's price" keeps the two boxes it has always had, Above % and Below %.
  "Below the price you clicked" swaps them for one, **How far below %**, because
  the top is worked out rather than typed, and adds a line reading **Top buy,
  where you clicked** with that price on it. Where levels sit above the price,
  the card says so and says plainly that placing still buys nothing. Both modes still show the range as
  two prices, the step between levels, and what the whole grid costs.
  Every control works the moment the window opens, on the settings last used —
  the saved grid setup arrives with the page itself, in the same bootstrap
  call that carries the quick-order window's setup, so even the first
  right-click after a reload opens on it rather than on defaults that snap a
  second later. A late-arriving answer never replaces a choice just made in
  the window or moves its preview. The DCA window follows the same rule, and
  the full rule lives in `instant-first.md`.
- **Money** keeps Share of account % and gains **Split between levels**: "The
  same at every level" or "Double at every level down". When it is set to
  doubling, the readout under Range stops saying "Each buy spends" and says
  **Top buy spends** and **Bottom buy spends** instead, because those are now
  two different numbers and one of them is the interesting one.
- **Follow price up** is its own card with a tick box, between Money and the
  finish line. It has no settings of its own, so the card holds nothing but the
  tick box: everything there is to say about it lives on the tooltip beside the
  title, including that the stop slides up too, that the grid never finishes on
  its own, and that levels the same dollars apart stop following once a round
  trip no longer clears the fee. A card with one switch does not get a paragraph
  under it.
- **Finish the grid** was called Take profit and is the same card renamed. Its
  readout says **Grid finishes at**, not "Sells everything at". Ticking Follow
  price up hides this card entirely and switches it off, because a line above a
  range that slides up ahead of price can never be reached, and a setting that
  quietly does nothing is worse than no setting. On the chart the line reads
  **FINISH**.
- **Refusals** are said on the window before the button is pressed, in the
  server's own words. Doubling gets its own: it names the level that is too
  small and offers the three ways out, fewer levels, a bigger share, or the same
  size at every level.

The window that edits a running grid gains a **Following** card between Slices
and Stop loss: the same tick box, a line saying how many times the range has
moved so far, and a warning before it removes a finish line that is already set.

### A placed grid is on the chart at once

Placing one draws it in the same frame the window closes. The server hands the
finished grid back with its answer, and the chart uses that until the next read
carries it.

Without that there is a gap nobody can explain: the window clears its own
preview lines as it goes, and the read that would replace them waits on an
exchange round trip, so the grid blinks off the chart and returns a second
later. It is the same trick the ghost order uses while a plain order is being
placed, and for the same reason.

### What the Smart orders panel counts as a sale

Opening a smart order in the right-hand panel lists what it has sold and what
that banked. Each sale says how long ago it happened, its clock time, and the
gross dollars sold. The exact date and time stays in the hover text. The market
price no longer takes the sold amount's place. The vertical three-dot button at
the row's right edge opens a small popover without blocking the chart. The whole
row turns light gray under the pointer, including the three-dot area. Pressing
the smart order opens its market on the chart and keeps the whole row light
gray while that market is selected.
The market favicon starts each row. The coin, order kind and wallet stay on one
line beside it. Open profit and banked money sit together at the right, with
open profit carrying the made-or-lost colour and banked money kept gray. A
piggy-bank icon labels the banked amount instead of the word. Banked money stays
visible at $0.00 before the first sale, so the amount does not appear and
disappear as the order works. The existing favicon and type sizes do not change
for this layout.
A grid's waiting and completed counts live inside that popover, such as "3
waiting · 7 completed", followed by how many dollars it still holds to sell.
The old price-range line repeated what the chart already shows and did not say
how far the grid had got.
Two rules decide what appears in the opened sale list.

- **A sell out of a long-only order is a sale**, whether or not the venue put a
  figure on it. Grids and ladders are long only, so a sell on their coin is a
  sale. A short bought back counts too, through the profit the venue states on
  it.
- **Money the venue never stated is shown as a dash, never as zero.** Zero is a
  real answer meaning the sale broke even. KuCoin reports money per position
  closed rather than per fill, and a grid selling part of what it holds never
  closes a position, so its sales arrive unpriced. The panel lists them, leaves
  the figure blank, and says underneath how many the total is short of.

## Orders on the chart

An order is placed by right-clicking the candles at the price you want, and
from then on it lives on the chart as its own line with a coloured bar at the
right-hand end.

With a position open, the same menu offers Take profit when the clicked price
is on the winning side of the entry and Stop loss when it is on the losing
side. Stop loss draws at the clicked price as soon as it is picked, while the
wallet saves and refreshes in the background. Take profit opens a small window
at the clicked level, matching the limit-order window. It chooses how much of
the still-unassigned position comes off and shows the profit at that price, so
100% always means everything left after earlier targets. The full Stop and
target window can hold up to three rows, with a running figure showing how much
of the position they cover. The chart draws one labelled line for every target
while the wallet saves in the background. The Take profit shortcut stays in
the menu until the position has three targets. A stop already set keeps the
Stop loss shortcut out because its chart line is the place to change it.

A live take-profit or stop-loss order appears once, as its coloured target or
stop bar. Each target label states the dollars sold and the profit at its
price. This includes a grid's own STOP LOSS line. The chart does not draw the
exchange's copy of that order as a second gray Sell bar.

The Entry bar is chart blue. It does not borrow the account accent, so changing
the theme cannot turn the entry into the colour of some other kind of line.

A position's stop can be dragged past its entry after price moves in the
trade's favour. This trailing stop protects profit. It must remain below the
current price for a long, or above the current price for a short, so setting it
does not close the position immediately.

- **A waiting order shows its stop and its target too**, in the same green and
  red as a position's but in a finer dash — they are where the trade will get
  out once the order fills, which is a plan rather than a fact. The bar says
  what each would pay in dollars if it got there. Neither can be dragged: they
  hang off the order's price, so the order's own window is where they change.
- **Pressing a waiting order's bar opens that window** — how much the order is
  for, and where it gets out. Not its price: the price is the line, and you
  drag it. The window shows what the size costs in dollars and how much of your
  own cash is behind it, and the same window is what the ⚙ on the bar means.
- **Placing an order does not wait for the exchange.** The window shuts on the
  press and the order is drawn on the chart at once, labelled "sending" until
  the answer lands — a second or two later. A "sending" line has no × and
  cannot be dragged; there is nothing on the server yet to change.
- **Nothing is announced when it works.** No toast for placing an order and
  none for cancelling one: the line appearing and the line disappearing is the
  answer, and a toast on every click of a trading screen is noise. Refusals
  still speak up, and so does the one case that must never pass quietly — a
  real order that went on without the protection asked for.

### Buying more of what a position holds

Every position row carries a **+** button beside its cog, labelled "Add to the
BTC position". One press does what used to take five: it charts that coin,
switches the traded wallet to that row's wallet, and opens the same order window
a right-click opens, over today's price, on that position's side. The size box
is the only thing left to fill in, and it starts empty and focused.

- **The chart and the wallet both move before the window opens.** Two wallets
  can hold the same coin, and a window that opened before the switch landed
  would put the order on the wallet you were looking at rather than the one you
  pressed — which is the mistake this button exists to remove. The window also
  names the wallet inside itself, so a wrong one is readable before the press.
- **Adding never changes leverage.** The window shows the position's own
  leverage as a line and offers no slider. `placeLiveOrder` sends null for
  leverage and margin mode whenever a position already exists, and the exchange
  keeps what it has, so a slider here would be a promise the order cannot keep.
- **The window says what it is adding to, and what the position becomes**:
  "Adding to $500 long in Main wallet, at 3× leverage. After this order: $750 at
  an average of $98." Both figures are what was paid, never what it is worth
  today, so $500 plus $250 reads as $750 and the average is a number anybody can
  check. It re-reads itself as the size is typed.
- **A position that closes under the window takes the window with it.** The
  window is looking at what that position IS, resolved live, not at a copy of
  what it was when the button was pressed.
- **It refuses out loud rather than doing nothing.** A wallet that is switched
  off, a live wallet with no trading key, and a market the exchange has stopped
  listing each say so and nothing moves.
- **Nothing about the order path changes.** It is placed exactly as the
  right-click window places one: a watched trigger by default, resting only if
  Settings say so, chasing as a maker when price reaches it. There is
  deliberately no "double it" press that skips the window — the window is where
  the size is chosen and where the real-money check happens.

### Selling part of a position

The bin on a position row opens a window asking how much comes off, in dollars
or in coins, with 25%, 50% and All of it as presses that fill the box. It starts
on all of it, so the old one-press behaviour needs nothing filled in.

- **All of it and part of it are sold differently, and the window says which.**
  All of it is a market order. A part is a reduce-only limit that follows the
  price and never pays the spread, which is what the trading rules ask of a
  close.
- **It says what happens to the rest**, in dollars, including where its stop
  is. A refused amount says why above the button, with the box outlined.
- **An amount leaving less than the exchange's smallest order sells all of it.**
  A scrap under the floor could never be closed again. See `part-close.md`.

### Leverage and the cash behind a position

Every position row also carries a gauge button, labelled "Change the BTC
leverage and margin". It opens a window with two boxes, each with its own
button: the leverage the position runs on, and how much of your own cash is
behind it.

- **The button is hidden where the exchange allows neither**, and the window
  says the exchange's own reason for the half it cannot do. Hyperliquid allows
  both today; Aster allows leverage but will not lower it while a position is
  open; Phemex and KuCoin allow neither yet.
- **The liquidation figure on the window is this app's estimate and says so.**
  What the row shows afterwards is the exchange's own figure, read back —
  nothing about the change is written down here.
- **Taking margin out is refused when it would bring liquidation inside the
  stop**, with both prices in the sentence. Already being inside is not the
  same as being brought inside, and only the second is refused.
- **A practice wallet is refused rather than faked.** The practice engine has no
  lender to renegotiate with, and the window says that instead of drawing boxes
  that would pretend otherwise. See `position-margin.md`.

## The market list

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
  search box of its own.
- **On testnet, the amber strip sits at the panel's foot** with the Back to
  Mainnet link, exactly as it did on the old market list panel.
- **The panel opens at a fifth of the workspace.** The width is still yours to
  drag and is remembered per browser, so a width you have already dragged to
  wins over this.
- **A row is the symbol and the day's move, nothing else.** The percentage is
  signed and sits in a soft pill of its colour — green up, red down; the price
  belongs to the market header; a market with no yesterday price shows a plain
  dash, not a zero in a pill.
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
- **The market header's (i) tooltip names both kinds of price.** The list and
  every order rule use the exchange's mark price. Chart bars show traded
  prices, so the newest candle may sit above or below the number the exchange
  uses for stops and account value.
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
`watched-orders.md` explains — and those levels were only ever visible one coin
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
  the panel itself exists. `watched-orders.md` says what is kept and why it is
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

## The protocol layer (where the exchange lives)

- Screens draw `MarketRow`s from `src/lib/protocols/contracts.ts` — never an
  exchange's raw response. A market is identified by protocol + network + id.
- Everything Hyperliquid is in `src/server/protocols/hyperliquid/`, the only
  folder allowed to import its SDK. `fence.test.ts` fails the suite if it
  leaks, or if shared code ever asks `=== "hyperliquid"`.
- Adding an exchange is a new folder plus one entry in
  `src/server/protocols/registry.ts`, followed by its own dashboard. The
  current Trade dashboard remains Hyperliquid-only.

Two things the old Trading app had that this does not, on purpose:

- **No separate account panel.** The wallet in use belongs beside the chart
  controls because every order drawn on that chart goes to that wallet. Wallet
  management opens from the same control without taking chart space.
- **No order book or trades tape panels.**

## How the panels behave

The same panel parts as the Automation Canvas, not a second system. Anything
fixed in one is fixed in both.

- Every visible divider drags.
- **Left and right shut all the way to nothing.** A slim tab appears on the
  middle panel's edge where each one disappeared, and brings it back.
- **The bottom never disappears.** It shuts down to its own tab row, which stays
  on screen with its counts, and the divider above it stays draggable.
- **Positions open with the most Unrealized P&L first.** The largest current
  profit sits at the top and losses fall underneath it. The Unrealized P&L
  heading shows that order and reverses it when pressed.
- **Double-clicking the blank part of a panel shuts it.** Double-clicking what
  is left opens it again. A double-click on a button, a box or a word is that
  control's, never the panel's.
- **Sizes and shut panels survive a reload**, remembered per browser.
- A saved set of panel sizes returns only while its panel names still match the
  current screen. When a redesign replaces a panel, the old sizes are ignored
  and the current layout opens at its defaults instead of stopping the page.
- **Pressing a tab in the bottom panel grows it to fit that tab's rows.** Six
  waiting buys means all six on screen without touching the divider. The panel
  grows through the same resizable panel the divider drags, so there is one
  thing setting the height rather than two fighting over it.
- **It grows to the rows or to half the workspace, whichever is smaller.** The
  chart always keeps the other half. Past that the table scrolls inside the
  panel; the page itself never scrolls.
- **The tab you are already on opens the panel too, and closes it again.**
  Press it and the panel grows to fit that tab's rows; press it once more and
  it goes back to the height you had dragged the divider to. That is the press
  you make when the rows you want are already in front of you and there are not
  enough of them on screen, so it can never be the press that does nothing.
- **A panel shut down to its tab row opens when its tab is pressed**, to the
  height the divider was left at. Pressing again then grows it to fit. It opens
  rather than growing straight to the rows because the panel learns the height
  to reopen on from whatever height it was shut at, so a panel shut while grown
  would reopen on the grown height and then remember it, which is the one thing
  the grown height must never become.
- **A double-click on blank space shuts the panel from any height**, grown or
  not, and opens it again on the dragged height. The gesture is told plainly to
  shut or to open rather than to toggle, because a toggle judging the panel
  after the growing had already been undone shut it and reopened it in the same
  motion, on alternate tries.
- **The grown height is never remembered.** A reload opens on the height the
  divider was left at, which is what the rule above already promises. Dragging
  the divider after growing wins: the new height is the one remembered and the
  one a second press returns to.
- **Growing never makes the panel smaller.** A tab with two rows in it leaves
  the divider where it is.
- **A table still loading grows nothing.** Neither does one whose read failed.
  Both draw a single message where the rows would be, and fitting the panel to
  a sentence is not fitting it to the rows.
- **The panel jumps to the new height, with nothing animating.** So the
  reduced-motion setting has nothing to switch off here, and a chart in the
  middle of drawing is not redrawn thirty times on the way.
- **The column headings stay on screen while the rows scroll.** All three
  tables down here pin their heading row to the top of the box it scrolls in,
  so scrolling a long Journal never leaves you reading eleven unlabelled
  columns of dollars. The pinned row is opaque, because rows slide underneath
  it, and it takes the same hairline under it that every other table in the app
  draws. Nothing is covered until something is scrolled: at rest the headings
  sit exactly where the first row begins.
- **The market list's headings stay put the same way.** That list scrolls in
  the table's own box rather than a scroll area, which is the thing that makes
  it work: a table always wraps itself in a box that scrolls sideways, and a
  box that scrolls sideways is what a pinned heading inside it holds on to. The
  sideways box has the height now, so one box scrolls both ways and the heading
  has something to hold on to. It used to be 10,889 pixels tall inside a
  separate scrolling box, so it never scrolled and the heading never stuck.
- **A tab press never leaves the table highlighted.** The press moves
  everything under the pointer, and the browser finishes by highlighting
  whatever ended up between where the press started and where the content
  landed, which turned a whole table blue. Any highlight left by a press is
  dropped once the press is over. Nobody selects text by pressing a tab, so
  there is nothing lost.
- **Journal rows can be removed one at a time or many at once.** Every row
  keeps its own bin, and every row also has a checkbox. Ticking rows puts a
  Remove (n) button in the tab bar — the button is only there while something
  is ticked — and the checkbox in the table header ticks or unticks every
  listed row. One row or many, the same confirm asks first, and confirming
  only hides the fills behind the trades: a practice wallet's cash is added up
  from its fills, so nothing about the money moves. Ticking a row never draws
  its trade on the chart, and a tick disappears with its row when a refresh
  takes the trade away, so Remove (n) can only ever mean rows on screen. The
  Journal is the one table down here with checkboxes on purpose — positions
  and open orders are a live readout where a row can close itself between the
  tick and the button, so their actions stay one row at a time.

## Narrow screens

Designed with the wide one, not bolted on.

- The middle panel takes the whole width and stays the main thing.
- Two labelled buttons in the market header slide the side panels in. The
  Markets sheet holds the full market list. The Smart orders sheet holds Smart
  orders and Bots. Wallet management stays in the chart header on every width.
- A sheet closes toward the same edge it opened from. Closing Smart orders
  keeps the sheet on the right until it is gone; it never turns into Markets on
  the left during the closing animation. The panel completes that exit in
  150ms instead of drifting a short distance and then disappearing. Reduced
  motion removes the animation.
- The bottom panel stays where it is — it already works at any width.
- A slid-open sheet closes when the window crosses the width boundary, in
  either direction.

## Stand-in figures

While a part of the page is not connected to anything, its numbers are made up,
and they have to say so three ways at once, because any one of them can be
missed:

- **Quieter and dashed-underlined** — the shell's `SampleValue`.
- **A "Sample" badge in words** on the panel, for greyscale and screen readers.
- **Hovering says it plainly** — "a stand-in figure".

A stand-in figure is never coloured green or red. Colour is what makes a made-up
number look like a real one.

Watch for this: putting an `inline-flex` box inside `SampleValue` stops its
dashed underline painting at all. Arrows and icons go beside the figure, not
inside it.

## Empty states

Every panel says something true about itself rather than "coming soon". The
Words written for an empty panel are the same words a brand-new account sees on
the finished page, so the empty page gets designed once, at the start. The
middle panel draws its header only for a real market. No selection and an
unavailable market leave the header out rather than drawing a substitute. On a
narrow screen, either state opens the Markets sheet so the missing header does
not remove the way to choose a market.

- Chart — "The chart goes here." Under it, "Pick a market from the list and its
  candles draw in this space." It never names a side of the screen, because on a
  narrow screen the list is behind a header button and there is no left. It
  never writes "the Markets list" either: no panel on this page carries that
  caption, the sheet's "Markets" title is read only by screen readers, and
  Settings has its own Markets tab that the sentence would be confused with.
- Account — "No account connected yet."
- Positions / Open orders / Fills — each says what would be there.

**A table with nothing in it keeps its column headings.** The empty words are a
row inside the table, spanning every column, sitting under the real heading
row. They are never a paragraph drawn instead of the table. Closing your last
position therefore leaves the headings where they were and the bottom panel
does not jump, which matters because that jump used to land at the exact moment
a position closed. Still reading and a failed read already worked this way; the
empty state now matches them, and the three answers stay separate — a table
never says "nothing here" before a read has really landed.

When the exchange returned no markets to show, the market list says "The
exchange is not listing any markets right now." The middle panel adds no second
header for the same failure.

## Still reading

**"Nothing here" and "I have not looked yet" are different answers**, and on a
screen listing money only one of them is safe to act on. Every panel that
fetches its own contents says which one it means.

**A return visit starts with the last complete answer this browser saw.** The
wallet menu and Smart orders panel cache their last answer for each signed-in
account and exchange, including an empty answer. The cached rows stand in only
until the first fresh read lands. A different account or exchange never sees
them. Cached wallets can only draw the panel. They cannot choose where an order
goes or open wallet settings. A first visit, a cleared browser, or a cache
written by an older build still uses the reading state below.

- **One treatment, and it is the shared spinner.** `loading-row.tsx` states the
  rule the whole app follows: a compact centred spinner sitting in the
  surface's own frame, never a skeleton. The wallet menu used to draw five
  grey bars instead, which on a card of figures read as money arriving.
- **The waiting words name what is being read** — "Reading your wallets",
  "Reading your smart orders", "Reading what you are holding". Whoever is
  looking should be able to tell which panel is slow. The wallets and Smart
  orders panels show these words only when this browser has no saved answer to
  stand on.
- **A count nobody knows yet shows nothing**, never a zero. The Smart orders
  header says "none working" only once the read has landed; before that its
  count is blank, because a zero is an answer the panel does not have.
- **A flow's trading button keeps its place while its first status is read.**
  The button says "Reading trading status" with the shared spinner until the
  answer lands. A failed read keeps the button on screen and says what failed
  in the error toast; later reads keep the last complete status rather than
  opening a gap in the header.
- **The flow status popover leads to the run.** When the flow has a run id, its
  name and figures at the top of the popover form one keyboard-reachable link
  to that run's dashboard. Pause, Stop, Try again and Open the dashboard keep
  their own jobs. A status without a run id shows the same summary without a
  link. The run chart does not repeat the old notice that more orders may
  appear while the run is switched on.
- **Both halves have to land.** The trading read comes back in two pieces,
  practice and real, and either may be first. A person whose ladders are all on
  real wallets holds an empty practice half for a second or two, and that half
  is not an answer. Every panel waits on `settled`, never on `loading`.
- **The market list has no waiting state and does not need one.** Its markets
  arrive with the page rather than being fetched by the panel, so there is no
  moment where the list is on screen and its markets are not. A retry after a
  failed read keeps the rows it already had, which is a refresh rather than a
  load. The Watched row above it does fetch its own contents, and it uses the
  spinner like everything else.
- **The chart is the one exception and it is deliberate.** While its candles
  load, the whole empty chart surface fades gently in and out instead of
  showing a spinner. See "The Trade workspace" above, where that decision is
  recorded.

## Live prices

The page keeps itself current instead of freezing at load. One connection per
exchange streams every market's figures about once a second; the chart's
working bar streams beside it.

- **A tick repaints only what moved.** Each row and the header tooltip
  subscribe to their own market; unchanged markets stay silent. The list's
  ORDER stays on the loaded snapshot on purpose — rows shuffling under the
  pointer every second would be worse than a sort that catches up on the next
  refetch.
- **Silence is the outage.** Feed health is judged by data arriving, not by
  what the socket claims: a quiet spell tears the connection down and
  rebuilds it on a capped backoff. (An on-screen "prices may be stale" label
  existed briefly and was removed on 7 Aug 2026 at Tyler's direction — the
  feed heals itself without announcing it.)
- **Recovery refetches.** The first tick after a gap re-pulls the market
  snapshot and the chart's candles, so nothing that moved during the outage
  lingers on screen.
- **A hidden tab lets the connection go** and reconnects — with the same
  catch-up — when you come back.

## Backtest results

- The Results table calls each coin's main figure Total because the figure
  includes closed trades and any position still open at the final price.
- A coin with an open position shows its open profit directly under Total. The
  table total shows the same split across every coin, so a large paper profit
  cannot look like money from the closed trade count.
- The Trades table puts the open profit in each open row's P&L column. Several
  open rungs share fees and funding by position size, and their figures add up
  to the open total in Results.
- Runs saved without the trade figures needed for the split say that open P&L
  is unavailable. The app never treats an unknown amount as zero.
- If the selected market's candle read fails, the Trades panel shows the same
  error and Try again action as the chart. A failed read never leaves the panel
  saying that trades are still loading.

## Backtest candle history

- A backtest result opens on the first market in Results and the first trade in
  Trades, so its chart is useful immediately. Each run remembers the last
  market and trade chosen in this browser and restores them when reopened.
- Backtests save finished candles in the app database by full market key and
  candle size. Running the same window again reads those rows without asking
  the exchange again.
- The selected protocol is also the history source. Hyperliquid markets use
  Hyperliquid candles and Binance markets use Binance candles; prices are never
  substituted across exchanges.
- Downloads are saved page by page, so a failed request resumes at its missing
  page. Every missing candle stretch stays visible as a recorded gap.
- Hyperliquid keeps a limited history. A window beyond that history shows the
  shortfall; adding a fallback source requires a separate decision.

## Backtest funding

- Perpetual-market backtests use the exchange's saved historical funding rates
  at every settlement. Positive funding costs a long position; negative funding
  pays it.
- The dollar payment uses the replay's stored historical price at that time.
  The funding endpoint does not include the exchange's historical oracle price,
  so this is the same price history used for the rest of the replay.
- The result lists **Funding paid** directly below its fee and slippage settings.
  A negative figure means the position received more funding than it paid.
- Any missing market or settlement stretch appears in the result warning. It is
  never silently described as free.

## Rules that hold everywhere

- **Every action shows its answer at once, and the exchange is told
  afterwards.** Opening, closing, cancelling, and dragging a price, a stop or
  a target all change the screen on the press. Nothing waits on a round trip
  to the venue, because a venue takes one to four seconds and a screen that
  sits still for that long reads as a press that did not land — which is how
  people end up pressing twice.

  **A held answer ends when the data agrees, never when a read merely lands.**
  Each of those actions keeps a hold — a note saying "show it this way for
  now". A read already on its way when the action started knows nothing about
  it, so letting that read end the hold snapped the line back to where it was
  and then forward again a moment later. It looked like a delay, and it looked
  like a _different_ delay on every exchange, because it was really a race
  with whichever venue's read happened to be slowest.

  So a cancelled row stays hidden until it is really gone, a dragged price is
  held until a row comes back carrying it, and a just-placed order is held on
  screen until the real one appears — never a gap between the two, and never
  a "sending" row that vanishes before its replacement arrives. A hold gives
  up after thirty seconds so a venue that never agrees cannot keep the truth
  off the screen, and a refusal releases it at once and says why.

  **This lives in one place on purpose** — `use-trading.ts`, which never knows
  which venue a row came from. An exchange added tomorrow inherits all of it
  without writing a line, and no exchange can get it subtly wrong on its own.

- **Never swap a missing market for a different one.** If a saved market is gone
  or unavailable, say so. Never quietly fall back to BTC or anything else.
- **An unavailable action explains itself.** Never hide the reason, and never
  quietly change what the user asked for into something that is allowed.

  **An incomplete form keeps its main action pressable.** The action becomes
  unavailable only while the app is saving. Leaving a bad box or pressing the
  action shows the reason in one red sentence. Pressing also shows the same
  reason in a toast, so the button always answers. Every window that can refuse,
  including the ladder, the grid, the order window, the stop-and-target window,
  the running grid's window and a live ladder's exits, draws the sentence
  through `order-refusal.tsx`. Floating chart windows place it directly above
  the button. A modal places it beside the footer buttons, where a scrolling
  body cannot carry it out of sight.

  The words name the box and what would fix it, in dollars wherever money is
  involved. Never a code and never a field name out of the source. The box at
  fault carries `aria-invalid` after the person leaves it or tries the action,
  so the eye and the screen reader are pointed at the same place. The button
  points at the sentence with `aria-describedby`. Typing an unfinished number,
  such as `0.`, does not mark the box as wrong before either of those moments.

- **The exchange and network stay one glance or one hover away** wherever a
  market or an account could be read as belonging to the wrong one — the
  search box names them outright, the market header holds them behind its
  info icon. (Softened from "always visible" on 6 Aug 2026, when the header
  chips were traded for one clean row; if a second exchange ever makes the
  hover too easy to miss, the labels come back on screen.)
- **Every icon-only control has a label**, focus stays visible, and every panel
  is reachable with the Tab key alone.
- **A real dollar never reads as a pretend one.** Rows a live wallet owns
  carry an amber "Real" badge in every table, and the order window's button
  turns into a said-back-in-dollars question ("Real money in <wallet>: buy
  about $X…") that must be pressed a second time before anything is sent.
  A live Smart order follows the same rule and confirms the ladder's buy count
  and maximum cost.
  Figures the exchange did not report (a live order's leverage) show as
  dashes, never as made-up zeros. A live position's fee total is the one that
  is counted rather than dashed, and it carries its own honesty rules — see
  "Fees beside profit" in `reading-the-figures.md`. The warning is all
  in front of the press; nothing is said afterwards, real or pretend — see
  "Orders on the chart".

The wallet details window on each exchange dashboard shows settled trade
profit since midnight on the start day, 20 August 2026, in Toronto, and current
open profit. Its final row is Made or
lost: those two figures added together. It does not use the wallet's opening
balance, so older profit, deposits, and withdrawals cannot move either profit
row. When KuCoin has not stated the profit for a partial sale, an info mark
beside Settled says that both totals are short and names the missing trades.

## The trading overview

`/admin/trading-overview` answers the account-wide money question without
belonging to one exchange. PnL Graph, short for profit and loss, is the main
card. Its heading puts Made or lost first, then names the account balance and
fees underneath. The old headline figures, Wallets card, and Money over time
card are gone. Their answers now share this one card, so a wallet and the line
it produced can be read together.

The left side starts with All wallets and then lists each real mainnet wallet.
Every answered row has the wallet's balance, Made or lost, and a small line over
time. Settled, open, and fee figures appear once at the bottom of the wallet
pane for the selected wallet. Selecting All wallets shows the account-wide
breakdown there. The graph pane stays clear for the money-over-time chart.
Switched-off wallets stay out of PnL Graph. A wallet whose exchange did not
answer stays named as a failed answer. It never becomes a row of zeroes. The
All wallets row starts selected. The selected row has a light gray background,
a 2px high-contrast right border, and a heavier wallet name. Every row reserves
the border's width so changing the selection does not shift its contents. Every
answered wallet row has a hand cursor and can be selected by mouse or keyboard.
Selecting one makes its chart line strong and quietens the other lines. The
right side draws the All wallets line strongly
and each answered wallet as a lighter line. Hovering the chart names the date
and the amount for every line. Hovering a wallet's small line keeps its dot and
opens a readout with the date and that wallet's result at the marked point.
The mini graph is a plain line and does not draw a filled block when it is
clicked.
The Wallets and Made or lost headings sort the wallet rows in either direction.
All wallets is an account summary and stays pinned first. Unavailable results
stay at the bottom when sorting by money. The last sort is remembered in this
browser.

The graph records results from midnight on 20 August 2026 in Toronto through
the latest account read. Controls in the card's top-right space show one week,
one month, three months, six months, or all recorded results. The two calendar
fields set an exact start and end date, and Reset returns to All. Every wallet
line changes together. Filtering crops the graph without changing the current
account and wallet figures. Dates outside recorded history show that no results
fall inside the range. The graph does not carry the last known result into days
the app has not read.

Active Trades is the account-wide exception to the real-money totals. It lists
every open position across every protocol and every wallet, including practice
and testnet wallets. Each row names its account type so pretend money cannot be
read as real money. New dashboards put Active Trades under PnL Graph;
an account with a saved arrangement finds it under Settings → Widgets until it
is placed.

The Active Trades table has five columns: market, protocol, wallet, current
position value, and current profit in dollars and as a share of the money the
trade holds. Value is the absolute position size at the current market price,
not the margin committed to the trade. The
market cell copies the bottom Positions panel: a 16px icon, 12px medium symbol,
the compact Long or Short and leverage badge, then the compact Real, Testnet, or
Practice badge. Clicking the symbol or anywhere else on the row opens that
market on its protocol's chart. The Market column takes only the width its
ticker cluster needs, so resizing the widget keeps every column visible. Trade
rows use 10px of vertical padding, 2px more than the bottom Positions panel, to
give the list a little more air without changing its type size. The table opens
with the largest P/L first. Every heading sorts, and Filter narrows the rows by
protocol, wallet, or both. A wallet that could not be read does not add an
orange warning row above the trades that did answer. When no trades answer, the
empty wording still avoids claiming that every wallet was empty. A market whose
current price could not be read shows a dash for both value and profit, never a
made-up zero. A plain divider sits
between every pair of trade rows, including the final two. The sticky table
header uses the lighter muted gray rather than the full muted background. Every
Active Trades column is left-aligned, including Value and P/L.
The footer stays at the bottom of the widget while the trades scroll. Total
adds the value and current profit for the rows shown. Filters update the total.
If any shown trade lacks a figure, the affected total uses a dash instead of
presenting a partial answer as complete. The footer does not show averages.
The PnL Graph and Trades cards use the same card, text, divider, and muted
background rules as the rest of the dashboard. Money values use the dashboard's
semibold tabular monospace treatment.

Running bots is the fourth trading-overview widget. A new or reset dashboard
puts it in the left column, beside All trades. A saved arrangement keeps its
choices and finds Running bots under Settings → Widgets until somebody places
it.

Running bots uses the same table shape as Active Trades. Its columns are
Automation, Status, Markets, Positions, and Made or lost. Markets is how many
markets the automation watches. Positions is how many of those markets still
hold an open position from the current run. When several runs added to the same
open position, the run whose earliest recorded order opened it gets the count.
Later runs do not count the same position again.

Running bots also copies Active Trades' row type. Automation uses the same 12px
medium text as Market. Status uses the same 12px muted text as Protocol and
Wallet. Markets and Positions use the same 12px monospaced numbers as Value.
Made or lost uses the same 12px type and medium-weight dollar figure as P/L.

Each automation gets one row. When an automation has run more than once, its
newest run supplies the status, counts, money, and dashboard link. Running
comes first, followed by waiting, paused, stopping, and stopped. Waiting uses
the same explanation as the run dashboard. Every heading sorts its column. A
flow that stopped without a person pressing Stop stays in the table until its
run is deleted or the flow is started again. A flow stopped by hand leaves the
table. Backtests never enter the widget. The widget chooses the newest run of
every automation before the history page's 200-run display limit is applied, so
one frequently restarted automation cannot hide another.

The whole row opens `/flow-runs/$runId`. The table scrolls inside the card when
there are more rows than its height can hold. An empty card says "No running
bots" and links to the automation canvases. The rows arrive in the same server
answer as the other overview widgets, with no timer of their own. A row keeps
its last banked dollar figure until the overview is read again.

Practice wallets never enter a number on this screen. If one real wallet cannot
be read, the rest of the screen stays up, the missing exchange is named, and
every affected total says it is short. A failed read is never drawn as an empty
wallet.

Testnet wallets do not appear in PnL Graph. Made or lost is settled trade money
plus current open profit. Deposits and withdrawals can change Balance but never
profit.

Fees are the exchange's stated charges on every fill in the same window,
including a fill whose profit the exchange did not state. Made or lost stays
the net figure Tyler reads first; the fee note explains part of that result.

The Journal starts with the newest bounded page so the four-second account poll
does not grow slower as a wallet ages. Show older reads and appends the next
page without changing that poll. The pages overlap their boundary timestamp so
fills recorded in the same millisecond do not fall through the join. If a page
cuts through a trade, the next page also rebuilds the trade whole. Once an empty
page comes back, the control says That is everything.

Each line starts at zero on the start date and adds priced settled trade money
until now. Its final point adds current open profit. Opening balances, deposits,
withdrawals, and older fills never enter a line. If an exchange did not state a
trade's money, the chart names how many trades are missing instead of counting
them as zero.

The trades table uses the money each exchange stated. A KuCoin sale that did
not close the position has no stated profit, so its Money cell is a dash. The
Money column's header tooltip and the chart header say how many trades their
total is short of. An unstated figure never becomes zero. Trade rows are grouped
by day and keep market, side, time, exchange, wallet, money, size, and fee in a
compact four-column table. The Filter menu narrows the table to one exchange,
one wallet, or both, and Clear all restores every trade. A fill hidden from the
Journal stays hidden here too.
Trade rows inherit the dashboard's Inter typeface, including market names and
Money values. Their numbers keep tabular spacing without switching to a
monospace face.

Settings has two Widgets tabs and they do not share an arrangement. The
trading Widgets tab sits in the "This app" card and saves its top, left, right,
and hidden lists per account in `trade_prefs`. The platform Widgets tab sits in
the "Platform" card and saves the platform Overview arrangement in the shell
settings. Moving or resetting a card in one tab never changes the other.
The trading Widgets route arrives with its saved arrangement, and the Markets
route arrives with its saved daily-volume cutoff. Neither app settings panel
shows loading copy while a browser request catches up after mounting.

## Trading engine settings

Settings → Trading engine uses three full-width cards. Trading engine comes
first, followed by Safety and Orders.

The route arrives with the engine, liquidation warning, Aster margin, and plain
order style already read. The page never replaces itself with "Asking the
server" or draws empty setting rows while four browser requests finish. Aster
checks its saved margin against the exchange after the page is visible.

The Trading engine card puts its six figures in two rows of three. Price feeds
sit beneath them as one chip per exchange. An error appears above the figures
and can be dismissed. Engine, Trading, and Restart stay together in the card's
footer. The title row has no subheader and a divider separates it from the
status below. The title row uses the compact spacing left after the subheader
was removed. The page does not print a separate "Read just now" line because
Last heard from already gives the useful time.

The Safety card holds Real money, the liquidation warning, and the real-money
switch in separate horizontal rows. The Orders card holds Aster margin and the
choice between resting and watched plain orders in the same row style. Each row
puts its control on the right when there is room and beneath the words on a
narrow screen. The wallet, dollar-distance, and out-of-100 controls keep their
own visible labels in both layouts.

## Engine health notices

Engine health goes through the notification tray that the rest of the app
already uses. The notice is about the app failing to work. It is not a price
alert, a chart-line alert, or an order alert. Those alerts remain out of scope.

The app's background pass checks the trading engine every 15 seconds. The engine
writes its own heartbeat every 5 seconds. A heartbeat older than 45 seconds,
which is three checks by the app worker, counts as an outage only while the
Ladders switch is on. Switching Ladders off on purpose clears the outage memory
and sends nothing. The same is true when Ladders goes off and back on between
two checks: the old outage is cleared, and only a later missed heartbeat can
start a new one.

Switching Ladders back on starts a new 45-second window. A heartbeat left from
before the switch cannot cause an immediate outage notice. Pausing the engine
does not reset the health clock because a pause and a restart are different.

The 45-second line comes from the engine copies retained from 20 to 22 August 2026. Eleven measured restarts took between 7.475 and 12.318 seconds. A normal
replacement is therefore back well before the app calls it an outage. Since the
monitor checks every 15 seconds, the notice arrives 45 to 60 seconds after the
last heartbeat.

The outage notice reads:

> The trading engine stopped at 3:12 AM EDT
>
> Watched orders and ladder rungs will not fire until it is running again.

The time uses Toronto's current EST or EDT name. Later checks stay quiet. When
the heartbeat returns, one all clear reads:

> The trading engine came back at 3:15 AM EDT
>
> It was unavailable for 3 minutes 12 seconds. Watched orders and ladder rungs
> are working again.

The outage start is the last heartbeat. The return is the first heartbeat that
the monitor sees after the outage. The app keeps one outage row while the engine
is down, then deletes the row after writing the all clear. A later outage can
therefore make its own pair without one outage producing a message every 15
seconds.

The tray uses its existing announcement-shaped message to carry these words.
The app turns its banner off, so the health message only appears in the tray and
notification list. The matching record remains in Announcements history because
the shell keeps an announcement's words there.

## Where the navigation lives

The sidebar and the signed-in home page are Settings, held in the app's
database — not in code. Trade is a copy of Custom Shell, and an app never edits
a shell file, so these are changed on the Settings screens:

- Settings → Sidebar — the **Trading overview** link to
  `/admin/trading-overview`.
- Settings → General settings — the admin and member home pages, both
  `/admin/trading-overview`.
