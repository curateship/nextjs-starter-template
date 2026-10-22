# Finding Reddit posts worth answering

Promo searches Reddit for a keyword and puts the results in the order that
answers "where would a comment of mine actually be read". That is a different
question from the one Reddit's own search answers, and the difference is the
whole point of the screen.

## Why there is no Reddit API

Reddit will not answer a plain request any more, and the official way in is
closing.

- **A plain request gets nothing.** Asking `reddit.com/search.json` for results
  with an ordinary browser's name on the request comes back 403. Asking for the
  normal search page comes back 200, but the page is a JavaScript puzzle Reddit
  wants solved before it will show anything, not the results.
- **The official API shuts in March 2027.** Reddit announced on 30 September
  2026 that it stops accepting new applications on 31 October 2026, ends RSS on
  13 November 2026, cuts off unregistered apps on 12 January 2027, and closes
  the public API altogether in March 2027.

So every read goes through a real browser, which solves the puzzle the way a
person's browser does. `browser/isolated-sessions.md` describes that browser.
One engine does the reading and the posting, rather than two.

**The account never searches.** Keyword searches, subreddit watches, reading a
post's replies and reading a subreddit's rules all run in the reader browser, a
profile signed in to nobody, picked in Settings → Behaviour. With no reader
picked, Run and Read the replies are refused at once and say to pick one; they
never fall back to the account's own browser. An account that searches the
same words dozens of times a day looks like a bot, however good its
fingerprint. `accounts/behaving-like-a-person.md` has the rest of the rules.

## What a keyword is

A saved search: the words, which subreddits to look in, Reddit's own order, and
how far back to look. Running it again adds whatever is new and leaves alone
every decision already made about the posts it found before.

