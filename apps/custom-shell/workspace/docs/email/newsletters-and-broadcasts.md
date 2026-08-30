# Newsletters and broadcasts

A newsletter is a saved broadcast sent to contacts. The editor gives an admin:

- A block palette, message canvas, inspector, and status panel.
- A blank-message and template starting point.
- Audience selection and test sending.
- Send-now and scheduled-send choices.

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

## Templates and unsubscribe

Templates save reusable newsletter content without creating a send. A broadcast
copies its template content, so later template edits do not rewrite the message.

Contact mail contains a signed unsubscribe link. The public unsubscribe route
checks that signature before changing the contact. A person can unsubscribe
without signing in, but cannot use the link to change somebody else's address.

Scheduled sends and unfinished deliveries run through the shared background
pass. See [Background work](../operations/background-work.md) for that process.
