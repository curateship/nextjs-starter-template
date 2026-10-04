# Building a page

Every page an admin adds is built from blocks, and so is the front page. Open
Pages, click a page's name, and it opens as three panels. Nothing about a page's
content is in Settings, because a block a visitor reads is content and content
does not belong in settings.

## The three panels and what each one is for

- **Left, Add a block.** Every kind of block this page may hold, one card each,
  with its name and the line that says what it shows. The shell's own kinds come
  first and the app's own kinds after them, under their own heading. Clicking a
  card makes the block and opens it on the right, so one click gets from here to
  typing.
- **Middle, Front page.** This page's blocks, top to bottom, in the order a
  visitor reads them. Each row says its kind, its width, its alignment when it
  is not following the site, which screens it is drawn on when that is not all
  of them, and **Hidden** when it is. Dragging the grip changes the order;
  clicking a row opens it on the right.
- **Right.** The fields of whatever is selected. With nothing selected it holds
  the page's own settings instead.

**There is no bottom panel.** A bottom panel's job on the other workspace
screens is the detail for one row of the list above it, and a block has no rows.

Both side panels fold away. Drag a divider to the edge, or double-click the
blank part of a panel, and it shuts; a tab on the edge of the middle panel opens
it again. This browser remembers the widths.

A phone gets one panel at a time, as three tabs: Blocks, Add, and the third
being whatever the right panel is holding.

## A block joins the page when it is finished, not while it is typed

A new block sits in the middle panel marked **Not added yet** until **Add
block** is pressed. Everything else on the screen saves itself the moment it
changes, so this is the one place with a button.

It works that way because of what the save does. The settings save stores the
blocks through `normalizeFrontPageRows`, and that function **drops a block it
could not draw**: a testimonials block with no testimonials, an FAQ with no
questions, a logo strip with no logos, anything with no heading. A half-built
block written straight to the settings would be deleted by its own save while
somebody was still typing into it. So the panel refuses instead, and says what
is missing:

- a heading, on every kind
- at least one complete entry, on testimonials, FAQ, logos and screenshots
- both the wording and the link on a hero button, or neither
- a background colour that is a real colour

A saved block is edited the same way: change what you like, then **Save
changes**. Clicking another block, or pressing Escape, with unsaved edits in the
panel asks before throwing them away.

**What is stored is what the panel shows.** Pressing Save puts the block through
the same normaliser the settings save uses, and the list shows the result. So a
heading typed with spaces around it comes back trimmed, rather than looking one
way on this screen and another way after a reload.

## What a block can hold

Nine kinds come with the shell: plain text, rich text, hero, plans,
testimonials, FAQ, logo strip, screenshots and divider. An app adds its own kinds on top, and
CMS has five. Every kind has a heading and an optional introduction line; the
rest depends on the kind.

**Rich text is the one with no shape of its own.** It holds headings, lists,
links and emphasis, as much as the page needs, and it is what a page an admin
added starts with. Plain text is the short one: a heading and a single
introduction line of 500 characters.

**Plans is the front page's own.** A plans block needs the public prices and the
machinery to offer them, which the front page loads and no other page does, so a
plans block anywhere else draws nothing.

**A block keeps the kind it was made with.** It is chosen once, on the left, and
the right panel offers no way to change it, because changing it would leave the
fields of one kind under the name of another: an FAQ's questions do not become a
hero's button. A block of the wrong kind is deleted and picked again. The kind
is written beside the block's name at the top of the panel, so the panel says
what it is holding without spending a field on it.

The limits are the server's, not the screen's, so a hand-edited settings row
cannot carry more than these either:

- six testimonials or six screenshots in one block
- twelve FAQ entries or twelve logos in one block
- five stars on a hero

Every picture comes from the media library, picked in its own window. The save
checks that each picture belongs to the signed-in admin's library, and it checks
the ones a Visibility switch has turned off as well: switching a picture back on
must never be a way to show a file nobody checked.

