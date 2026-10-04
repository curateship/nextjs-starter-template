# Building the front page

The front page is built on its own screen, reached from Pages. Open Pages, click
**Home**, and the front page opens as three panels. Nothing about the front
page's content is in Settings any more, because a block a visitor reads is
content and content does not belong in settings.

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

Eight kinds come with the shell: plain text, hero, plans, testimonials, FAQ,
logo strip, screenshots and divider. An app adds its own kinds on top, and CMS
has five. Every kind has a heading and an optional introduction line; the rest
depends on the kind.

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

- **This page** says the page's name, its address with a link that opens it, and
  who can see it. The front page cannot be switched off, so it says so in a
  sentence rather than offering a dropdown that could never be used.
- **Search engines** holds the page title and description used only for this
  page. Both were in Settings > Public > SEO until 4 October 2026; the SEO tab
  keeps the site-wide description and the written-page templates.
- **Spacing** is the gap between one block and the next, 0 to 160 pixels, 80 by
  default. A phone draws 70% of it. The number is saved with the public styling
  rather than with the blocks, so a site that sets its own public look sets its
  own spacing too.

## Only the front page, for now

Every other row on the Pages screen behaves as it did. A page an app wrote is
changed by changing its code, and a page an admin wrote holds words rather than
blocks, so neither opens this screen. `/` is the one address built from blocks,
and the editor refuses any other address by sending you back to the list.

The deeper reason is where the blocks live: they are still a field in the
app-wide settings, which has room for one page's worth. Giving every page its
own blocks is a table of their own, and that is the next piece of work.
