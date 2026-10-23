# The warning when a submission is already listed

When an admin opens a listing submission, the site checks whether that business
is already on it. If it looks like one, the window says "This looks like 12
Tables, already listed" with a link to that listing, and the queue marks the row
"Possible duplicate". The admin decides what to do. Nothing is rejected or merged
on its own.

## What counts as a match

Any one of three things is enough.

- **The same phone number.** Only the digits count, and only the last ten of
  them, so "+1 (416) 590-7819" and "416 590 7819" are one number. Fewer than
  seven digits is not compared.
- **The same website.** The host is compared, without "https://" or "www.", so
  "12tables.ca" and "http://www.12tables.ca/menu" are one website.
- **A very close name.** Lower case, "&" read as "and", a leading "The"
  dropped, and everything but letters and digits removed. "The Luigi's Pizza &
  Pasta" and "luigis pizza and pasta" are one name. One name sitting inside the
  other counts too, but only when the shorter one is at least eight letters, so
  "Luigi's Pizza" matches "Luigi's Pizza & Pasta" and "Pizza" matches nothing.

Some details of those rules matter:

- **A website many businesses share keeps its page.** A Facebook, Instagram,
  Linktree, Yelp, Google Maps, Uber Eats, OpenTable or similar link is compared
  with the first part of its path, `facebook.com/luigispizza`, because the host
  alone is the same for every business on it. A bare `facebook.com` is not
  compared at all.
- **Accented letters are dropped, not unaccented.** "Café Luna" is read as "caf
  luna". The database writes the same rule and has no unaccent without an
  extension, and the two sides must read a name the same way.
- **A typo is not a match.** "Luigis Piza" does not match "Luigi's Pizza". Only
  the rules above count.
- **Drafts count.** A draft is the same business, only not live yet, so the
  window says "already listed as a draft".
- **Only this site's listings.** A listing on another site never matches, even
  with the same name, number and website.
- **Only submissions waiting for a decision are checked.** An approved or
  rejected one is a record, and a warning on it would be noise.

A chain matches on its name and its website, which is why the window says what
matched under each listing. "Same phone number" is close to proof. "Very close
name" alone is the weakest of the three. The window lists at most three
listings, the ones that matched on the most things first, and a phone match
before a website match before a name match.

## Rejecting with a pointer

A published match carries a **Reject, point to it** button. It rejects the
submission and tells the sender where the existing listing is:

- **The sentence comes first in the note.** "It looks like 12 Tables, which is
  already listed on Eat Drink Toronto. If it is your business, claim it from its
  page and you can keep its details up to date." Whatever the admin typed in the
  note box follows it. The record of the rejection shows both under "The note
  that was sent", because that is what was sent.
- **The email carries a button to the claim form**, `/directory/<slug>?claim=start`
  on the site's own address, with the address written out underneath for a mail
  reader that drops buttons. An owner who missed their own page ends up looking
  after it.
- **It sends the page instead of the claim form** when the site has claiming
  switched off in Settings → Directory, or somebody already owns the listing.
  The sentence then stops after "already listed on Eat Drink Toronto."
- **A draft has no button**, because it has no page a stranger could open. The
  server refuses a draft too, in case the window was stale.

The ordinary Reject button is unchanged and points nowhere.
`submission-review-email.md` says what the admin is told about the email.

## How fast it is

The queue asks once for its whole page, never once per row. The query narrows
the site's listings to the ones that could match, then
`src/lib/directory/submission-duplicates.ts` decides which submission each
belongs to and on what, so the rule lives in one file. The name key is worked
out once per listing before the names are compared.

Measured on the local copy of Eat Drink Toronto, 3,333 listings: 144ms for a
full page of 50 waiting submissions, each with a name, a phone number and a
website. A typical queue holds a handful, and takes less. Writing the name rule
straight into the comparison took 550ms for the names alone, because the key
was worked out again for every name.

## Where it lives

- `src/lib/directory/submission-duplicates.ts`: the three keys and the sentence
  under a match.
- `src/server/directory/submissions.ts`: `possibleDuplicatesFor`, the one
  query, and the pointer a rejection carries.
- `src/components/directory/submission-dialog.tsx`: the warning card.
- `src/components/directory/submissions-dashboard.tsx`: the row marker.
