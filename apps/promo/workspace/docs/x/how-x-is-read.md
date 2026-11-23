# How X is read

How the browser and the phones work X, what has been checked, and what waits
for a real account.

## In a browser

`docker/browser/routines/x.py` is the only file that knows how an X page is
put together. Its routines answer the shapes in `src/server/social/x/calls.ts`,
each checked before anything reads it.

- **Reads listen to X's own data.** X's web app loads its timelines, posts and
  profiles as data while the page opens. The routines listen for that data
  (search and profile timelines, a post's page, an account's profile) rather
  than asking for it, and fall back to the drawn page when it never arrives.
  The drawn page can't say who may reply or how many follow the poster.
- **Writes are typed on the page**: reply, quote, post, edit, delete, follow,
  the list and messages. Each new post's id comes from X's own answer to the
  press, or from reading the account's page again. Each looks first for the
  same words already sent, in X's data or on the drawn page, so a second try
  never sends twice: under the same post or quoting the same post however long
  ago, on the account's page back to the post's first try, and in the same
  conversation for a message. When nothing loaded there is nothing to look in,
  and the write is refused with nothing typed.
- **The box is read back before every press.** A line break is typed only
  after X's @name or #tag suggestions are closed, and words in the box that
  don't match what was written are refused with nothing posted.
- **Anything that goes wrong after the press** says the words may already be
  on X, so Try again looks before it sends.
- **An edit's new id.** X gives an edited post a new id, and Promo keeps it,
  so later checks and deletes read the new version.
- **Every read returns what it cost**: the posts X sent, adverts and pinned
  posts included, and whether X showed its rate limit.

## On a phone

`rack/promo_rack.py` drives the X app (`com.twitter.android`, and
`com.atebits.Tweetie2` on an iPhone) for who is signed in, reply, quote, a post
with a picture, follow, the warm-up, and direct messages. The daily self-test
walks a reply and a quote to the last button on a post found in the last week,
without pressing it.

## What has been checked

- **Server:** 69 tests in `src/server/social/x/x.test.ts`, covering the ranking,
  the search accounts and their views, the rate limit, every check on Post,
  sending, Try again, follows, the daily checks, threads that stop halfway,
  the set hour, the lock screen, the sign-in code, the important-and-throwaway
  rule, the daily look and the AI spend.
- **Browser routines:** 82 tests in `docker/browser/test_x.py` on made-up
  answers shaped like X's data: parsing, counts like "1.2K", ids, lock-screen
  words, the rate limit.
- **Phones:** 29 new rack tests and five lock-screen fixtures written from X's
  wording.

## What has not

Nothing has run against the real X yet: no account was signed in, and x.com
was not visited while this was built. The first real run is the test of every
routine. Most likely to need fixing are the parts that rest on X's buttons:
the list window, posting into a community, the poll's length boxes, the edit
flow, and every step of the X app on a phone. Each one says which step failed
when it fails.

`inbox` stops with a sentence when an account's messages have moved to X
Chat, X's newer messages page, which it doesn't read. Group conversations are
skipped.
