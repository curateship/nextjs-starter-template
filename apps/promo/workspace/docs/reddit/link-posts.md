# Link posts: reading the page a post points to

A good share of Reddit posts are a link with no words of their own. Promo
reads the linked page's title and opening paragraph, so there is something to
write a comment about. Before this, every link post was a dead end: it could be
found, ranked and opened, and then nothing useful could be drafted for it.

## Where the link comes from

- **The search already has it.** Reddit's own data for a post carries the
  address it links to. The browser passes it on (`_link_url` in
  `docker/browser/routines/reddit.py`), and when it has to read the rendered
  page instead, it takes the post's `content-href`.
- **The app decides which links are worth reading** (`cleanLinkUrl` in
  `src/server/social/link-page.ts`). A web page outside Reddit is kept.
  Reddit itself (a crosspost, a gallery, a picture or a video it hosts),
  picture and video sites, and any address ending in a picture, video, sound
  or PDF file are dropped. So is anything that is not http or https, and any
  address carrying a name and password.
- **Stored on the post** as `promo_finds.link_url`
  (`drizzle/0107_promo_link_pages.sql`). A post stored before this gets its
  link the next time a search sees it. A later search that could not see the
  link never empties it.

## When it is read

Off the request, on the shell's fifteen-second ticker (`promo-read-link-pages`
in `src/app/server-options.ts`). No browser: a plain request.

- **Four posts a pass, side by side, newest first.** Only posts with no words
  of their own that are still waiting to be looked at. A skipped post will
  never be answered and a commented one already has been.
- **Tried once.** Each post is stamped with when it was tried before the page
  is fetched, so two passes never read the same page and a page that hangs is
  never retried forever.
- **Eight seconds for the whole read**, every redirect included, and at most
  512 KB of the page. The title and opening paragraph sit well inside that.

## The guard

This is the one place the server fetches an address a stranger chose, so it is
the main piece of the work. Without it, a Reddit post linking to
`http://169.254.169.254/` would make the server read its own cloud metadata.

- **Every address must resolve to the public internet**, by the same rule a
  proxy host is held to (`publicAddresses` in
  `src/server/browser/proxy-probe.ts`). The name is looked up first, because a
  public-looking name can answer with a private address.
- **Every redirect is checked again.** A public page that redirects inside the
  network is refused at the redirect, before anything inside is asked.
- **The connection goes to the address that was checked**, never to a second
  lookup of the name. Otherwise a name could answer public for the check and
  private a moment later.
- **Only the web's own ports.** An address naming a port, such as `:6379`, is
  not read.
- **A refusal is recorded twice**: on the post, where the answer panel shows
  it, and as a line in the server log naming the post and the address.
- **IPv6 is let through only inside the public range.** The older check listed
  the private ranges one by one and missed `[::ffff:7f00:1]`, which is how a
  URL writes `::ffff:127.0.0.1`, and which reaches this machine. The proxy
  check uses the same rule, so it is closed there too.

## What is kept

The page's share title (`og:title`) or its `<title>`, and its first paragraph
of 60 characters or more, skipping menus, headers, footers, asides and
footnote marks. A page with no such paragraph falls back to its own
description. The title is capped at 300 characters and the paragraph at 1,000,
cut at a word. A page that only draws itself with JavaScript has neither, and
is recorded as unreadable.

The page is read in one walk from start to end (`summarisePage` in
`src/server/social/link-page.ts`). A page built to be slow to read, such as
half a megabyte of tags that never close, takes milliseconds like any other.
Reading it by search patterns instead took up to three and a half minutes, and
the whole server waited while it ran.

## What the answer panel shows

- **The page was read:** a box labelled "The page this post links to", with the
  site's name linking out, the page's title and its opening paragraph. Its own
  box, because these are somebody else's words and must never read as the
  poster's.
- **Not tried yet:** "Promo is reading the page it links to, which shows here
  when you open the post again."
- **Could not be read:** the old honest line, "This post has no words of its
  own. It is a link or a picture.", followed by why, such as "The page
  answered 403." or "The link points inside the network (169.254.169.254), so
  it was refused and not read."
- **A picture, or a post with no link:** the honest line alone.

## What the AI is told

The page goes into the prompt labelled as the page this post links to,
"written by somebody else, not the poster", with its address, title and
opening. One extra rule is added: the poster shared that page and did not
write it, so talk to the poster about what they shared, not to the page's
author. A post with words of its own is drafted exactly as before, page or not.

## Out of scope

Pictures, video, anything behind a sign-in or a paywall, and reading the whole
article.
