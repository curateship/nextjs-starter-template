# Sitemap files for a site of thousands of listings

## Completed behavior

- A site with published listings serves a sitemap index at `/sitemap.xml`
  rather than one flat file. The shell owns that switch. The repo's
  `docs/shell/public-files.md` describes it, and this file covers only the
  numbered files CMS itself serves.
- Listing addresses come in numbered files at `/directory-sitemaps/0`,
  `/directory-sitemaps/1` and so on, 5,000 addresses each. The ceiling is
  50,000 per file, so 5,000 leaves room for a listing with a long address and
  never gets near the size limit either.
- Each file lists the published listings on that site in address order. An
  address is unique within a site, so a listing cannot fall between two files
  or turn up in both.
- Categories are not in the numbered files. They stay in the flat part at
  `/sitemap.xml?part=pages` with the shell's own pages, because the biggest
  site here has eighty of them and they would not fill a file.
- Drafts are never in any of it.
- File zero always exists, even on a site with nothing published. An empty list
  of addresses is a valid sitemap and a missing file is not.
- Anything past the last file is a plain 404, and so is any file name that is
  not plain digits. `01`, `-1`, `abc` and `1e3` are all refused.
- A file number beyond ten thousand is refused too. No site will reach fifty
  million listings, and the ceiling stops a crawler asking for a number so
  large that the database cannot count that far and errors instead.
- How many files a site has comes from one grouped query that returns one row
  per file and no listing text. The index stays the same cost whether a site
  has three hundred listings or sixty thousand.
- Each file's date in the index is the most recent change among the listings
  inside it, not the site's last change, so a search engine only refetches the
  file that actually moved.
- Files are held by the same public page cache the rest of the public
  directory uses, and saving or deleting a listing already clears it. A
  listing published a moment ago is in its file on the next visit.

## Where the numbers land

The eatdrinktoronto import is the biggest site here: 3,336 listings, of which
932 are published. That is one numbered file, and it would still be one file if
all 3,336 were published. A second file appears at the 5,001st published
listing.

## Test road map

1. Open `/sitemap.xml` on a site with listings. It should be a `sitemapindex`
   with one `?part=pages` entry and one entry per numbered file.
2. Open `/directory-sitemaps/0`. It should be a `urlset` of listing addresses,
   and it should parse as XML.
3. Count the addresses in it against the site's published listing count. They
   should match while the site has fewer than 5,000 published.
4. Ask for the file one past the last. It should be a 404, not an empty file
   and not an error page.
5. Ask for `/directory-sitemaps/01`, `/directory-sitemaps/-1`, and a nineteen
   digit number. All should be 404.
6. Open `/sitemap.xml?part=pages`. It should hold the site's pages and its
   category addresses, and no listing addresses.
7. Publish a listing, then reload its numbered file. The new address should be
   there.
8. Repeat on a second site. Neither site's listings should appear in the
   other's files.
9. Open `/robots.txt`. It should name `/sitemap.xml` and no numbered file.
