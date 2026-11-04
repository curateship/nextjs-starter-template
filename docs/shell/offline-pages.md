# Pages that open with no signal

An app can keep some of its pages so they open again with no signal, read
only. Tyler asked for it on 3 Nov 2026 for Travel ("Read only", built in the
shell and copied into Travel). Nothing in the shell turns it on, so an app
that never asks gets no worker and nothing changes.

## How an app turns it on

An app calls `useOfflinePages(pages, userId)` from
`src/lib/hooks/use-offline-pages.ts` on the pages it wants kept, with the
start of each page's address and the person signed in. Travel calls it with
`["/trips"]`, which keeps the Trips table and every trip under it.

`useOnline()` from the same file says whether the browser has signal now. The
app draws its own "No signal" line and turns its own changes off; the shell
draws nothing.

## What the worker does

The worker is `public/offline-worker.js`, registered for the whole site with
the kept pages in its own address: `/offline-worker.js?pages=%2Ftrips`.

- **With signal, nothing is different.** Every request goes to the server as
  usual. The answer to a kept page, and to every GET the kept page makes to
  the site (its data and its code), is kept on the way back.
- **With no signal, the kept answer is used.** So a page is as old as the last
  time it was opened with signal. A page is kept under its address without
  the part after "?", so `/trips/<id>?open=<card>` finds the copy of
  `/trips/<id>` kept from a visit on another card. A kept page never opened before shows a
  plain "No signal" page saying to open it once with signal first.
- **A live feed passes straight through.** The notification bell's feed never
  ends, so it is never kept. Every other answer goes back to the page first
  and is kept after, so keeping never slows a page down.
- **Only GETs are kept.** A change is a POST, which with no signal fails the
  way it would with no worker. Nothing is saved up to send later.
- **Only kept pages.** A page that isn't listed, the admin pages among them,
  passes straight through and is never kept, and so are the requests it
  makes.
- **Code files under `/assets/`** carry a fingerprint in their names, so a kept
  one is used at once and never asked for again.
- **Room:** at most 60 pages and 2,000 other answers. The oldest make room.
  The local dev server sends every source file on its own, which is why the
  second number is high.

## Who sees what is kept

- **Opening the sign-in page empties what is kept.** Signing out lands there,
  so the next person on the phone never sees the last one's pages. So do
  Register, a sign-in link and the password pages.
- **A different person signing in empties it too.** Each kept page tells the
  worker who is signed in, and a new name clears the old person's copies.
- **Signed out without seeing the sign-in page**, such as a session that ran
  out, the kept copies stay until then. They are that person's own pages on
  their own phone.

## A new version

Raise `VERSION` in `offline-worker.js` whenever the file changes. The new
worker takes over on the next visit, without waiting for every tab to close,
and empties the old version's stores.

## What it doesn't do

- **No changes with no signal.** Read only, as Tyler picked. The app turns its
  changes off; anything that slips through fails with the app's usual error.
- **No notices.** Nothing is pushed to the phone.
- **Not every browser.** A private window or a browser that refuses the worker
  just has no offline pages.

## Test road map

1. Open a kept page with signal, then in Chrome's DevTools → Application →
   Service workers see `offline-worker.js?pages=…` running.
2. Network → Offline, reload: the page opens as it was.
3. Open a kept page never opened before, offline: the plain "No signal" page.
4. Open an admin page offline: the browser's own error, since it isn't kept.
5. Go to `/login`, then back offline to the kept page: the "No signal" page,
   since signing in emptied the store.
