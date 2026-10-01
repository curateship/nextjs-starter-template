# Users, contacts, and segments

Users are people who can sign in. Contacts are email recipients inside a
workspace. One person may be both, but the records have different jobs. Turning
a contact into a user or suspending a user must not silently rewrite newsletter
history.

## Users

The Users dashboard lets an admin:

- Search, filter, sort, and page through accounts.
- Create an account, either by emailing the person a link that sets their own
  password, or by typing a password for them.
- Change a role, plan, profile, or status.
- End sessions and inspect security details.
- Temporarily view the product as that person.

Add account asks for a name, an email address and a role. Leaving the optional
password empty is the normal path: the account starts with no password at all,
and the emailed link sets one and confirms the address. Typing a password
instead sends no email, stores that password, and marks the address verified so
the person can sign in as soon as the admin passes it on. The password is never
shown again.

Suspension signs the person out and blocks sign in. Deletion first schedules the
account for removal so an admin can restore it during the recovery period. The
server protects the last active admin from changes that would leave the platform
without an administrator.

## Contacts

The Contacts dashboard can:

- Add, edit, tag, unsubscribe, and delete workspace contacts.
- Bulk update contacts.
- Sync account details into matching contacts.

List search, filters, sort, page, and an open record live in the address so the
view survives reload and browser navigation.

## Segments

Segments have two membership models:

- A static segment contains chosen contacts.
- A dynamic segment contains rules and calculates membership from current
  contact data.

The segment screen shows fresh counts and lets an admin turn current contact
filters into reusable rules.

Newsletters and automations may depend on a segment. The server refuses to
delete a segment while another saved record still refers to it. Removing the
reference first makes the effect explicit.

### A hand-picked segment waits for its people before it can be saved

A hand-picked segment's people live in their own table, so the edit window asks
the server for them after it opens rather than being handed them with the list.
A save sends the whole list of people and the server replaces the segment with
it, so a save that went out before the people arrived would write an empty
segment over a full one. Renaming a segment would have deleted everybody in it.

The window therefore tracks whether those people have arrived:

- **While they are loading**, the people card shows a loading line where the
  already-chosen people will appear, the live count says it is counting, and
  Save is switched off with the reason in a tooltip.
- **If the load fails**, the card shows the failure in place with a Try again
  button, and Save stays off. The reason on Save says that saving now would
  empty the segment.
- **Anyone ticked while the list is still in the air is kept.** The arriving
  list is merged with those ticks, never written over the top of them.
- **Save is only held for a hand-picked segment.** A segment being turned into a
  rules one can still be saved while its old people are in the air, because
  saving it drops them on purpose.

Renaming a segment whose people have loaded changes nothing about who is in it.
