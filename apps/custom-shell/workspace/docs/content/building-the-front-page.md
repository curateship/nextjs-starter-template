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
  typing. A card can also be dragged into the middle panel, which is how a
  block lands between two that are already there. The pointer has to travel 8px
  before it counts as a drag, the same distance every other list in the app
  uses, so a click is still a click.
- **Middle, Front page.** This page's blocks, top to bottom, in the order a
  visitor reads them. Each row carries the same picture its kind wears on the
  left-hand cards, so a long page can be read by its shapes rather than by
  reading every heading. After the picture the row says its kind, its width, its
  alignment when it is not following the site, which screens it is drawn on when
  that is not all of them, and **Hidden** when it is. Dragging the grip changes
  the order; clicking a row opens it on the right. The arrow at the top right of
  this panel's header opens the page in a new tab, as a visitor sees it, which
  is the question somebody building a page asks constantly.
- **Right.** The fields of whatever is selected. With nothing selected it holds
  the page's own settings instead, and the X at the right-hand end of its
  header is the way back to them. **Both states of this panel have a button that
  shuts every card in it at once**, and opens them all again the next time it is
  pressed: beside the X on a block's settings, and on its own in the header of
  the page's settings. The first press always shuts, because opening a panel
  that is already open is a press that does nothing. Shutting from here is the
  same as shutting each card by hand: this browser remembers it, so the panel is
  still shut after a reload.

**The right panel is drawn the same way the newsletter editor's is.** Its cards
are `InspectorCard` from `src/components/shared/inspector-card.tsx`: a grey box
with a border, a heading and an arrow that is always there rather than revealed
on hover. Tyler asked for the two panels to match on 5 October 2026; this panel
used the white `CollapsibleSettingsCard` the Settings screens use until then,
and a white card on a white panel reads as one long list instead of a set of
groups. The Settings screens keep the white card, because a settings page is a
column of cards on a grey canvas and the problem does not arise there.

**There is no bottom panel.** A bottom panel's job on the other workspace
screens is the detail for one row of the list above it, and a block has no rows.

Both side panels fold away. Drag a divider to the edge, or double-click the
blank part of a panel, and it shuts; a tab on the edge of the middle panel opens
it again. This browser remembers the widths.

A phone gets one panel at a time, as three tabs: Blocks, Add, and the third
being whatever the right panel is holding.

## A block saves itself, once it has enough to draw

There is no Save button and no Cancel. A block writes itself a moment after the
typing stops, the way every other screen in the app does, and the sticky header
says Saving… and then Saved. Tyler asked for this on 5 October 2026; the panel
had a footer with **Cancel** and **Save changes** until then.

**A kind is dragged onto the list, or added with the plus on its card.**
Clicking the card itself does nothing: Tyler's call on 5 October 2026, because
a list of cards you read by pointing at them must not build a page while you
read it. The plus appears when the pointer or the keyboard reaches the card,
and it is also how a keyboard adds a block, since a drag has no keyboard.

**A block joins the page the moment it is added**, named after its kind — a new
plain text block is called "Plain text" until you type over it. It arrives
named for a reason: a block with no heading is one the store drops, so an
unnamed new block could not be written at all.

**Dragging a kind onto the list is the other way in**, and the one that decides
where the block lands. **The list makes way**: a space the shape of a block
opens where it would go, named after what is being carried, and the blocks
below move down to leave room for it. Which half of a block the pointer is over
decides which side the space opens on, so a block can be dropped last as easily
as first. The space grows rather than appearing, because a list that jumps 66px
in one frame reads as the page breaking rather than as the page making room.

The block is written first and moved into place afterwards, because a block has
to exist before it can be put in order. **It waits where it was dropped while
that happens**, rather than at the end of the list: the write appends and the
order follows it, so a block drawn where the write put it would appear at the
bottom and then move, which is a block somebody has to watch travel.

**Where the space goes is worked out from where the blocks were when the drag
arrived, measured once.** The space pushes every block below it down, so a drop
worked out from where the blocks are *now* is worked out from positions the
space itself moved: the pointer ends up over the space, the space jumps to the
end, the blocks come back, the pointer is over a block again, and round it
goes. That loop is what made the list skip about while it was being dragged
over. One handler on the panel answers for the whole list, and no block answers
for itself.

**The name on the space cannot travel on the drag.** A browser hands
`dataTransfer.getData` back empty until the moment of the drop, so the list
would have nothing to call the space it is opening. Both panels are in one
React tree, so the left panel passes the name up as the drag starts and the
editor hands it down. With no name the space says "It lands here", which is
what a drag from outside the app would get.

**The two drags on this screen are two different mechanisms, deliberately.**
Reordering the blocks is dnd-kit, the way every sortable list in the app is.
Carrying a kind in from the left panel is the browser's own drag, the way the
automation palette does it. They were briefly both dnd-kit, in one context
wrapping both panels, and that broke reordering: a context holding a sortable
list and a card dragged in from outside turns the whole list into one drop
target, so a row being dragged has no row to land on and nothing happens. The
two have nothing to say to each other, so they never share a context.

