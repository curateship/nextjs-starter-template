# One creator's dashboard

`/social/<handle>` is one X creator, everything Trade holds about them, on one
screen. You paste a creator's X address, Trade reads their public X page, and
the screen shows who follows them, where else they point, and what they have
been saying.

The feed of every creator you track is a separate screen, `/social` (see
`social-feed.md`), and their sortable table is `/social/manage` (see
`every-creator.md`).

## What the screen holds

Three panels across, and only three. Every other workspace in Trade has four;
this one has no bottom row because nothing on it earns one. Drag the dividers
and the sizes are remembered against your account, so they survive a reload and
follow you to another machine. Below 1280 pixels wide the dividers go and the
same three panels stack in the same order.

**There is no header row above the panels.** The creator's handle is the left
panel's own title, the arrow beside it is the way back to `/social`, and
"Add posts" is a button in the middle panel's header.
A strip above three cards holding one name and two buttons is a fourth surface
saying what the cards could say themselves. Tyler asked for this on
29 Sep 2026.

**Both side panels open at their narrowest**, and the posts take the width left
over. A figure and its caption need one column; a post needs as much width as
it can get, because a narrow middle panel wraps every post into five lines. At
its narrowest the figures panel shows one tile per row and goes to two the
moment you drag it wider.

- **Left, this creator.** Their picture, their handle, how many people follow
  them, and the links they list. Nothing else. It used to carry eight tiles of counting and Tyler cut
  the lot on 29 Sep 2026: none of them said anything the posts beside them did
  not, and the post count was already in the middle panel's own header.
- **Middle, their posts**, newest first. When it was posted, the coins it names,
  the words, and how many people saw it. Each coin is a link to its Hyperliquid
  chart. It scrolls, and it pages 50 at
  a time: 412 posts are never all drawn at once. **Sync profile** is in its
  header.
- **Right, the coins they name**, most-named first, each with how many of
  their posts name it. Clicking one narrows the middle panel to that coin.
  Clicking it again clears the filter.

## Where the follower count and the links come from

Trade reads the creator's public X page, `https://x.com/<handle>`, once each
time you open their dashboard. That read gives the exact follower count, their
display name, their picture, the links in their bio and the link in their
website field, and the handful of posts the profile is showing with the coins
each one names.

**It costs nothing.** X's own API is pay-per-use: $0.005 a post and $0.010 a
profile read, which works out at $60 to backfill thirty creators and about $32
a month to keep them current. Tyler said no on 29 Sep 2026. The profile page is
one ordinary request to a public address.

**The number is exact.** The page prints "12.9M" on screen, but the data behind
it says 12,944,771, and that is what is stored.

**The read never holds the screen up.** The page draws from what Trade already
knows, and the read runs behind it. A read that is refused, slow, or full of
markup it no longer recognises changes nothing: the numbers on screen stay the
last ones that worked, rather than blanking. Only a read that found something
new redraws the page.

**It will break one day.** This is X's own web page, not an agreement with
them, so a front-end change there stops this finding things. When that happens
the figures stop moving rather than going wrong, and the tests in
`src/lib/trade/social/x-profile.test.ts` run against real saved pages so the
break shows up as a failing test.

**If X tells us to slow down**, with a 429 or a 403, the reader goes on the
hold list and every read for the next twenty seconds stops at once instead of
asking again. A page that redirects off X is not read at all, and a body past
4MB is cut off rather than pulled into memory whole. That is the same rule every exchange in this app
follows, and it is written up in `src/server/protocols/rationing.ts`.

## Adding a creator

"Add a creator" is on the feed, `/social`, not here. Opening
`/social/<handle>` for an account you do not track also offers to add it there
and then, with a link to the list beside it.

The window takes an X address or a bare handle, and reads the
handle out of either. `https://x.com/cryptosam`, `x.com/cryptosam/`,
`https://x.com/cryptosam/status/123`, `@cryptosam` and `cryptosam` all give
`cryptosam`. A trailing slash, a query string, a fragment and a leading `@` are
all trimmed.

Three things are refused, each with a sentence saying which:

- **An account you already track.** Capitals do not make a new account:
  @CryptoSam and @cryptosam are the same person to X and the same row here.
- **An address on another site**, and X's own pages such as `x.com/home`.
- **An address pointing at a private or internal machine**, including
  `localhost`. That check runs on the server before anything is saved, through
  the same rules the webhook step uses, so a link aimed at Trade's own server
  is refused rather than stored and fetched later.

