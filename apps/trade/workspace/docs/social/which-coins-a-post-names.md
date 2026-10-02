# Which coins a post names

Trade reads the words of a post and works out which markets it is about. "$SOL",
"solana", "sol" and "SOL" all become the SOL market Trade already trades. A post
naming nothing is marked as naming nothing, which is an answer and not a
failure.

**Coins always, and stocks only if the member asked.** One switch in
Settings → Social adds stocks, metals and currencies, and it starts off. See
"Stocks, metals and currencies" below for why.

This is what the Markets panel on a creator's dashboard counts, and what the
chips on each post row say. `social-dashboard.md` covers the rest of that
screen.

**It costs nothing.** No model, no request to anybody, one pass over the words.
That is deliberate: it has to be cheap enough to run over every post held.

## The three rules, and there are only three

- **A dollar ticker.** `$SOL`, `$sol`, `$Sol` all count. The dollar sign is the
  person saying they mean the coin, so this rule beats everything below,
  including the stop list.
- **A bare ticker in capitals.** `SOL` counts. `Sol` and `sol` do not. The word
  has to stand alone: `SOLs` and `resolve` are not SOL.
- **A written name, whatever the capitals.** `solana`, `Solana` and `SOLANA` all
  count, and so do the short spellings people type in lower case, such as `eth`
  and `btc`. Two-word names work: `shiba inu`, `bitcoin cash`.

Nothing else counts. There is no fuzzy matching, no edit distance and no
guessing at a misspelling: `solanna` names nothing. A post naming the same coin
four different ways is one answer.

**A web address and an @mention are not words.** `https://t.co/ETHxyz` and
`@solana` name no coin, because a link and somebody's account name are not
somebody naming a coin.

## Only markets Trade lists

The coins that can ever be matched are Hyperliquid's own coin list, which is the
app's one real list of every coin it trades. A coin Trade has no market for can
never come out of this, so every coin count on a creator's dashboard is a coin
you could go and trade. The stocks and indexes other groups host on Hyperliquid
are left out; the two venues below list the same stocks properly.

**The stocks, metals and currencies come from edgeX and ApeX Omni**, and only
when the member switched them on. Those two are the venues whose listed
contracts Trade reads cheaply. Robinhood Chain's stock tokens are left out:
reading its market list means walking forty pages of the chain's logs, which is
far too much to pay for reading words, so a stock only Robinhood lists is not
matched.

**One venue refusing refuses the whole list.** A list built from two venues out
of three would quietly store "this post names nothing" for a stock the missing
venue lists, and a stored answer like that stays wrong until somebody presses
Re-read. So a refusal leaves every stored answer alone and says what happened.

**A market Trade lists tomorrow is not in posts stored today.** The list is held
for an hour, and a stored answer is only as good as the list at the moment it
was read. Press **Re-read coins** in the Markets panel and the whole creator is
read again against today's list.

**A market written `kPEPE` is matched as `PEPE` too.** Hyperliquid lists
`kPEPE` because it trades a thousand of them at a time, and nobody on X writes
that. `$PEPE`, `PEPE` and `pepe` all point at the `kPEPE` market, which is the
market Trade would actually trade.

## The words that are never a coin

Every word below is a real ticker somewhere and an ordinary word in a post. A
post shouting one of them would otherwise be filed under a market nobody
mentioned. Each still counts with a dollar sign in front of it, because `$ME` is
somebody naming the market on purpose.

**Stock tickers are why the list is this long.** A coin ticker is usually a
made-up word; a stock ticker is three letters a company liked, so `ALL`, `KEY`,
`CAR`, `MAN` and `WELL` are all real listings and all ordinary English. One list
covers both kinds rather than a second list per kind, so there is one place to
look when a match is wrong.