Every keyword belongs to one project, since 12 Oct 2026 (Tyler: "Keywords belong
to the project"). Every account in the project sees the same keywords and posts.
The same words may be saved in two projects; inside one project they are saved
once. [The Projects dashboard](../projects-dashboard.md) has the rest.

## Searching again by itself

Every keyword and every watch searches Reddit again on its own, a few times a
day. Tyler picked this on 12 Oct 2026 and set the gap: "4h is fine". The best
post to answer is a fresh one with few replies, and a keyword pressed once in
the morning misses everything posted after it.

- **How often:** Settings → Behaviour, "Search every keyword every this many
  hours", 4 to begin with. 0 means a keyword searches only when its button is
  pressed. The field saves itself.
- **Only while the reader is awake,** on the reader browser's own clock, and
  only with a reader picked. With none, nothing is searched by itself.
- **The gap counts from the last search job, failed or not,** so a keyword that
  keeps failing is tried once a gap rather than on every pass.
- **Spread out.** One pass puts its searches three minutes apart, plus a random
  part of three, so Reddit never sees every keyword in the same minute.
- **A keyword with a search already waiting gets no second one.**
- **The switch is the timer icon on each keyword's row** in the keywords
  dropdown, beside the search arrow. Pressing it turns the timer off for that keyword alone, and the icon
  becomes a crossed-out timer. The search arrow still works by hand.
- **Nothing posts.** A timed search is the same `search` job a press writes,
  in the reader, signed in to nobody, followed by the same reads of the best
  posts' replies and the subreddits' rules.

The pass is `queueDueSearches` in `src/server/social/reddit/timed-searches.ts`,
run every five minutes by the `promo-timed-searches` worker. The switch is
`promo_keywords.enabled`, which existed before and had no switch.

## Ideas for keywords

**Ideas**, in the "⋮" menu at the top of the posts column, asks the AI for up to ten new
search phrases and five subreddits to watch. It is told the project's
description, the keywords already saved, and the subreddits the project's
posts came from, and asked for the words a person with the problem would
type, not the words you would.

- **Nothing is saved until Add is pressed.** Add saves the phrase, or the
  watch, and searches it straight away, the same as typing it into the box.
- **Already saved phrases, watched subreddits and blocked subreddits never
  show.**
- **No description, no ideas:** the window says to write the description
  first.
- **It costs one AI call,** counted on the AI usage screen as
  "reddit-keyword-ideas".

The window is `src/components/social/reddit/keyword-ideas-dialog.tsx`; the
call is `keywordIdeas` in `src/server/social/ai-tasks.ts`.

## Watching a subreddit

People describe your problem without using your words. Somebody in r/SaaS
asking "how do you find anyone to talk to about your product" is the ideal post
and matches no keyword you would think to save. So a saved search can name one
subreddit and no words, and list that subreddit's new posts instead: a watch.

- **Leave the words empty and name one subreddit.** The form says "No words,
  one subreddit: this watches r/SaaS's new posts, newest first", drops the
  order and how-far-back boxes, which mean nothing to a watch, and the button
  reads Watch it.
- **Neither words nor a subreddit is still refused**, and so is a watch on two
  subreddits: "A watch takes one subreddit. Type a keyword to search several."
- **One watch per subreddit.** r/SaaS and r/saas are the same watch.
- **The browser reads `/r/<name>/new`** rather than searching. Reddit's order
  there is newest first, so a post's place in it is how new it is, and the
  freshness and replies parts of the order below do the rest.
- **The card says what it watches**: "r/SaaS" over "Watching · 25 posts ·
  Newest first". The subreddit comes first because the keywords panel opens at
  its narrowest: at a 1440px window a card has about 50px for its name, and
  "Watching r/SaaS" was cut to "Watc…". Hovering either line shows it whole.
  The list's heading reads "New posts in r/SaaS", and each row's reason starts
  "The subreddit's newest post" rather than "Reddit's best match".
- **Everything else is a keyword.** Same three bands, same statuses, same Skip,
  same blocked list, same composer. A watch on a blocked subreddit reads
  nothing.

A watch is a row in `promo_keywords` with an empty term and one subreddit. The
unique rule on the words covers searches with words only, and a second one
keeps one watch per subreddit (`drizzle/0102_promo_subreddit_watches.sql`).

## Reddit's order

**Reddit's order defaults to Best match**, and that was measured rather than
guessed. Against "project management tool" over one week on 5 October 2026:

- **Best match** put 25 of 25 posts on topic, with a typical 8 replies.
- **Newest** put 0 of 25 on topic. It is recency with no relevance at all.
- **Most replied to** put 22 of 25 on topic, typically 538 replies deep.
- **Most upvoted** put 23 of 25 on topic, typically 301 replies deep.

The last two match the words well and bury a new comment at reply 302.

## The three bands

The list groups under three headings rather than showing a score, because a
score is a sort order and not something to read.

- **Strong fit** is a post Reddit matched well that is fresh and still quiet.
- **Possible** is worth a look.
- **Low fit** matched the words and is either old, buried under replies, or
  both.

The two thresholds were set against a real run of "reddit marketing tool" on 5
October 2026, which returned 15 posts scoring 2.00 down to 0.13. They split it
3 strong, 7 possible and 5 low, and reading the groups back those are the right
three: the strong ones were all posted today with one or two replies, and the
low ones were a Tesla story with 135 replies and a horror story with 28.

## How the order is worked out

Three things decide where a post sits, and upvotes are not one of them:

- **Where Reddit put it.** Reddit returns its results in its own relevance
  order, and that order is the only measure of relevance the app has. First
  place keeps all of it, tenth keeps half, twenty-fifth keeps about a quarter.
- **How many replies are already there.** Few replies means a comment sits near
  the top instead of collapsed under "load more comments". No replies keeps all
  of it, three replies keeps half, twenty-seven keeps a tenth.
- **How old the post is.** People read a thread for a day or so and then stop.
  Under six hours keeps all of it, under a day keeps 0.6, under three days 0.3,
  older than that 0.1.

The three multiply together, times ten so the column reads as 2.0 rather than
0.2.

Two worked numbers:

- Reddit's fourth result, posted today, 5 replies: `1/1.3 × 0.6 × 3/8 × 10` is
  **1.73**.
- Reddit's second result, three weeks old, 400 replies: `1/1.1 × 0.1 × 3/403 ×
  10` is **0.0068**.

The fresh quiet post comes out 255 times higher than the old buried one, even
though the buried one matched the words better. That is the right answer: the
busy one has had its conversation.

## Why upvotes were taken out

The first version multiplied the post's upvotes in, on the reasoning that a post
people are reading is worth answering. Run against "reddit marketing tool" on 5
October 2026 it put a horror story from r/nosleep at the top, 314 upvotes and 28
replies, and the two posts actually worth answering tenth and eleventh: an
r/SaaS post with 3 upvotes and 5 replies, and an r/SocialMediaMarketing post
with 1 upvote and 1 reply.

Upvotes measure how big and busy a subreddit is far more than how relevant a
post is to you. With them gone, the same keyword put five on-topic posts in the
top five, with 2, 6, 1, 5 and 7 replies.

## Subreddits you never see

Taking upvotes out fixed most of that, but Reddit still matches words in
subreddits you will never comment in, and one of them turns up under every
keyword on every run. So there is a blocked list.

- **One list for every keyword.** The same off-topic subreddit turns up under
  all of them, so blocking it once is the point. It belongs to the person, the
  same way the posts do.
- **One press on a row.** The block button at the end of a post's row blocks
  that row's subreddit and hides every stored post from it in the same request.
  A message says how many went, with an Undo beside it.
- **Hidden, never deleted.** The posts stay in `promo_finds` and the list leaves
  them out, along with the counts beside each keyword. Unblocking brings them
  back as they were, skipped ones still skipped.
- **A post already commented on is never hidden**, whatever its subreddit. That
  comment happened, and the Replied tab is the record of it. Its row has no
  block button for the same reason.
- **The next search stores none of it.** The search drops a blocked
  subreddit's posts before anything is written. A keyword that names a blocked
  subreddit no longer searches it, and one whose every named subreddit is
  blocked searches nothing rather than falling back to all of Reddit.
- **Names are compared without case**, as Reddit compares them, so r/NoSleep
  and r/nosleep are one entry.

The list is on Settings → Reddit account, under "Subreddits you never see",
where a subreddit can be typed in before it has turned up, and where each one
says how many posts it is hiding and comes back off with Unblock.

## The screen

The keywords and the posts are the middle column of a project's Reddit module
on the [Projects dashboard](../projects-dashboard.md), keywords above posts,
with the project and its networks on the left
([Networks as modules](../network-modules.md)). They were the Reddit
dashboard's left and middle columns until 12 Oct 2026. Every list below is one
project's.

- **Keywords**, as one dropdown after the search box in the middle column's
  header since 21 Oct 2026 (chips from Tyler's design of 13 Oct 2026 until then).
  Each keyword's row is its name, its post count, when it last searched and
  what it searches ("Past week · All of Reddit", or "Watching · Newest first"),
  a timer switch, an arrow to search again and a "⋮" with Remove. **Add
  keyword**, last in the list, opens the box that adds one
  ([The keywords dropdown](../projects-dashboard.md#the-keywords-dropdown)).
- **Every keyword's posts together** is All keywords, first in the dropdown and
  what shows when the screen opens. Picking a keyword lists its posts alone. See
  "Every keyword together" below.
- **The posts**, under the header. Three tabs across the top say where the work
  is: To look at, Replied, Skipped. Pressing one shows those posts. A search
  box sits at the right of the same row; see "Finding a post you remember"
  below.
- **The post and your comment**, on the right. One panel, because they are one
  piece of work: the post, its replies and the drafts scroll together and the
  box you send from stays at the bottom where it can always be reached.

There is no bottom panel.

## Every keyword together

The morning question is what to answer, not what one saved search found. The
ranking already puts every post on one scale, and its freshness part means the
best post today could be under any keyword, so with All keywords picked the
list is the project's posts in one order.

- **Chosen whenever nothing else is**: when the screen opens, when All keywords
  is picked, and when the chosen keyword is removed. Adding a
  keyword still chooses the new one.
- **No new endpoint.** The screen asks for the posts with no keyword named,
  which the existing endpoint already answered with all of the person's posts.
  Both lists read up to 500 posts, the endpoint's own ceiling, rather than its
  default of 100, which would be outgrown in a few days.
- **A row names its keyword** at the end of its line, once the project has more
  than one keyword, because a row cannot be acted on when several are mixed
  and nothing says which found it. A single keyword's list leaves it off.
- **Everything else is the same list**: the three bands, the three status tabs,
  the block button, the chosen row's left edge line.
- **The same Reddit post found by two keywords is two rows**, one under each,
  because each keyword's copy has its own status. Skipping one leaves the
  other.

## Finding a post you remember

After a few weeks of daily searches there are hundreds of stored posts, and
finding the one from Tuesday meant scrolling. **Search posts**, in the keywords
row at the top of the middle column, narrows the list as you type.

- **Title, subreddit and author.** Not the post's own words, which are long
  enough to match almost anything, and not the replies.
- **Every word typed must appear**, in any order, across those three. So
  "saas pricing" finds "How we set our pricing" in r/SaaS. A leading "r/" or
  "u/" is dropped from a word, because that is how people write them.
- **Narrowed in the browser**, over the posts already loaded for the chosen
  keyword or for every keyword. No request per keystroke. The text goes through
  the shell's `readSearchText` (`src/lib/nav/list-search.ts`), so blank means
  no search and the length is capped like every other dashboard's search. The
  matching is `matchesFindSearch` in `src/lib/social/find-search.ts`; the
  shell has no matcher of its own to reuse, and its dashboards match with the
  same lower-case "contains".
- **The counts follow the search.** The three tabs and the band headings
  count what the search lets through, so "Skipped 1" shows where a
  remembered post went. A band with no matches disappears.
- **"No post matches those words."** when the tab has posts and the words
  matched none of them. "Nothing found yet" stays the answer for a tab that is
  empty to begin with.
- **The words stay in the box** when the keyword or the tab changes, where
  they can be seen and cleared. They are not kept between visits.
- **On a phone the box wraps under the tabs**, rather than squeezing them past
  the screen's edge.

Both side panels shut all the way to nothing, either by dragging their divider
across or by double-clicking their blank space, and a slim tab appears on the
middle panel's edge where each one went. Where the dividers are left is
remembered in this browser. Below 1280px the panels are dropped entirely and the
list takes the screen, because three columns on a phone is three unreadable
columns. Picking a post then gives it the whole screen, and the arrow at the
left of its header goes back to the list with the same keyword and the same tab
chosen. The arrow is only there in that narrow layout; with three panels the
list is already beside the post.

## What a row says

The title, then one line of the subreddit, when it went up and where Reddit
put it ("match 9" in a search, "newest 3" in a watch), and the keyword that
found it when several are listed together. On the right, the upvotes, the
replies and the button that blocks the row's subreddit. The bands are the
order said in words; the row has no tooltip, as Tyler asked on 13 Oct 2026.
The chosen row has a grey ground and a dark line
down its left edge. It is a plain list rather than the dashboard table since
the 13 Oct 2026 design. Posts under To look at have tick boxes, and ticking any
shows **Skip** for the ticked posts; one post is also skipped from the right
column.

The date is said the way a person would: Today, Yesterday, 5 days ago, Last
week. Whole days apart, not hours, or a post from 11pm last night would read as
a day older than one from 1am this morning.

**There is no status column.** It said "To look at" against almost every row,
and every row in the list is one to look at, so it said nothing. Where a post
has got to is now the three counts at the top of the panel, which also filter.

**The score itself is not shown**, and that is deliberate. It was a column
called "Worth it" until Tyler asked what it meant on 5 Oct 2026, which was the
answer: a bare 2.0 on no scale tells a reader nothing. The number only ever
drove the sort. The list is already in its order and each row says why it is
there, so the column was removed rather than renamed.

Upvotes are still shown, because they tell you whether a subreddit is alive.
They just do not move the order.

A small speech-bubble mark at the start of the line under a row's title means
its replies are already read, so the post can be answered without pressing Read the replies.
Hovering it says "Replies read, ready to answer". No mark means they have not
been read, not that there are none. It sits under the title rather than beside
the reply count because the Projects dashboard's middle panel scrolls the reply
count out of view at ordinary widths.

## The best posts' replies are read ahead

Post stays off until a post's replies have been read, because a comment that
repeats the top reply is worse than none ([writing-comments.md](writing-comments.md)).
Reading them is a browser trip of tens of seconds. So when a search finishes,
the app reads the replies of its best posts on its own, before anybody opens
them.

- **Strong fit only, at most 5 a search.** The best first, in the list's own
  order. Five is about two minutes of the reader browser, which also does
  every search and every rules read. The number is `MAX_THREADS_PER_SEARCH` in
  `src/server/social/reddit/search.ts`.
- **Never twice.** A post whose replies are already stored is left alone, however
  old the reading, so running a keyword again reads nothing it has. A post
  already skipped or replied to is left out, and so is one with a read already
  waiting.
- **Before the rules.** The reads go on the queue ahead of the subreddit rules
  reads, because Post waits on the replies and not on the rules.
- **Possible and Low fit posts keep the button.** Read the replies works
  exactly as before for them.
- **"Reading the replies…"** shows in the post's panel while a read is waiting
  or running, in place of the button, so a post opened early says what is
  coming. The list and the open post update as each read lands, not only when
  the whole queue is empty.
- **A failure never fails the search.** If the reads cannot be queued, the
  search still counts and the button still works.

## Where a post can get to

- **To look at** is where every post starts.
- **Shortlisted** is one you mean to come back to.
- **Skipped** is one you have decided against. Ticking rows and pressing Skip
  moves many at once, in one request, and says how many moved.
- **Commented** is set by a comment actually going out, never by hand. A post
  that got there is left alone by Skip, so a comment cannot be sent twice by
  accident.

A re-run of the keyword never moves any of these. It only brings the figures and
the score up to date.

## Old posts are tidied away

A year of daily searches is tens of thousands of stored posts, most of them
skipped months ago and each carrying its stored replies. Every ten minutes the
shell's ticker takes a pass over them (`tidyOldFinds` in
`src/server/social/tidy.ts`).

- **The clock is when a search last saw the post**, not when it went up. A post
  a search still returns is still in front of someone.
- **A skipped post past the age is deleted.**
- **A post still waiting to be looked at keeps its row and loses its stored
  replies**, the big part. The answer panel then reads it as not read yet and
  offers Read the replies.
- **A post with any comment against it is never touched**, sent or failed. That
  record is the point of the app. Nor is a skipped post with drafts, because
  deleting the post would take its drafts with it.
- **One number, on Settings → Reddit account**, under "Tidying up old posts":
  days unseen before a skipped post goes. 30 to begin with. 0 switches the
  tidy-up off entirely, and nothing is deleted or cleared. It saves itself.
- **500 of each a pass**, oldest first, so a backlog never holds up the other
  jobs on the shared ticker. The rest go on the next pass.
- **The log says how many went**: "Tidied old Reddit posts: deleted 3 skipped
  post(s), cleared the stored replies of 12 open one(s)".

A deleted skipped post that a later search returns again comes back as new,
because nothing remembers it was skipped. Waiting for the post to go unseen for
the whole period first is what keeps that rare.

## Self-promotion threads

Plenty of subreddits ban self-promotion everywhere except one weekly or
monthly thread, often called something like "Share your startup". That
thread is the one place saying what you make is welcome instead of
bannable, so Promo looks for it.

- **Where:** "Self-promotion threads" in the "⋮" menu at the top of the
  posts column, which opens a window of them. **Look** searches the subreddits the project's posts come
  from most, at most eight, one reader job each.
- **How it searches:** Reddit's own search inside the subreddit, newest first
  over the past year, for titles with words these threads use (promotion,
  self promo, share your, showcase, weekly thread, plug). A title must then
  name both a promotion word and a thread word, so "How do you promote your
  SaaS?" is not taken for one.
- **What it shows:** each subreddit's newest thread, when it went up, how
  often they come (the typical gap between the threads found), and when the
  next is due. Pressing a row opens the thread in the comment box, where
  every rule Post has still applies.
- **Every subreddit names its thread differently, so some are missed.** The
  empty list says so.

A thread is stored as a found post that belongs to the project rather than to
a keyword: `promo_finds.thread_project_id`, with `keyword_id` empty. It never
shows in the posts list, and only the project's accounts answer it. The code
is `src/server/social/reddit/promo-threads.ts` and
`src/components/social/projects/promo-threads.tsx`.
