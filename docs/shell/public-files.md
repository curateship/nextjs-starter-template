# Public files: robots.txt and the sitemap

Two addresses on every site are written for search engines rather than people.
Nobody visits them, so nothing on screen goes wrong when they break. They just
quietly stop working, and the site stops being found.

## Which site answers

Both files answer for the site whose domain was asked for, using the same
answer the public pages use. On a deployment serving many sites, the platform
address itself is not one of the sites and gets a 404. A one site app has no
base domain and falls back to its oldest workspace, which is what every other
public read on it already does.

## robots.txt

Fixed wording. It allows everything except `/admin` and `/account`, and names
one sitemap address, `/sitemap.xml`. Numbered sitemap files never appear here.
The index is what a search engine follows, and listing the files as well would
give it two ways in and no way to tell they are the same content.

## sitemap.xml

By default this is one file listing every public address on the site: the
shell's declared pages, the admin written pages that are switched on for
everyone, and whatever rows the app adds through `sitemap.extraEntries`.
Addresses are sorted, and each carries the date it last changed where the shell
knows it.

An address that does not start with `/`, or that resolves onto another domain,
throws rather than being written. A sitemap is a statement that these pages are
ours, so it must not be possible for an app to put somebody else's address in
one.

## When one file is not enough

One sitemap file holds at most 50,000 addresses or 50MB, whichever comes first.
A site that grows past either limit is not warned. It simply stops being
indexed properly, and the only symptom is pages missing from search results
months later.

An app whose content lives in its own tables can say that its rows come in
numbered files, through the `sitemap.chunkFiles` option in
`shell-and-apps.md`. When it does, `/sitemap.xml` changes shape:

- It becomes a sitemap index, which is a list of other sitemap files rather
  than a list of addresses.
- Its first entry is always `/sitemap.xml?part=pages`, which is the same route
  answering with the flat list it used to serve. The site's pages can never be
  dropped by anything the app does with its own files.
- Every numbered file the app named follows, each with the date of the most
  recent change inside it.

An app that says nothing, or that answers with an empty list because it has
nothing published yet, gets the single flat file. That is every app except a
large directory, and the flat file is byte for byte what it was before the
option existed.

## The index must stay cheap

A search engine asks for `/sitemap.xml` often, and the index is the one file
that a very large site still has to build on demand. So the app works out how
many files there are from a count, never by reading its rows. A site of sixty
thousand listings should answer with twelve short lines and touch no listing
text at all.

## Test road map

1. Open `/robots.txt` on a site. It should name `/sitemap.xml` and no other
   sitemap address.
2. Open `/sitemap.xml` on an app that has not set the option. It should be a
   `urlset` listing every page.
3. Open `/sitemap.xml` on an app that has. It should be a `sitemapindex` whose
   first entry is `?part=pages`.
4. Open `/sitemap.xml?part=pages` on that site. It should be the `urlset` from
   step 2.
5. Run each file through an XML parser. All of them should parse.
6. Ask for the same addresses on a second site. Neither site's content should
   appear in the other's files.
7. Ask for `/sitemap.xml` on the platform address of a multisite deployment. It
   should be a 404, because the platform is not one of the sites.