Adding lands on that creator's dashboard.

## Sync profile

The button in the posts panel's header reads the creator's X page and keeps
whatever is new. It says what it did either way, including "Nothing new on
their profile", because a button that looks like it did nothing is worse than
one that says so.

The same read happens once on its own when you open a creator, quietly.

**The read that happens on its own leaves a creator alone for five minutes.**
Flicking between creators, or opening the same one three times, is not three
requests to somebody else's server. The button is never held back that way: a
person pressing it is a person asking, and it always reads.

**A post already held is updated, not added again.** Every post carries the id
it had at X, so syncing a profile that still shows the same five posts leaves
the count exactly where it was. A post whose words have been edited since is
written over rather than added beside the old one.

**There is no pasting.** There was, until 29 Sep 2026: a window that took a
block of text or a JSON array. Tyler cut it, because syncing does the same job
without anybody copying anything. The cost is that a sync only brings what the
profile page is showing, so a creator's back catalogue arrives a handful at a
time as you keep syncing, rather than all at once.

## The coins a post names

Trade reads the words of the post and works out which coins it is about, and
only coins it has a market for can come out of that. `$SOL`, `SOL`, `solana` and
`sol` are all the SOL market; "apes are buying" names nothing. The three rules,
the words that are never a coin and what **Re-read coins** does are all in
`which-coins-a-post-names.md`.

**The counts on the right are over every post held**, not over the fifty on
screen, and clicking a coin asks the database again rather than sieving the
page. A coin with 41 posts shows 41.

Whether a creator is bullish or bearish on a coin is a later step. Today the
panel says how often they name it, which is a fact, and not what they think of
it, which is a judgement.

## Why the reader is a slot

Every reader sits behind one door, `SocialReader`, and nothing above that door
knows which one answered. This is the same move the exchange registry makes.

Today there is one, `x-profile`, the public page read. A paid service would
drop in behind the same door without a single screen changing.

X only, and permanently. Instagram, YouTube and TikTok are out.

## A post is held once per member, not shared

Two members tracking @cryptosam get a creator row each and their own copy of
his posts. Nothing is shared between accounts. The reason is ownership: with
one shared copy, one member's sync would change what another member sees, and
one member deleting their account would take the other's posts with it.

The cost is that the same post can sit in the table twice under two members.
That is the right trade for a few hundred posts each.

## Why the other creators are a separate screen

Every panel on this screen is about the creator in the address. A list of the
other creators is navigation, not information about this one, and a panel whose
only job is to leave the page is a panel wasted. The feed and the table get
their own screens.

## What is not built yet

- **Bullish or bearish** is decided in a later step, and is what groups the
  markets panel.
- **Correcting a single match by hand.** A coin read out of a post the wrong way
  can be read again under changed rules, but not overruled on its own.
- **The menu link.** "Social" is added by hand in Platform → Navigation,
  pointing at `/social`.
- **Refreshing on a timer.** The profile is read when you open a creator and
  when you press Sync profile. Nothing runs on a clock.
- **Backfilling a creator's history.** A sync brings what the profile page is
  showing, so older posts arrive a handful at a time.

## Where it lives

- Tables: `trade_social_creators`, `trade_social_posts`, `trade_social_reads`
  in `src/server/trade/schema.ts`, created by `drizzle/0189_trade_social.sql`,
  and `trade_social_post_coins` by `drizzle/0193_trade_social_post_coins.sql`.
- Reading and writing: `src/server/trade/social-creators.ts` and
  `src/server/trade/social-posts.ts`. Every query is filtered by the signed-in
  member's id in the same `where` as the row it looks for.
- The reader slot: `src/server/trade/social-readers.ts`, with the page parser
  in `src/lib/trade/social/x-profile.ts` and real saved pages to test it
  against in `src/lib/trade/social/__fixtures__/`. Those fixtures are in
  `.prettierignore`: reformatting one rewrites the payload the parser reads.
- The endpoints: `src/lib/api/trade/social.ts`, all behind `userGet` or
  `userPost`.
- The screen: `src/routes/_authenticated/social_.$handle.tsx` and
  `src/components/social/`.
- Panel sizes: `socialHorizontal` in `src/lib/trade/panel-keys.ts`.