| Word | Why it is on the list |
| --- | --- |
| AI | the technology, in nearly every post that says it |
| ALL | an ordinary word, and shouted: ALL IN |
| AN | an ordinary word |
| ANY | an ordinary word |
| AR | augmented reality |
| BE | an ordinary word |
| CAR | an ordinary word |
| CC | carbon copy |
| FOR | an ordinary word |
| GAS | what a transaction costs, on every chain |
| GO | an ordinary word, and shouted: LET'S GO |
| HOPE | an ordinary word |
| ID | identification, and an ID check |
| IO | the end of a web address |
| IP | intellectual property, and a network address |
| IT | an ordinary word |
| KEY | an ordinary word, and the word for an API key |
| LOVE | an ordinary word |
| MAN | an ordinary word, and an exclamation |
| ME | an ordinary word, and shouted |
| MET | an ordinary word: we MET yesterday |
| NOT | an ordinary word |
| NOW | an ordinary word, and shouted: BUY NOW |
| OM | an abbreviation and a chant, not the coin, in prose |
| ON | an ordinary word |
| OP | the original poster, in every reply on X |
| OPEN | an ordinary word: OPEN a new position |
| OR | an ordinary word |
| PLAY | an ordinary word, and what traders call a trade idea |
| PUMP | what traders shout at a rising price |
| SO | an ordinary word |
| SUN | an ordinary word |
| TST | reads as a test marker |
| WELL | an ordinary word |
| WIN | an ordinary word, and shouted |

The list lives in `src/lib/trade/social/coin-matcher.ts`, with the reason beside
every word, because a list with no reasons is a list the next person deletes.

**A one-letter ticker needs the dollar sign.** Hyperliquid lists `S` and `W`,
and a post is full of stray capitals, so the bare-ticker rule starts at two
letters. `$S` still counts.

**A name that is also a person's name counts only in lower case.** "adding more
sol here" is the coin; "Sol said he'd sell" is a person, and the capital letter
is the only thing in the sentence that says so. Today that holds for `sol`,
`ada` and `tia`. The cost is that a post opening with "Sol is cheap" is missed,
which is the quiet answer rather than the wrong one.

**A lower-case name that is also an English word is left out** of the name
dictionary entirely: "click the link", "atom", "the sandbox", "render it again"
and "sushi for lunch" would each file a post under a coin nobody was talking
about. Those coins still match from `LINK` and `$LINK`, which is how anybody
naming them writes it. Every omission is marked in
`src/lib/trade/social/coin-names.ts` so nobody helpfully adds it back.

## What is kept, and why the matched words are kept with it

One row per market per post, in `trade_social_post_coins`: the post, the ticker,
what kind of market it is (`coin`, `stock`, `commodity` or `currency`), the
market a chip for it opens, how it matched (`dollar-ticker`, `ticker` or `name`)
and the exact words that matched. A post naming `$SOL` three times has one SOL
row.

The matched words are there because **a false match is the one thing this can
get wrong quietly**. Nothing on screen says "this might be wrong", so the stop
list is the whole defence, and reading back "matched `sol` as a name" is how
somebody sees a bad match for what it is instead of arguing with a count. There
is no way to correct a single match by hand yet.

The ticker is stored venue-free, `SOL` rather than `hyperliquid:mainnet:SOL`,
because a post is about the coin and not about one exchange's market in it. The
market key sits in its own column beside it, for the chip.

## A market on a post opens its chart

Every chip on a post row is a link to the chart of the venue that decided the
word was a market at all. A coin is always Hyperliquid, because Hyperliquid's
coin list is the only coin list the matcher reads. A stock, a metal or a
currency is edgeX or ApeX Omni, whichever one listed it. Pointing a `$TSLA` chip
at Hyperliquid would be a link to a market that does not exist there.

**The venue is stored on the row**, in `market_key`, because only the match list
knows which venue claimed a ticker and that list changes. The ticker beside it
stays venue-free: the post was about the thing, not about one exchange's market
in it. `marketChartHref` in `src/lib/protocols/contracts.ts` turns the key into
the address.

**Re-read coins clears the coin the posts are narrowed to**, because the
answers it just rewrote are the ones that decided which posts those were.
Clicking the coin again narrows them under the new answers.

**The coin rows in the Markets panel are not links.** Clicking one narrows the
posts, which is the job that panel already does, and a row that both narrows and
navigates is a row you cannot press with any confidence.