**An empty testimonials, FAQ, logo strip or screenshots block is kept**, and
draws its heading with nothing under it until the first entry is filled in.
Those four used to be dropped by the store while they were empty, which meant
one could never be written at all: an FAQ added from the left panel sat in the
list marked "Not added yet" with nothing anybody could do about it. Tyler found
one there on 5 October 2026.

**A half-typed entry is still a reason to wait.** The store drops an entry
missing its question, its answer, its picture or its name, so writing the block
while one is being typed would throw those words away. The editor holds the
write until the entry is complete, and the block is already on the page by
then, so nothing on screen says anything about it.

The other rules the store keeps, and the editor waits for in the same way:

- a heading, on every kind, which a new block arrives with
- both the wording and the link on a hero button, or neither
- a background colour that is a real colour

**A new block is given its id when it is picked, not when it is first saved.**
The write is an upsert on that id, so a second keystroke arriving before the
first answer updates the block being made rather than putting a second copy of
it on the page.

**Leaving the panel saves what can be saved.** The X at the right-hand end of
the panel's header closes it and goes back to the page's own settings, and so
does Escape. Either one writes the block first rather than waiting out the
timer, so closing never loses the last thing typed. The only thing that still
asks a question is leaving a block that **cannot** be saved, because that is the
only work leaving can throw away.

**What is stored is what the page draws.** The save puts the block through the
same normaliser the read uses, so a heading typed with spaces around it is
stored trimmed. The panel keeps what was typed while it is open, and the list
beside it shows what was stored.

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

- **This page.** On a page an admin added, its name, its address, its picture
  and the two search settings below are fields, and one **Save page** at the
  foot of the panel writes all of them; changing the address
  changes where the page answers and the old one stops working. On the front page both are facts: they
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
  look sets its own spacing too. A block can ask for something else on either
  of its sides; the next section is how.

**This panel is the one place on the screen with a Save button**, and it sits
in a strip at the foot of the panel, under everything it writes, where it stays
while the panel is scrolled. It was between two of the cards until Tyler moved
it on 6 October 2026. It is greyed out until something changes.

**Why a button here when a block saves itself:** the page's address is what the
editor is keyed by. A half-typed `/ab` written as it is typed would rename the
page, move its blocks to that address and break every link to it, four times
over while somebody types `/about`.

## A block can set its own spacing

Every block has a **Spacing** card of its own, holding **Space above** and
**Space below**, 0 to 160 pixels each. Until one of them is moved both say
"Page default" and the block follows the page's own number.

**Each block keeps half of each gap, and the two halves add up.** A page set to
80 gives every block 40 above and 40 below, so two blocks still sit 80 apart.
That is the rule to hold on to, because it is what makes the numbers
predictable:

- One block sets 0 below, the next leaves its own alone: 0 + 40, so 40 between
  them.
- One block leaves its own alone, the next sets 120 above: 40 + 120, so 160.
- Both set 0: nothing between them, and the blocks touch.

Tyler chose adding over "the bigger number wins" on 5 October 2026. A block
owning its own air is the rule with nothing to remember, and it is the only one
where a single block can always close a gap on its own.

**The first block's Space above and the last block's Space below start at
nothing**, not at half the page's number, because there is no block on that
side to be spaced from. The air above the first block belongs to the page. A
block that names that side still gets exactly what it asked for.

**A phone draws 70% of whatever these say**, the same share the page's own
number gets, so a gap that separates two blocks on a desktop is not most of a
phone screen. **Flat mode collapses them both**, because flat is the whole site
asking for no air and a page where half the blocks kept their gaps would be
neither one thing nor the other.

**Follow the page again** appears under the two sliders once either side has
been set, and puts both back to the page's number.

This is not the hero's own **Space above and below**, which is a different
thing in a similar name. The hero's is padding inside its background colour, so
a hero with a band draws the colour across that air. These two are the gap
outside the block entirely, where no background reaches.

## Adding a page

Press **Add a page** on the Pages screen. It asks for a name, an address and a
picture, makes the page, and opens it in the editor with one empty rich text
block waiting.
Everything else about the page is built there, including its own settings.

**The picture is optional and it belongs to the page**, like its name and its
address, rather than being a block on it. The same field is in the editor's
Page settings panel afterwards, so choosing it here only saves opening that
panel straight away. It is drawn at the top of the page, above every block, as
a square 384px across, and it is the square 96px field every other picture in
the app is chosen in. Tyler asked for it on 6 October 2026, after seeing it
built as a block kind first: "we dont need a picture block. We just need to add
it to the modal and the page setting."

The picture has to be one in the signed-in admin's own media library, and that
is checked before the page is made, so a refused picture leaves no half-built
page behind. A picture the page is already drawing is never re-checked, or a
page whose file was tidied out of the library months ago could not have its
name changed again. Clearing the field takes the picture off the page and the
name with it: a name with no picture would be read out by a screen reader with
nothing to read it about.

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
