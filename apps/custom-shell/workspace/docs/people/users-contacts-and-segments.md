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