## When the reading happens

- **Behind every sync.** Storing posts reads the ones that have just arrived.
- **When a creator's dashboard is opened.** Posts stored before Trade could read
  coins at all are caught up then, whether or not X is asked anything: the words
  are already in Trade's own database.
- **When somebody presses Re-read coins**, in the Markets panel's header. That
  forgets every answer for that creator and reads every held post again under
  today's rules. It exists because the rules and the stop list will change, and
  a stored answer has to be able to catch up: without it, a word added to the
  stop list today would go on counting against a creator forever.
- **A post whose words have been edited** since it was stored has its answer
  forgotten by the write and read again. A post that came back unchanged keeps
  the answer it has.

**One pass reads at most 500 posts and stops after five seconds.** A creator
with more posts than that is read the rest of the way the next time their
dashboard is opened, and Re-read coins says how many are still to go. **Pressing
Re-read coins again carries on with those** rather than starting over, or a
creator with 900 posts would have the same newest 500 re-read for ever and the
older 400 never reached. It is
bounded for the reason `src/server/trade/candle-refresh.ts` is bounded: a pass
that runs until it is done holds a screen open, and a worker reads it as a loop
that has stopped.

**A coin list Hyperliquid will not answer for costs nothing that is already
stored.** Sync profile still stores the posts and says so; the coins are read
the next time the creator is opened. Re-read coins says the list could not be
read and leaves every stored answer alone.

## Stocks, metals and currencies

A creator who talks about NVDA twice a week and about coins once a month used to
read as somebody who names almost no markets. With the switch on, their rows say
NVDA, TSLA and SPY, and every figure in Social works on them the way it works on
a coin poster.

**The switch is in Settings → Social and starts off.** Off, no stock, metal or
currency is ever matched, whatever the words say. On, they are matched under the
same three rules as a coin.

**Switching it on marks every post unread.** Each creator is read again the next
time their dashboard or the feed is opened, 500 posts a pass, so a member
tracking forty creators catches up over several opens rather than holding one
screen for a minute.

**Switching it off deletes every stock row the member holds.** Nothing about the
coins changed, so no post needs reading again and the panels are right the
moment the switch lands.

### A stock is never matched from a lower-case name

"apple", "tesla" and "meta" appear in ordinary sentences constantly, so a stock
needs `$TSLA` or an upper-case `TSLA` before Trade says the post named it. This
is a rule, not an accident: `buildCoinMatchList` keeps every market that is not
a coin out of the written-name dictionary, so there is nothing to add a company
name to.

Coins keep their written names, because "solana" and "dogecoin" are not ordinary
English and the dictionary already leaves out the ones that are.

### Four kinds, and what the panel calls them

| Stored kind | On screen |
| --- | --- |
| coin | Coins |
| stock | Stocks |
| commodity | Metals and oil |
| currency | Currencies |

"Metals and oil" rather than "commodities", because gold, copper and crude are
what the venues list and "commodities" is a word nobody says out loud. edgeX and
ApeX Omni flag those eight contracts as one group, so they are one group here.

**The Markets panel groups the rows by kind and heads each group**, so a
creator's stock posts and coin posts are separate on screen. A member who never
switched stocks on has one kind and gets no heading, because a lone "Coins"
heading over a list of coins in a panel titled Markets says nothing.

**Indexes are left out.** ApeX Omni lists them and nobody asked for them, and
every index ticker collides with something.

### A shut stock still has a price, and it is the next session's

A stock has no price at 3am on a Sunday. Every figure that reads a price at the
moment of a post therefore has to answer "which moment".

- **A coin answers with the post's own moment**, always, because a coin trades
  every minute of every day.
- **A metal or a currency answers with the post's own moment too.** Gold, oil
  and currency pairs trade almost round the clock from Sunday evening to Friday
  evening, so New York's session would be a wrong answer for them rather than a
  rough one. Trade states no hours for those at all, and the panel says nothing
  about them. The weekend gap they do have is not modelled, which is a known
  miss.
- **A stock named while its market was open** answers with the post's own moment
  too.
