# Newsletters and broadcasts

A newsletter is a saved broadcast sent to contacts. The editor gives an admin:

- A block palette, message canvas, inspector, and status panel.
- A blank-message and template starting point.
- Audience selection and test sending.
- Send-now and scheduled-send choices.

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
