# Users, contacts, and segments

Users are people who can sign in. Contacts are email recipients inside a
workspace. One person may be both, but the records have different jobs. Turning
a contact into a user or suspending a user must not silently rewrite newsletter
history.

## Users

The Users dashboard lets an admin:

- Search, filter, sort, and page through accounts.
- Create an account.
- Change a role, plan, profile, or status.
- End sessions and inspect security details.
- Temporarily view the product as that person.

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
