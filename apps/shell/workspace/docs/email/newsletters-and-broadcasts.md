# Newsletters and broadcasts

A newsletter is a saved broadcast sent to contacts. Since 7 Nov 2026 it lives
in the CRM's Broadcasts tab and is written on the CRM's right panel, never on
a page of its own (Tyler: "consolidate this into the CRM dashboard too and
not linked it outside"; his answer that day: the editor is "a '/' page in the
right panel. Each block's settings are in its own ⋮. Subject, audience,
schedule and test send are in the broadcast's ⋮. The send state and the
counts are in the footer").

## The Broadcasts tab

- **The view dropdown:** Drafts, Scheduled, Sent and Templates, each with a
  count. Sent
  holds a send still going or paused too, and the row says which
  (`BROADCAST_STATUS_GROUPS` in `src/server/email/broadcasts.ts`).
- **New newsletter** asks for a name only you see, then opens the newsletter
  on the right. The list is read again before it opens, so the new row is
  there at once; deleting reads the list before letting go, likewise.
- **The table:** Newsletter, Subject, Status, Sent, and when it changed,
  goes or went, laid out as Project's tables are.
- **A row's right-click** has Mass select, Make a copy and Delete. Mass
  select deletes several at once.

## Writing one, on the right

`BroadcastRecord` in `src/components/crm/broadcast-records.tsx`:

- **The email** is drawn as it will arrive (`EmailPage` in
  `src/components/crm/email-page.tsx`, built on `BroadcastCanvas`). It draws
  at the panel's width, up to the 600px it is sent at, the way the old
  editor's Mobile view did. Drag the panel wider to see it wider. The panel
  stays white and the email is a faint grey box on it (Tyler, 7 Nov 2026:
  "its supposed to be faint light gray").
- **"/" blocks:** a right-click on the email opens the five email blocks
  (Header, Rich text, Button, Divider, Footer) at the pointer, and the one
  picked goes under the block clicked. The + between blocks does the same.
- **Written in place** (Tyler, 7 Nov 2026: "I should be able to edit the
  subject inline", "preview as well", and of Rich text: "This block should
  let me inline writes with tiptap"): the subject, the preview line and every
  Rich text block are typed straight onto the email. Bold, headings and lists
  come from the keyboard (Cmd+B, "## ", "- "); the block's options still hold
  the full editor with links, pictures and the name tags.
- **A block's options** open only from the cog in its bar, beside the drag
  handle, copy and bin (Tyler: "only clicking it opens the dropdown"). The box
  is as tall as the options, up to 70% of the screen. Pressing a block picks
  it; pressing anywhere outside the email's blocks lets it go.
- **Spacing:** the email sits 24px from the panel's top and sides alike.
- **Block lists** show each block's icon beside its name, from one map
  (`src/lib/broadcasts/block-icons.ts`).
- **The newsletter's ⋮:** General holds the subject, the preview line, the
  From name, the name, Start from a template, Save as a template, Make a copy
  and Delete. Audience says who it goes to; that is picked on the way out.
  Sending is where the send has got to, one line per address.
- **The footer:** the state, the counts, and Review and send, which saves
  what is typed and then opens the last check (who, how many, when, a test).
- **It saves** 700ms after the last change, the same blocks list as before,
  so every newsletter written in the old editor opens and sends the same.
- **A template** opens on the right read only, with "New newsletter from it"
  in its footer and Make default and Delete in its ⋮.

The old addresses `/admin/newsletter` and `/admin/newsletter/<id>` forward
into the Broadcasts tab, the second with that newsletter open.

The message sheet stays white in light and dark themes because it previews the
email a recipient gets. The move, copy, remove, and add-block controls are app
controls, so they use the active app theme and the shared button and tooltip
components even while they float over that sheet.

Ticked newsletters clear when the search, sort, page, or rows-per-page changes.
The bulk delete count therefore refers only to rows that remained on screen
after they were selected.

The audience can be a contact segment rather than a copied list. The server
takes the audience snapshot needed for the send, then creates delivery records.
That keeps a changing segment from quietly changing work that has already
started.

Each batch asks the database only for people this newsletter has not reached
yet, oldest first, and stops at the batch size. It used to read the whole
audience and every delivery so far on every batch of 50. Measured on one test
send to 1,001 contacts (21 batches), the rows read went from 53,711 to 23,253.
About 21,000 of what is left is the contact sync before each batch, which still
runs and still reads every contact, on purpose.
The total recipients figure is the largest of the stored total, the live
audience count and the deliveries already made, so somebody who was mailed and
then opted out still counts.

## Send states

A broadcast moves through these states:

- Draft, scheduled, and paused messages remain editable.
- Pausing stops new deliveries. Resuming lets the background pass continue.
- Sending and sent messages are no longer editable.

The status panel reports counts and individual delivery outcomes. Delivery
records keep provider states such as:

- Delivered.
- Bounced.
- Complained.
- Failed.

A provider accepting a message does not mean the recipient read it.
Long delivery lists use the shared Load more button. A second click while the
next page is loading does not start another request.

## Templates and unsubscribe

Templates save reusable newsletter content without creating a send. A broadcast
copies its template content, so later template edits do not rewrite the message.

Contact mail contains a signed unsubscribe link. The public unsubscribe route
checks that signature before changing the contact. A person can unsubscribe
without signing in, but cannot use the link to change somebody else's address.

Scheduled sends and unfinished deliveries run through the shared background
pass. See [Background work](../operations/background-work.md) for that process.

## The email in the CRM follows the theme

In the CRM's right panel the email sits on a faint grey of the theme's own.
In dark mode its white grounds and dark words give way to the theme's, so it
reads as part of the dashboard (Tyler, 7 Nov 2026: "this is not theme
sensative"). What is sent is unchanged: a reader still gets the white email.