- **A stock named out of hours answers with the next session's open**, and says
  that is what it did. Friday's close would be a price from before the post, so
  a figure built on it would credit a creator with a move that had already
  happened.

`priceMomentFor` in `src/lib/trade/social/market-hours.ts` is the one place that
answers this. Tasks 22 and 26 in `workspace/tasks/Social/` are the figures that
need it; neither is built yet, and when they are they read this rather than
writing their own clock.

**The hours are 09:30 to 16:00 New York, weekdays, and they apply to stocks
only.** Stored as a wall clock on a named zone, never as a fixed offset against
UTC, because 09:30 New York is 13:30 UTC in summer and 14:30 in winter.
**Public holidays are not in here**: the US
market shuts about nine weekdays a year, and on those the next open is an hour
that did not happen. That is a known miss rather than a hidden one, and the
candle store makes the same trade for the same reason
(`workspace/docs/charts/candle-store.md`, "Stock hours are not gaps").

The Markets panel says it on the Stocks group's heading rather than on every
row. The heading reads "Stocks" on the left and "Shut, opens Mon 09:30 New York"
on the right. Forty rows each repeating the same words would not fit a panel
that opens 171 pixels wide. The Coins, Metals and oil, and Currencies headings
say nothing, because this app states no hours for them.

### Stored stock history is thin, and some of it is switched off

The what-if tool keeps its 72 stocks behind a `STOCKS_OFFERED` flag that is
false, partly over Dukascopy's terms of use and partly because most stored stock
history was missing on 25 Sep 2026
(`workspace/docs/free-tools/what-if-i-had-bought.md`). Any figure that needs a
stock's past price will show a dash until that is sorted. That is Tyler's call,
not a fault in the matching.

### Reading a stock match is not trading one

Social is research. Nothing here turns a stock match into an order, and ApeX
Omni lists its stock contracts without trading them at all.

## X's own tagging is gone

X tags coins itself in the page it serves, and Trade used to store that tagging
and count it. It is deleted, column and all, by
`drizzle/0193_trade_social_post_coins.sql`.

It was replaced because Trade's own reading is better on all three counts. X's
tagging is not filtered to coins Trade trades, so `MARSCOIN` and `DOGEGOV` sat
in the panel looking like coins you could buy here. It misses a coin named by
its written name, so "solana" and "bonk guy this, bonk guy that" counted as
nothing. And it is wrong in a way that matters: X tags a quoted post's coins
onto the post that quoted it, which credited @theunipcs with SHIB, DOGE and SPCX
on a post whose words contain none of them.

## Bullish or bearish is not this

This says how often a creator names a coin, which is a fact. What they think of
it is a judgement and a separate job.

## Where it lives

- The rules: `src/lib/trade/social/coin-matcher.ts`, with the coin names and the
  omissions in `src/lib/trade/social/coin-names.ts`. Neither knows anything
  about the database, and `coin-matcher.test.ts` drives them directly.
- The market list: `src/server/trade/social-coin-list.ts`, held for an hour off
  `loadRawMarketCatalog`, as two lists: coins, and coins with stocks.
- The market hours: `src/lib/trade/social/market-hours.ts`.
- The kinds' names and the panel's groups:
  `src/lib/trade/social/market-kinds.ts` and
  `src/components/social/social-market-rows.tsx`.
- The switch: `src/components/social/social-settings.tsx`, its endpoint
  `src/lib/api/trade/social-settings.ts`, and `socialMatchStocks` in
  `src/server/trade/prefs.ts`.
- The pass: `src/server/trade/social-post-coins.ts`.
- The table: `trade_social_post_coins` and `trade_social_posts.coins_read_at`,
  both created by `drizzle/0193_trade_social_post_coins.sql`. The `kind` and
  `market_key` columns and the switch come from
  `drizzle/0195_trade_social_stocks.sql`.
- The endpoint: `rereadCreatorCoinsFromWords` in `src/lib/api/trade/social.ts`,
  behind `userPost`.
- The screen: the chips in `src/components/social/social-posts-panel.tsx` and
  the panel in `src/components/social/social-markets-panel.tsx`.
