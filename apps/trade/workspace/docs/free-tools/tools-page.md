# The free tools page

`/tools` is the public list of every free tool Trade offers. It opens without
an account, and it lists only tools that have shipped.

## What a visitor sees

- **The groups.** Calculators, Live market pages, Wallet tools and Alerts, in
  that order. A group with no shipped tool is left out, not shown empty.
- **Each card.** The tool's name and one line on what it answers. The whole
  card is the link to the tool.
- **The search box.** It narrows the cards by name as you type, ignoring
  capitals and spaces at either end. It matches the name only, never the
  one-line summary. It asks the server nothing, because the list is already on
  the page.
- **No match.** The page says `No tool has "abc" in its name.` in place of the
  cards. The clear button in the box brings every card back.
- **Nothing shipped.** The page says `No free tools are open yet. Check back
  soon.` and hides the search box.
- **The sign-up link.** The page ends with a Create account button for a
  visitor who is not signed in. A signed-in member does not see it.

## The one list of tools

`src/lib/free-tools/registry.ts` holds every tool, shipped or not. Each entry
has a name, a one-line summary, a group, its public address and a `shipped`
flag. The tools page reads it now, and the share button (task 30) will read
the same list.

- **`shipped: false`** means the tool is planned and not open to visitors. It
  is missing from `/tools` and from the sitemap.
- **`shipped: true`** means the tool's page exists and is open. Its card shows.
- **The test that keeps the two honest.** `registry.test.ts` fails if a
  shipped tool has no page declaration at its address, which would be a card
  opening a 404. It also fails if an unshipped tool has one, because every
  declared public page is listed in the sitemap.
- **Placeholder addresses.** The tasks for Telegram alerts, new-listing alerts,
  watch any wallet and the daily recap do not name a page. Their entries use
  `/tools/telegram-alerts`, `/tools/new-listing-alerts`, `/tools/watch-wallet`
  and `/tools/daily-recap` until whoever builds them sets the real one.

## Putting a new tool on the page

1. Build the tool's route and its `*.page.ts` declaration (`definePage`,
   `layout: "marketing"`), the way `src/routes/tools.page.ts` does.
2. Set `shipped: true` on its entry in `registry.ts`, and correct the address if
   the page ended up somewhere else.
3. Run `registry.test.ts`. It passes only when the flag and the page agree.

Nothing else is needed for the sitemap or the share preview:

- **Sitemap.** The shell lists every declared public page in `/sitemap.xml` on
  its own. Adding the same address through the app's sitemap option in
  `src/app/server-options.ts` would list it twice, so don't. The tasks point at
  `appSitemapChunkFiles`, which is for splitting a very large sitemap into
  numbered files and has nothing to do with this.
- **Share preview.** The root route turns the declaration's `name` and
  `summary` into the page title and the description social sites show, through
  `src/lib/pages/public-metadata.ts`. The site's share image from Settings is
  used for the picture.
- **Route file.** A tool's route cannot be `src/routes/tools.<name>.tsx`. That
  file name nests it under the tools page, which has no outlet, so the tool
  would never draw.

## The Free tools link in the public menu

The public menu is a saved setting, not code. An admin adds the link in
Settings, under the Public card, on the Navigation tab: Public menu, then Add
link, with the label `Free tools` and the address `/tools`. The shell has no app
option for default menu links, so this cannot be done from the Trade code
without editing a shell file.

Add the link only after `/tools` is deployed. The local database is the live
one, so saving it locally puts the link on the live site straight away.

## Switching the page off

`/tools` is on the Pages dashboard like every declared page. An admin can
switch it off or make it members-only there, and the sitemap follows that
switch.

## Looking at the layout before any tool ships

On the local dev server only, `/tools?preview=1` lists every tool in the
registry. Unshipped cards say "Not built yet." and are not links. The
production build ignores `preview`, so visitors never see it.
