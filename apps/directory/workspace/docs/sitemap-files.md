# Sitemap files for a site of thousands of listings, events or posts

## Completed behavior

- A site with anything published in its listings, events or posts serves a
  sitemap index at `/sitemap.xml` rather than one flat file. The shell owns
  that switch. The repo's `docs/shell/public-files.md` describes it, and this
  file covers only the numbered files CMS itself serves.
- Three kinds of record come in numbered files, 5,000 addresses each:
  - listings at `/directory-sitemaps/0`, `/directory-sitemaps/1` and so on;
  - events at `/event-sitemaps/0` and on;
  - posts at `/post-sitemaps/0` and on.
- The ceiling is 50,000 addresses per file, so 5,000 leaves room for a long
  address and never gets near the 50MB limit either.
- Categories and guides stay in the flat part at `/sitemap.xml?part=pages`
  with the shell's own pages. The biggest site here has eighty categories, and
  guides are written by hand, so neither will fill a file.
- Which records are in the files did not change when events and posts moved
  out of the flat part on 17 Oct 2026. Only how they are split changed.
- One rule reads every kind: `numberedSitemapFiles` and
  `numberedSitemapChunk` in `src/server/directory/sitemap.ts`. Each kind hands
  it which rows, in what order, and where their pages live.

## What is in each kind

- **Listings:** every published listing, closed ones included, in address
  order. `closed-listings.md` says why a closed listing stays.
- **Events:** every published public event until 30 days after its last day by
  the site's calendar, and none at all while the Events page is not open to
  everyone. A private event and a draft are never in any file. `events.md`
  covers the 30 days.
- **Posts:** every published post, and none while the Posts page is not open
  to everyone. A draft is never in any file.

## Repeating events

- Each date of a repeating event is its own event with its own page, so each
  date is its own address in the files.
- A repeat makes the next eight dates ahead of time, and past dates leave after
  their 30 days. A weekly event is therefore about twelve addresses at a time,
  not one per week forever.
- A site with 11,000 event addresses has three files: 5,000, 5,000 and 1,000.

## The order inside the files

- Listings go in address order. An address is unique within a site, so a
  listing cannot fall between two files or turn up in both.
- Events and posts go oldest first, by when each was created, with the record's
  id breaking a tie. A new event or post lands at the end of the last file and
  moves nothing else.
- An event passing its 30 days moves every later event down one place, so the
  edge of each file shifts by one address. That is harmless. Each address is in
  exactly one file at any moment, and the address that moved was already read
  by the search engine in the file it came from.

## The index

- Every file appears in the index once. A kind with nothing to list adds no
  file at all, which is how a small site with no listings, events or posts
  keeps the single flat `/sitemap.xml`.
- Each file's date in the index is the most recent change among the records
  inside it, not the site's last change. A search engine refetches only the
  file that actually moved. A new or edited record always carries its file's
  date forward, wherever the record sits.
- How many files a kind has comes from one grouped query that returns one row
  per file and no record text. The index costs the same whether a site has
  three hundred records or sixty thousand.

## At the edges

- File zero of each kind always exists, even on a site with nothing to list. An
  empty list of addresses is a valid sitemap and a missing file is not.
- Anything past the last file is a plain 404, and so is any file name that is
  not plain digits. `01`, `-1`, `abc` and `1e3` are all refused.
- A file number beyond ten thousand is refused too. No site will reach fifty
  million records, and the ceiling stops a crawler asking for a number so large
  that the database cannot count that far and errors instead.
- The files are held by the same public page cache the rest of the public
  directory uses for two minutes. Saving or deleting a listing, event or post
  clears it, so a record published a moment ago is in its file on the next
  visit.
- The Events and Posts page switches are read fresh on every request, so
  switching a page away from everyone empties its files at once.
- The event files are cached per site day, so an event passing its 30 days
  leaves at the site's midnight.

## During a deploy

- `/sitemap.xml?part=pages` answers on the old and the new code, so the flat
  part never 404s.
- While the old and new copies of the app both answer for a moment, a crawler
  may read the new index from one and ask the other for `/event-sitemaps/0`,
  which the old copy does not know. That one request is a 404, and a search
  engine simply asks again later. A crawler reading the old index finds events
  and posts in the flat part as before.

## Where the numbers land

The eatdrinktoronto import is the biggest site here: 3,336 listings, of which
932 are published. That is one numbered listing file, and it would still be
one file if all 3,336 were published. A second file appears at the 5,001st
published listing, event or post of one kind.

## Test road map

1. Open `/sitemap.xml` on a site with listings, events and posts. It should be
   a `sitemapindex` with one `?part=pages` entry, then one entry per listing
   file, event file and post file.
2. Open `/event-sitemaps/0` and `/post-sitemaps/0`. Each should be a `urlset`
   of event or post addresses, and parse as XML.
3. Count the addresses in each against the site's published public events in
   the last 30 days and onward, and its published posts. They should match
   while each kind has fewer than 5,000.
4. Ask for the file one past the last of each kind. It should be a 404, not an
   empty file and not an error page.
5. Ask for `/event-sitemaps/01`, `/post-sitemaps/-1`, and a nineteen digit
   number. All should be 404.
6. Open `/sitemap.xml?part=pages`. It should hold the site's pages, its
   category addresses and its guides, and no listing, event or post addresses.
7. Make an event private, or a post a draft, then reload its file. It should
   be gone.
8. Repeat on a second site. Neither site's records should appear in the
   other's files.
9. Open `/robots.txt`. It should name `/sitemap.xml` and no numbered file.
