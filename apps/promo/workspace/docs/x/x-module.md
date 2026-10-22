# The X module

X (x.com, which used to be Twitter) is a network a project can add, beside
Reddit, Instagram, TikTok and Medium. Picking its row in the project's left
column fills the middle and right columns with X's panels. It came from
`workspace/tasks/X/01-x-features.md`, whose 46 parts Tyler picked on
21 Oct 2026.

## Tyler's answers, 21 Oct 2026

- **"Both from the start".** An X account runs in a browser profile or on a
  rack phone, picked when it is added ([X accounts](accounts.md)).
- **A search-only X account.** X shows no search and no replies to a visitor
  who is not signed in, so X breaks the "reader stays signed out" rule, for X
  only. Every X read goes through a throwaway X account that never posts
  ([Search accounts](search-accounts.md)).
- **A reply names the product "Only when it solves the post".** The AI is
  told: "Name the product only when the post is about a problem the product
  solves. Otherwise just help, and do not mention the product at all."
- **Links: "Never in replies".** Post refuses a reply holding a link. Posts of
  your own may carry one.
- **Warm-up: "7 days".**
- **Pace: "100 a day (but I can set it to what I like)".** A young account
  sends at most 100 replies and posts a day, a number in Settings →
  Behaviour. Beside it is 10 an hour, so the 100 spreads over the waking
  hours. Tyler did not pick the 10; it is his to change.
- **Posts leave To look at after "12 hours".**
- **Watched accounts are read "Every 15 minutes".**
- **A search account stops at a number Tyler sets, starting at 500 posts
  viewed a day** ("You set it, start at 500").
- **Follows after a reply: "You set it, start at 5"** a day.
- **Too similar: "Warn only".** Unlike Medium, Post still goes.
- **"Any X account"** past its warm-up may post its own posts and threads.
- **Left out:** reading the page a post links to, setting the profile and
  pinned post from Promo, a visit around every reply, and which keywords pay
  off.

## The layout

- **The middle column** is the keyword row, the notices, then seven tabs: To
  look at, Replied, Skipped, Today, Replies, Posts and Communities. The tab is
  in the address as `?tab=` (none is To look at), the Replies tab's Failed
  list as `?list=failed`, and whatever is open in the right column as
  `?open=<id>`.
- **The right column** shows what is open: a post and the reply to it, a sent
  reply or a mention, a post of your own being written, or a community.
- **The X row in the left column** carries a count: the strong posts waiting
  plus the replies and mentions nobody has answered. It has its own pause
  button, as every network's row does.

## Keeping up with the queue

While jobs wait and the browser program runs, the module reads its lists
again every 2 seconds. While the program is stopped it only looks every 10
seconds, so it notices when the program starts without asking for nothing.

## Keywords

A keyword belongs to one project, so every X account in the project sees the
same posts. There are three kinds:

- **Search words**, read from X's Latest tab. Search words can be marked
  **Names you** or **Names a rival** (part 13): their posts carry that chip
  and rank above the rest.
- **A hashtag**, stored without its #, also read from the Latest tab.
- **A watched account** (part 11), read from its own page for its newest
  posts, not its replies. Its posts are listed above every searched post on
  To look at, marked Watched, and each new one rings the bell once (part 12), "New post from a
  watched account: @name". The first read that works after adding an account
  rings nothing, so its last few posts don't flood the bell. The bell is per
  person: two people watching the same account each hear it. The bell has its own
  switch per watched account, for accounts that post all day.

Search words and hashtags are searched again by themselves every 2 hours, and
watched accounts every 15 minutes, while the search accounts are awake (parts
10 and 11). Each read goes through a search account and counts against its
day ([Search accounts](search-accounts.md)). A watched account's read takes
in at most 5 posts, because at every 15 minutes it is the busiest reader.

**Ideas** (parts 14 and 15) asks the AI for search words, hashtags and accounts
from the project's description. Search words and hashtags show at once. The
accounts show only after a search account has looked each one up on X,
because the AI names accounts that no longer exist. A look-up costs the search
account about 20 views an account, so while one is waiting another press shows
the words and hashtags only. Trends X shows for the
search account's place, read once a day, are given to the AI too, and the ones
on the project's topic show marked Trending, with the place they are for. X
tunes trends to the account's location, so the search account's proxy decides
what it sees.

## Finding and ordering posts

Each post is stored once per keyword, and listed once however many keywords
found it. A search adds new posts and refreshes the numbers on old ones. It
never changes a decision: a skipped post stays skipped.

    rank = relevance * freshness * room * reach * named * 10

- **Freshness counts for most.** A post under an hour old keeps all of its
  score, under 3 hours 70 out of 100, under 6 hours 45, under 12 hours 25, and
  older 5.
- **Relevance** is where the keyword's list put it: the first keeps all of it,
  the tenth half.
- **Room**: at 15 replies a post keeps half, at 45 a quarter, because X folds
  all but the top replies behind "Show more replies".
- **Reach** is Medium's: 0.5 with no followers, up 0.2 for every digit of the
  poster's followers, 1 when X did not say.
- **Named** doubles it.

Worked example: the second post in a search, 2 hours old, 5 replies, by an
account with 10,000 followers: `1/1.1 * 0.7 * 15/20 * 1.3 * 10` is 6.2046.
5 and over is Strong fit, 1.5 and over Possible fit.

## What never reaches To look at

- **A post whose replies are closed** (part 17): X lets a poster limit replies
  to followers or to people they named. Such a post is stored and never
  listed. One that closes after it was found is refused at Post, with a
  sentence saying it can still be quoted.
- **A post older than 12 hours** (part 18). It stays stored, and comes back
  when words are typed in the search box (part 19), so Everything plus the box
  is one searchable list of every X find. Replied posts stay on Replied.
- **A hidden account's posts** (part 16). Hide this account on a post drops
  its posts from every list, and the search drops its later posts before they
  are stored. The hidden accounts are in the More menu, with Show again.

Posts nobody answered are deleted once no search has seen them for the
tidy-up days in Settings → Reddit (30 to begin with), the same number
Reddit's and Medium's tidy-ups use.

## Today

The Today tab (part 20) lists this project's strong posts still under 12 hours
old, and every reply under your replies and posts, and every post naming one
of your accounts, that nobody has answered yet. Each opens where it can be
answered.

## What it costs

The More menu shows X's AI spend for the project (part 45): this month's total,
split into replies, posts and ideas, and the last two weeks day by day. It is
read off the AI usage screen's own records, under the `x-` lines.

## Where it is

- `src/components/social/x/` draws the module, and
  `src/components/social/projects/workspace.tsx` picks it.
- `src/server/social/x/` is the server side: `keywords.ts`, `search.ts`,
  `rank.ts`, `finds.ts`, `module.ts`, `upkeep.ts` and `cost.ts` for what is on
  this page.
- `src/lib/social/x/options.ts` holds the limits and words both halves read.
- `src/lib/api/social/x.ts` holds every X endpoint, admin only.
