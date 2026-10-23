# How LinkedIn is read

## In the browser

`docker/browser/routines/linkedin.py` is the only file that knows how a
LinkedIn page is put together. Every routine the server calls is listed with
the shape of its answer in `src/server/social/linkedin/calls.ts`, and one
browser test reads that file to check the two agree.

Every page detail the routines look for sits in one `SELECTORS` block at the
top of `linkedin.py`. LinkedIn changes its pages often; when a routine stops
finding something, that block is the one place to fix.

What the routines share with X's:

- A read counts the posts it put in front of the account, and says when
  LinkedIn showed its limit page.
- The quick look at who is signed in never moves the page.
- Before typing a comment, a post or a newsletter issue, the routine looks
  for the same words from an earlier try, and reports that one as sent.
- The box is read back before every press, tags included.
- Every failure after a press says "may already be on LinkedIn".
- The warm-up reads only.
- Pictures and videos are downloaded only from Promo's own media library.

## On a phone

The LinkedIn app's steps are in `rack/promo_rack.py` (`linkedin_screens`):
who is signed in, a comment, a post with words and one picture, a connection
request, reading and accepting requests, the warm-up, and messages. The app
never shows a profile's address, so the phone copies it from the profile's
share menu. The daily self-test walks a comment, a post and a connection
request up to their last button without pressing it. The restriction screens
are fixtures in `rack/fixtures/ban-screens/linkedin-*.xml`.

## Limits found before the first real run

- **An iPhone can't read who is signed in yet.** The phone copies the
  profile's address from its share menu, and first empties the clipboard so
  an old address is never read as the new one. An iPhone's clipboard can't be
  emptied, so the look answers "not checked" there.
- **A busy post may be refused.** Before typing, the browser opens every
  comment under the post to look for an earlier try. When they don't all
  open within 15 presses, nothing is typed, rather than risk a second comment.
- **Downloads accept any public https address.** The browser refuses local
  addresses and redirects, but is given no media host to check against.

## What has been proved

Nothing has run against the real LinkedIn or a real phone yet. No LinkedIn
account has been signed in. The routines, the phone steps and the pages they
expect are written from LinkedIn's known layout and tested against fake
pages and screens. The first real run is the test of them, and the
`SELECTORS` block is where it will need fixing.

## The tests

- `src/server/social/linkedin/linkedin.test.ts`: the server, against a fresh
  database, with the browser and phone calls stood in for.
- `docker/browser/test_linkedin.py`: the browser routines against fake pages.
  Run from `apps/promo` with `python3 -m unittest discover -s docker/browser -p "test_*.py"`.
- `rack/test_promo_rack.py`: the phone steps against fake screens. Run with
  `python3 -m unittest discover -s rack -p "test_*.py"`.
