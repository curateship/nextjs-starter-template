# Search suggestions on the directory

The search box above a site's listings offers a few matches while somebody is
still typing. Picking one goes straight to that page. Ignoring them and
pressing Enter runs the ordinary search, exactly as the box did before the list
existed.

## What is offered

- **Two letters before anything is asked.** One letter would match most of the
  directory and tell the visitor nothing.
- **Up to three categories, then up to five listings.** Categories are first
  because a category is a page of results and a listing is one shop. Somebody
  typing "pizz" usually wants Pizza before any single pizzeria.
- **Published listings on the visited site only.** A draft never appears, and
  neither does another site's listing.
- **A category with nothing published in it is never offered.** Clicking it
  would open an empty page, which reads as a broken site.
- **The same matching rules as the browse list**, on a listing's name and on
  the line under it. A name match is above a description match, so "Luigi's
  Pizza" beats a bakery whose blurb mentions pizza. A visitor who ignores the
  list and presses Enter must not get a different set of results from the one
  they were being offered.

Each row is a real link, so it can be middle-clicked into a new tab like
anything else on the directory.

## The keyboard

- **Down and Up** walk the list and wrap around at both ends.
- **Enter on a highlighted row** opens it.
- **Enter with nothing highlighted** runs the ordinary search on what was
  typed.
- **Escape** closes the list and keeps what was typed. Without stopping the
  browser's own handling, a search box empties itself on Escape in Safari and
  Chrome, so closing the list would also throw the words away.
- The next keystroke after an Escape opens the list again.

A screen reader is told how many suggestions there are, and which row is
highlighted, through the box itself rather than through the list.

## How often it asks the server

- **Typing has to stop for 200ms before a request goes out.** Typing "pizza" at
  speed is one request, made when the typing stops, not five on the way there.
- **Every answer is remembered** for as long as the page is open, up to the
  last 30 queries. Deleting a letter and typing it again draws from memory with
  no second request.
- **Every answer is filed under the word it answers**, so a slow reply to an
  earlier word can never land in the list for the word now in the box. It waits
  there in case the visitor types that word again.
- **A failed lookup is not remembered**, so retyping the word asks again. The
  same is true of a word pushed out of memory by the 30 newer ones.

## The limit, and what a visitor sees when it bites

One address may ask 60 times a minute. Past that the endpoint answers with two
empty lists rather than an error, so the box is a plain search box with the
suggestions switched off for a minute. A visitor who did nothing wrong is never
shown a message about it, and pressing Enter still searches.

The lookup needs no account, which is written down with its reason in
`src/app/open-endpoints.ts` alongside the directory's other public doors.

## Checking it

`npm run test` covers both halves. The server tests in
`src/server/directory/public.test.ts` prove a draft and another site's listing
never appear. The tests in
`src/components/directory/public/directory-suggestions.test.tsx` prove the
arrows, Enter, Escape, and that typing a word at speed asks once.
