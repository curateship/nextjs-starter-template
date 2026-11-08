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

The role filter, the Role column and both role pickers list every role the app
has: Admin, Member, and the app's own roles. Moving an account onto an app role
here is allowed; Tyler said yes on 16 Oct 2026. See
[App roles](../accounts/app-roles.md).

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

## People: contacts, leads and segments in the CRM

Contacts and segments are the People tab of the CRM (`/admin/crm?tab=people`)
since 7 Nov 2026 (Tyler: "I want to consolidate them all into one CRM
dashboard"). They were their own dashboard at `/admin/contacts` from
19 Oct 2026; that address and `/admin/segments` forward to the People tab,
keeping a link's segment, filter and open person.

### Two kinds of person

Tyler, 7 Nov 2026: "People: one tab ... holding two kinds ... each row says
which kind it is."

- **A contact** is somebody on the mailing list (`contacts`).
- **A lead** is an address that wrote in to the CRM, or was added there by
  hand (`crm_leads`).
- The two stay two tables. A lead never gets a newsletter until somebody
  presses Add to contacts, and mail arriving never writes a contact.
- Somebody who is both, matched by address whatever the capitals, shows once,
  as the contact, marked "Lead + Subscriber". The reads are in
  `src/server/crm/people.ts`.

### The list

- **Header:** the CRM's one header: "N selected" while contacts are ticked
  (Add to segment, Remove from segment, Status, Delete), Filter (the segment
  rule builder, with Save as segment and Update), New contact, and the ⋮ with
  Search, Mass select, Upload a CSV file and Download a sample file.
- **The view dropdown:** All (every contact, then every lead who is not one, in one
  order, paged together), Leads, Subscribers, Opted out, then each saved
  segment. Subscribers and Opted out are the rules Filter writes, so it shows
  as picked when Filter matches it. A segment or any Filter rule reads contacts
  only, so with one on the list holds no leads.
- **The table** is laid out as Project's: Person (a status dot; a lead's is its
  stage colour), Email, Kind (Subscriber, Lead, or Lead + Subscriber), Status (a
  contact's list status, a lead's stage), Tags, Opened, Added. Person, Email,
  Status and Added sort.
- **Right-click:** Mass select, then Take off or Put back on the list and
  Delete for a contact; Open the conversation and Add to contacts for a lead.
  Only contacts are ticked, because every bulk change is to the mailing list.
- The other groups the old left panel counted (bouncing, gone quiet, new this
  month, never emailed) are one Filter rule away. Its "Last 30 days" counts
  are gone.

### The right panel

- **A contact** (`ContactPanel`): their initials, name and address; the ⋮
  holds Person (address, where they came from, joined, account or not) and
  List (status, tags, segments), then Delete; the body is Notes (saved as
  typed) and Activity; the footer is their status and Take off or Put back.
- **A lead** (`LeadRecord`): the ⋮ holds the same Person, Deal and Follow up
  rows the conversation's ⋮ has; the body is their conversation, which opens
  in Inbox; the footer is the stage and Add to contacts, or Open their
  contact.
- **Segments** are also a block on the CRM's left page. On the People tab a
  segment row's ⋯ has Edit (the segment window) and Delete.

### The address

`?tab=people` says the People tab is showing, and `?view=leads` the Leads
pill. The search, the rules (`filter`), the open segment (`segment`), the sort, the
page, the page size and the open person (`open`) are all in the address. A
pasted link opens the same view. Pressing a segment puts only
`?segment=<id>` there, which shows the segment's rules as saved; the rules
join it as `filter` once one is changed, which is what makes Filter offer
"Update". Saving a segment, or editing the open one from its cog, goes back to
`?segment=<id>` alone, so an older copy of its rules never stays behind. The
old Segments address arrives the same way. A link to a segment that has since
been deleted shows everybody and says so.

Pressing a People row or a segment also empties the search box, so the list
holds the number the row showed; the counts on the left never count a search.

Opening the list brings it up to date with who has signed up, before the list,
the People counts and the segment counts are read.

### Importing a CSV file

Import > Upload a CSV file opens a window. Tyler asked for it on 20 Oct 2026
("Build CSV import now").

- **The file** is read in the browser. Drop it on the box or choose it. A
  comma, semicolon or tab file works, quoted cells may hold commas and line
  breaks, and up to 50,000 rows are allowed.
- **Each column** gets a field: Email, First name, Last name, Full name,
  Tags or Leave out. Each is guessed from its heading, with the first row's
  value shown under it. Only one column can be Email.
- **Tag everybody in this file with** adds tags to every row.
- **Rows without a real address** are counted and left out. The window says
  how many before anything is sent.
- **New addresses** join the list as on the list, with CSV import as their
  source.
- **People already on the list** keep their status, so nobody who opted out
  is put back. They gain the file's tags, and a name in the file replaces
  theirs, except for somebody with an account, whose name the account owns.
- **The rows go 500 at a time.** A batch that fails stops the import and says
  how many went in; those people stay. The toast at the end says how many
  were added, updated, already up to date and left out.

Download a sample file saves `contacts-sample.csv` with the headings the
window knows. The reading is `src/lib/contacts/contact-csv.ts` and the saving
is `importWorkspaceContacts` in `src/server/people/contacts.ts`.

## Segments

Segments have two membership models:

- A hand-picked segment contains chosen contacts, added and removed through
  mass select.
- A rules segment contains rules and calculates membership from current
  contact data.

Newsletters and automations may depend on a segment. The server refuses to
delete a segment while another saved record still refers to it. Removing the
reference first makes the effect explicit.

### A tag rule is picked from a list, not typed

The Tag rule's second field is a combobox: it lists every tag contacts actually
carry, filters as you type, and ticks the ones the rule matches. The same rule
builder draws the contacts filter and the segment window, so both got it.

It was a text field you typed comma-separated names into until 5 October 2026.
Tyler asked for the combobox, and the field had earned it. A name had to be
spelled exactly, nothing on screen said which tags existed, and a typo looked
identical to a tag nobody carries, so the rule quietly matched nobody and the
screen gave no hint why.

**A tag the rule already names is kept even when no contact carries it any
more.** Those sit at the top of the list, ticked, so opening an old rule and
pressing Save cannot silently narrow what it matches. Untick one and it goes;
nothing else removes it.

**There is no way to invent a tag here**, which is the point of the change. A
rule can only name a tag that exists, because a rule naming one that does not is
a rule that matches nobody.

`src/components/ui/multi-combobox.tsx` is the control, built from the Popover,
ScrollArea and Badge already in the app rather than from a new dependency.

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
