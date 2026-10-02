# Every creator you track

`/social/manage` is every X account you track as one sortable table, with a
search box and filters above it. Clicking a row opens that creator's own
dashboard. This screen never shows one creator's posts. It shows who you have
and helps you find the one you want.

It lived at `/social` until the feed took that address (see `social-feed.md`).
The table stayed because its sortable Followers, Posts and Last post columns
answer questions the feed's panel does not, which Tyler asked for on
29 Sep 2026. The way in is the cog in the feed's left panel, then
"Manage creators".

## Two screens on purpose

The list and one creator are two subjects, so they are two screens, the same
way `/flow-runs` and one run are. Splitting them is what puts the creator's
handle in the address, makes the back button work, and lets a link to one
creator be pasted to somebody else.

It also keeps the creator's dashboard about that creator. A panel whose only
job is to navigate away does not belong in the content, which is why the
dashboard carries no list of the other creators and no page header of its own.
The only way back is the arrow in the left panel's header.

## The four columns

**Creator** is the handle with the display name beside it. **Followers**,
**Posts** and **Last post** are the three numbers, and every heading sorts.
Clicking the whole row opens that creator's dashboard, so there is no small
target to hit. A tick box sits before the handle and a bin after the last
post, which is the shape every table in the app has.

A creator you have added but never pasted anything for says "0 posts" and
"nothing held", which is different from having gone quiet. Nobody has imported
anything for them yet.

**Followers comes from the creator's public X page**, read each time you open
their dashboard. It is the exact number, not the rounded one X prints on
screen. A creator shows a dash until you have opened them once, which is not
the same as a zero.

A read that stops finding the number leaves the last one that worked alone,
rather than blanking the column.

**Below 640 pixels the Followers column goes**, and the picture with it. Posts
and the last post are the two somebody came to a phone for, and the 36 pixels
the picture costs are the difference between reading a 15-character handle and
reading "@zzcheck…". Nothing scrolls sideways.

## Deleting a creator

A bin on every row, and a **Delete (n)** button above the table once anything
is ticked. The header tick box takes every row on screen.

**Deleting is untracking, and it takes everything held with it.** Trade stops
tracking the account and lets go of every post it holds for them, the markets
read out of those posts, their place in any folder, and the record of which
posts had been seen. Their posts on X are untouched. It cannot be undone, and
adding the account again starts from nothing rather than finding the old posts
waiting.

**Only the rows on screen can be deleted.** The toolbar counts the ticked rows
that the current search and filters still show, so a row hidden behind a search
is never deleted from behind it.

**The confirmation names what it is about to do**: the handle for one row, the
count for several. Nothing is deleted on the first click.

**The result says what actually went.** The server answers with the ids it
deleted rather than a count, so a row somebody had already deleted in another
window reads as "1 creator deleted, 1 could not be" instead of being counted as
gone. `describeBulkResult` in `src/lib/format/bulk-result.ts` writes that line,
the same one every bulk action in the app uses.

**An id belonging to somebody else is not an error.** The delete is filtered by
the signed-in member's own id in the same `where` as the row it names, so
another member's creator does not match, comes back in neither list, and the
answer never reveals whether that row exists.

## The search box

It matches three things: the handle, the display name, and the words of every
post held. Searching `sol` finds somebody who talks about SOL under a handle
that never says so.

**The search runs on the server**, because the posts it reads are not on this
screen to be searched. It is a plain `ILIKE` today, which means it matches
anywhere in the words and ignores capitals. `%` and `_` are ordinary
characters, not wildcards. The real saved search is a later step and replaces
this one, so nothing here is worth building on twice.

Typing waits about a third of a second before it asks the server, so a
five-letter search is one request rather than five.

## The two filters

- **Posts held** — any, under 50, 50 to 500, over 500. A creator with nothing
  held counts as under 50.
- **Last post** — any, this week, this month, or "gone quiet, over a month".

Gone quiet means the newest post you hold for them is over 30 days old. It
finds somebody who used to post a lot and has stopped. A creator you added but
never pasted anything for is not in it: they have no last post, so nothing has
gone quiet.

It measures your imports, not them. The app only knows what you paste, so a
creator who posts daily reads as quiet if you have not pasted since August.

30 days is the same number the creator's own "Quiet since" tile uses. If that
ever becomes a setting, this screen reads the setting rather than keeping a
copy.

There was a separate "gone quiet" tick beside these until 29 Sep 2026. It
picked exactly the same creators as the Last post option, and two controls
doing one job is one too many, so Tyler dropped it. An old address carrying
`?quiet=true` still opens the list; the filter is just not applied.

On a phone both filters sit behind one button, which says how many are on, so a
list narrowed by a filter you cannot see never looks like a list with rows
missing.

## The sort

Click a heading. Clicking the one already sorted turns the arrow round.
Clicking a different one starts at the end you want first: most followers, most
posts and newest post, but creators A to Z.

Newest post first by default, because the reason to open this screen is usually
"who has said something lately".

**A creator with no number sorts last whichever way the arrow points**, rather
than filling the top of the list with dashes. That covers a creator with
nothing held under Last post and Posts, and a creator whose follower count
nobody has supplied under Followers.

The sort runs on the server, like the search and the filters, because sorting
the rows already on screen would order one page rather than the whole list.

## The address carries the question

The search, the filters and the sort all live in the address, so a narrowed
list can be reloaded and pasted, and the back button out of a creator's
dashboard returns to the rows you left rather than to everything.

Defaults are left out, so `/social/manage` and
`/social/manage?posts=any&last=any&sort=last&dir=desc` are the same screen and
only the first is worth sending to somebody.

**An address nobody understands opens the plain list.** A stale link, a
hand-edited value or a filter that has since been renamed falls back to the
default rather than failing. The screen's own validator cleans what it reads
without rewriting the address, so the raw value still reaches the server; the
endpoint falls back the same way, and a value it does not understand never
turns a filter on.

## The footer

It counts the rows on screen. When something is narrowing the list it also says
how many creators you track in all, with one click to clear the search and the
filters.

## Where it lives

- The route: `src/routes/_authenticated/social_.manage.tsx`. The static
  segment outranks `$handle`, so no creator called "manage" is ever looked up.
- The screen: `src/components/social/creators-list-page.tsx`, with the filters
  in `creator-filters.tsx`.
- The question, its validator and its labels:
  `src/lib/trade/social/creators-query.ts`.
- The query: `listSocialCreatorRows` in `src/server/trade/social-creators.ts`,
  filtered by the signed-in member's id in the same `where` as the row it looks
  for.
- The delete: `deleteSocialCreators` in the same file, one statement that lets
  the database cascade the posts, the markets, the folder rows and the seen
  record. `social-creator-delete.test.ts` drives it.
- The endpoints: `src/lib/api/trade/social.ts`. The list is behind `userGet`;
  the delete is a POST behind `userPost`, capped at `MAX_CREATORS` ids so a
  hand-built request cannot ask for an unbounded `in` list.

**The sidebar link is data, not code.** "Social" is added by hand in
Platform → Navigation, pointing at `/social`, which is the feed. This table
has no link of its own; the feed's cog is the way in.
