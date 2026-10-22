# Posts of your own on X

Posts and threads of your own, with pictures, polls, a set hour, a community,
and the public list (parts 29 to 36 of `workspace/tasks/X/01-x-features.md`).
Tyler, 21 Oct 2026: "Any X account" past its warm-up may post them.

## Writing one

New post on the Posts tab opens the writer in the right column:

- **Post as**: one of the project's X accounts.
- **One box per post.** A thread is up to 10 posts, each up to 280 characters
  on a free account, counted the way X counts.
- **A picture** on any post of a thread, from your media library only (part
  30): a JPEG, PNG, WebP or GIF. Any other address is refused, so neither the
  browser nor a phone ever downloads from somewhere a person typed.
- **Start from** (parts 29 and 32): one of the project's published Medium
  articles, whose thread ends with the article's address, or one of its best
  Reddit comments still up.
- **Write with AI** fills the boxes in the account's voice from a line on what
  it is about.
- **A poll** (part 33) on the first post: two to four choices of up to 25
  characters, open for 1 hour, 1 day, 3 days or 7 days. Its votes are read
  back with the post's daily check.
- **A community** (part 35) to post into, or the account's own page.
- **Post at** (part 31): an hour inside the account's waking hours. One outside
  them is refused, because it would never post then. The row says "Posts at
  14:00".
- **The draft saves itself** 700ms after the last change, as Medium's articles
  do, so nothing is lost without a Save button.

Own posts may carry a link. Replies never do.

## Posting

Post goes through the warm-up, the pace and the important-and-throwaway
checks, as a reply does, and warns when the words are too like another
account's. With no hour picked it goes at once after ten seconds to take it
back, or at the account's morning.

A thread posts one post at a time, each under the one before, and writes down
each post's id the moment X takes it. A failure halfway stops and says which
post ("Stopped after post 2 of 3"). Try again carries on from there and never
posts the earlier ones twice. A failed post set for an hour goes at once when
tried again. Once Post is pressed the words can't change: a save that lands
after it is refused.

A thread started from a Medium article ends with the article's address, put
there by Promo rather than the AI, so it is never cut; the last post's words
are shortened to fit.

On a phone the X app posts one post at a time with a picture, and doesn't show
where it landed, so a search account looks it up a minute later. A thread, a
poll and a community need the account on a browser profile, and are refused
on a phone with that sentence.

## The Posts tab

It lists the project's posts and threads with their status (Draft, Waiting to
post, Posted, Did not post), their views, likes and replies once read, and a
poll's votes. Quote posts sit beside them (part 34). Replies under a post are
answered like replies under a reply ([Replies on X](replies.md#after-sending)).
Delete removes a thread from its last post back.

## Communities

The Communities tab (part 35) holds the X communities that suit the project.
Paste a community's address to add it, and a search account reads its name,
about words and rules, which the AI is given before it writes a post there.
Rules X doesn't show a stranger can be pasted by hand. Whether the account may
post there is only known when it tries: a community that has not let the
account in refuses Post with one sentence.

## The public list

Add to list on a post (part 36) puts the account that wrote it on the picked
account's public X list, named after the project and made the first time,
after looking on the account's own lists page so a second try never makes a
second list. A real person curating their corner of X keeps one. The entries show on the
Posts tab. It is a write on X, so it waits out the warm-up and the pace too.

## Where it is

- `src/server/social/x/posts.ts`, `communities.ts` and `lists.ts`.
- `promo_x_posts`, `promo_x_communities` and `promo_x_list_items`, from
  `drizzle/0125_promo_x.sql`.