**A page with no blocks draws the shell's built-in pricing front page**, so an
app that has never touched this screen looks exactly as it did. The exception is
a visitor on a site's own domain: that site gets a header and a footer with
nothing between them, because the shell's pricing page is the template's front
door and not that site's.

## The page's own settings

With no block selected the right panel holds what belongs to the page rather
than to anything on it:

- **This page.** On a page an admin added, its name and its address are fields,
  and **Save page** writes them; changing the address changes where the page
  answers and the old one stops working. On the front page both are facts: they
  live in its own file. Underneath either is who can see the page, except on the
  front page, which cannot be switched off and says so in a sentence rather than
  offering a dropdown that could never be used.
- **Search engines.** A page an admin added can be hidden from search engines
  and can name a canonical address. The front page instead has the title and
  description used only for it; both were in Settings > Public > SEO until
  4 October 2026, and the SEO tab keeps the site-wide description and the
  written-page templates.
- **Spacing** is the front page's gap between one block and the next, 0 to 160
  pixels, 80 by default. A phone draws 70% of it. The number is saved with the
  public styling rather than with the blocks, so a site that sets its own public
  look sets its own spacing too.

## Adding a page

Press **Add a page** on the Pages screen. It asks for a name and an address,
makes the page, and opens it in the editor with one empty rich text block
waiting.
Everything else about the page is built there, including its own settings.

A page added this way can hold any block the front page can. That is the whole
point of it: writing a page and building a page used to be two different things,
and only one of them could be done from the app.

## Where the blocks are kept, and which pages may have them

Every block is a row of its own in the `page_blocks` table, keyed by the site,
the page's address and its place on the page. Three things follow from that, and
none of them was true while the blocks were a list inside the settings:

- **A page other than the front page can have blocks.** The settings had room
  for one page's worth.
- **Saving one block writes one row.** A whole-settings save is how one admin's
  edit came to erase another's, and it is why this is a table.
- **A site's blocks are its own.** On a deployment serving several websites,
  each one's front page is its own; there is no app-wide list underneath that a
  second reader could disagree about.

**A page says whether it holds blocks**, in the `*.page.ts` card beside its
route:

```ts
export default definePage({
  path: "/",
  name: "Home",
  summary: "The front page a visitor lands on.",
  blocks: true,
})
```

Leave the line out and the page holds none, which is right for every page that
draws its own markup. A page that opts in has to draw them: the card is
permission, not plumbing. The front page is the only page in this shell's code
that says it, and **every page an admin adds says it by existing** — those pages
are there to be built.

## The Pages screen has two tabs

**Pages** holds the ones an admin builds: a page made of blocks, and a page they
wrote the words of. Each says how many blocks it holds, and clicking its name
opens the editor.

**System pages** holds the rest, which is the shell's own machinery: the sign-in
family, the not-found and maintenance pages, pricing, search. Their markup is
written in code, so the screen lists them, says who may see each one and counts
its visits.

**Two of them have words an admin may change.** Clicking **Page not found** or
**Maintenance** opens a window with that page's heading and message, and a
preview of what a visitor actually gets. Leave a field empty and the page uses
the shell's own wording. They were a card in Settings until 4 October 2026,
which meant a page was listed in one place and written in another. Switching
maintenance on is a different control and is still in General settings: this
window is only what that page says.

A page lands in a tab by what it is rather than by a list of addresses, so an
app that gives a second page blocks, or an admin who writes one, finds it in the
first tab with nothing else to change. The chosen tab is in the address as
`?group=system`, so the screen can be linked and survives a reload.

**An admin edits the site the website serves.** On a deployment with one public
front door, the editor, the Pages screen and the website all read the same site,
whichever site the admin happens to be switched to. With workspace domains on,
every site has its own address and the editor follows the switcher. The public
menu and footer already worked this way, and the blocks follow them.
