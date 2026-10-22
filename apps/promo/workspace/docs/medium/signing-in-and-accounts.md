# Medium accounts and signing in

A Medium account is a row on the Accounts dashboard with Medium as its
platform. It runs on a browser profile or on a phone of its own, and belongs to
one project. Parts 1 to 4 and 42 of `workspace/tasks/Medium/01-medium-features.md`.

## Adding one

Add account on the Accounts dashboard offers Medium beside the other networks.
A Medium account runs on a browser profile with no Medium account in it yet
(one Medium account per profile, or they sign in over each other), or on a
phone. Every account starts as a throwaway; important and throwaway accounts
are kept apart the same way as on every network.

## Signing in with Medium's emailed link

Medium signs people in with a link it emails, not a password. Pressing that link
in an everyday browser signs that browser in, which is the wrong one (part 2).

The key button, on the account's row on the Accounts dashboard and beside
Respond as in the Medium module, takes the pasted link and opens it inside the
account's own browser profile. Who is signed in is read straight after. The
link signs in whoever opens it, so it is wiped from the job as soon as the
browser has taken it, and a link that will not open fails with a message that
leaves the link out. Only an
https link on medium.com is taken, checked in Promo and again in the browser,
so the account's browser is never sent anywhere else. The link only works for a
short time, so it is pasted straight from the email.

## Who is signed in

After every Medium job the browser takes a look that never moves the page: the
data Medium draws every page from says who is signed in (`viewer` in
`window.__APOLLO_STATE__`), and the account's public page says when it joined
and how many follow it. A look taken on another site is not written down, so a
signed-in account is never marked signed out by mistake.

**Check now** on the Accounts dashboard takes the full look, which goes to
Medium's front page first. When the page will not load, the look is "not
checked", never "signed out". A second Check now while one waits asks for
nothing more.

## Its status

Warming up for its first 7 days after Medium says it joined, Banned once a ban
screen stopped it, Working when it wrote in the last week, and Ready otherwise.
With no joined date read it counts as warming, with "Joined date not read yet",
because Post refuses it until the date is known.

## The warm-up

For its first 7 days a Medium account sends nothing. Once a day, at a time
picked inside its waking hours, it visits Medium: the front page, two to four
stories read in the project's tags, and on about one day in three a writer
followed. Nothing is written, clapped or highlighted. A browser found signed
out does not count as the day's visit.

## On a phone

A Medium account can run in the Medium app on a rack phone (part 42). The app
there does less than a browser:

- **It does:** read who is signed in and its followers, send a response or an
  answer (the story opened by its link, the responses button, the box, Respond
  pressed once), and the warm-up (a few minutes of the app's feed).
- **The reader does the rest for it.** The app shows neither when the account
  joined nor where a response landed, so the signed-out reader reads the
  account's public page once, and looks the response up under its story by the
  account's name and opening words a minute after it is sent.
- **It does not:** publish, edit, delete, read an article's views, add to a
  list, check a publication, or answer one highlighted line. Each is refused
  with one sentence saying it needs an account on a browser profile, before
  anything reaches the phone: when it is pressed, and again when the job runs,
  since an account can move to a phone while a job waits for its morning.
- **No daily health reading.** Who is signed in is read after every Medium
  job, so Medium phone accounts are left out of the daily readings Instagram
  and TikTok take.

The Medium app's buttons in `rack/promo_rack.py` were written from how the app
is put together and have not been walked on a real phone yet. The daily
self-test walks the response up to Respond, which it never presses, on the
newest Medium story Promo found in the last week; with none found it only opens
the app. A response is refused on the phones once the self-test finds it
broken. Unlike a Reddit comment, it is not held back until a first pass,
because with no Medium story there is nothing to rehearse it on. Medium also joined the apps whose updates are
tested on the test phone before the rest of the rack. Its iPhone bundle id is
not yet read off a real iPhone.
