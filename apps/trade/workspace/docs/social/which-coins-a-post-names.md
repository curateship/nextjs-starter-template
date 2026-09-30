# Which coins a post names

Trade reads the words of a post and works out which coins it is about. "$SOL",
"solana", "sol" and "SOL" all become the SOL market Trade already trades. A post
naming no coin is marked as naming none, which is an answer and not a failure.

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

## Only coins Trade has a market for

The list of coins that can ever be matched is Hyperliquid's own coin list, which
is the app's one real list of everything it trades. A coin Trade has no market
for can never come out of this, so every count on a creator's dashboard is a
coin you could go and trade. The stocks and indexes other groups host on
Hyperliquid are left out; stocks are a separate job, and stock tickers collide
with ordinary words far more often than coin tickers do.

**A coin Trade lists tomorrow is not in posts stored today.** The coin list is
held for an hour, and a stored answer is only as good as the list at the moment
it was read. Press **Re-read coins** in the Markets panel and the whole creator
is read again against today's list.

**A market written `kPEPE` is matched as `PEPE` too.** Hyperliquid lists
`kPEPE` because it trades a thousand of them at a time, and nobody on X writes
that. `$PEPE`, `PEPE` and `pepe` all point at the `kPEPE` market, which is the
market Trade would actually trade.

## The words that are never a coin

Every word below is a real ticker somewhere and an ordinary word in a post. A
post shouting one of them would otherwise be filed under a coin nobody
mentioned. Each still counts with a dollar sign in front of it, because `$ME` is
somebody naming the coin on purpose.

| Word | Why it is on the list |
| --- | --- |
| AI | the technology, in nearly every post that says it |
| ALL | an ordinary word, and shouted: ALL IN |
| ANY | an ordinary word |
| AR | augmented reality |
| CC | carbon copy |
| FOR | an ordinary word |
| GAS | what a transaction costs, on every chain |
| ID | identification, and an ID check |
| IO | the end of a web address |
| IP | intellectual property, and a network address |
| ME | an ordinary word, and shouted |
| MET | an ordinary word: we MET yesterday |
| NOT | an ordinary word |
| OM | an abbreviation and a chant, not the coin, in prose |
| OP | the original poster, in every reply on X |
| PUMP | what traders shout at a rising price |
| SUN | an ordinary word |
| TST | reads as a test marker |
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

One row per coin per post, in `trade_social_post_coins`: the post, the coin, how
it matched (`dollar-ticker`, `ticker` or `name`) and the exact words that
matched. A post naming `$SOL` three times has one SOL row.

The matched words are there because **a false match is the one thing this can
get wrong quietly**. Nothing on screen says "this might be wrong", so the stop
list is the whole defence, and reading back "matched `sol` as a name" is how
somebody sees a bad match for what it is instead of arguing with a count. There
is no way to correct a single match by hand yet.

The coin is stored as the venue-free ticker, `SOL` rather than
`hyperliquid:mainnet:SOL`, because a post is about the coin and not about one
exchange's market in it.

## A coin on a post opens its chart

Every chip on a post row is a link to that coin's Hyperliquid chart. It can be
nothing else: Hyperliquid's market list is what decided the word was a coin at
all, so pointing a `$SOL` chip at another exchange would be Trade naming a venue
the post never implied. Choosing between venues is the market picker's job.

The address is worked out when the screen draws the row, not stored, so the row
in `trade_social_post_coins` stays venue-free. `coinChartHref` in
`src/lib/trade/social/dashboard.ts` is the one place it is built.

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
- The coin list: `src/server/trade/social-coin-list.ts`, held for an hour off
  `loadRawMarketCatalog`.
- The pass: `src/server/trade/social-post-coins.ts`.
- The table: `trade_social_post_coins` and `trade_social_posts.coins_read_at`,
  both created by `drizzle/0193_trade_social_post_coins.sql`.
- The endpoint: `rereadCreatorCoinsFromWords` in `src/lib/api/trade/social.ts`,
  behind `userPost`.
- The screen: the chips in `src/components/social/social-posts-panel.tsx` and
  the panel in `src/components/social/social-markets-panel.tsx`.
