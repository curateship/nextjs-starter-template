# Old addresses keep working

When a listing, event, post, deal or guide changes its address, the old
address forwards to the new one. Somebody following last year's link to
`/directory/joes-diner` lands on `/directory/joes-kitchen`, not on the
page-not-found page.

The admin never types a rule. Changing the "Address part" in a record's window
and saving is the whole of it, and the field's tooltip says old links forward.

## The rules

- **Permanent.** The forward is a 301, so Google swaps the old address for the
  new one in its index instead of keeping both.
- **One hop.** Each old address points at the record's address today. Renaming
  `joes-diner` to `joes-kitchen` and then to `joes-pub` leaves two rows, both
  pointing at `joes-pub`.
- **No loops.** Renaming `joes-kitchen` back to `joes-diner` removes the
  `joes-diner` row. The record holds that address again.
- **Reuse wins.** A new record at an address an old one held ends that
  forward, so a new listing at `joes-diner` opens at `joes-diner`.
- **Deleting forgets.** Tyler's call on 17 Oct 2026: a deleted record's old
  addresses show the page-not-found page, the same as its own address. A
  listing's deals are deleted with it, and so are theirs.
- **Only to a public page.** The forward happens only when a record with a
  public page sits at the new address: a published or closed listing, or a
  published event, post, deal or guide. An old address of a record now in
  draft shows the page-not-found page, like the draft's own address.
- **Per site and per kind.** Two sites can each have once had a `joes-diner`,
  and a listing and a deal can both have once been `joes-diner` without
  touching each other.

## What it costs a page

Nothing, on a page that exists. Each of the five public pages
(`/directory/<address>`, `/events/<address>`, `/posts/<address>`,
`/deals/<address>`, `/guides/<address>`) reads its record as before. Only
when that read finds nothing does it ask where the address leads, in one indexed query, and then
either forwards or shows the page-not-found page.

## Where it lives

- `drizzle/0129_cms_old_addresses.sql`: the `old_addresses` table, one row per
  site, kind and old address.
- `src/server/directory/old-addresses.ts`: writing a row in the same
  transaction as the save, ending a forward when a record takes the address,
  forgetting rows on delete, and the read.
- `src/lib/api/directory/old-addresses.ts`: the public lookup and the 301,
  used by the five page routes.
- The writes sit in `updateListing`, `updateEvent`, `updatePost`,
  `updatePromotion` and `updateGuide`, beside the create, copy and delete of
  each, and in the repeating-event job that makes and clears dates.
- `src/server/directory/old-addresses.test.ts`: two renames, renaming back,
  reuse, delete, draft and closed, two sites, and listings, events, posts and
  deals. A guide's forward is tested in `guides.test.ts`.
