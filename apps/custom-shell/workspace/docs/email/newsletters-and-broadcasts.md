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
