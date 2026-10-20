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

## Contacts and segments: one dashboard

Contacts and segments are one three-column dashboard at `/admin/contacts`
(Tyler, 19 Oct 2026: "We have to combine both the contacts and segment into one
3 col dashboard"). `/admin/segments` forwards there, and the left menu has no
Segments link. The screen is drawn after a mock Tyler sent on 20 Oct 2026
(`workspace/docs/assets/pasted-image-1792502790922258000.png`). His picks that
day: CSV import is built, Notes are built and save as you type, "Send email"
is left out, and the tick boxes stay behind Mass select like every other
three-column dashboard.

### Left panel

The header's cog opens Settings > Email, where sending and "gone quiet" are
set.

- **People** counts everybody, then the contacts on the list, opted out,
  bouncing, gone quiet, new this month (anyone who joined in the last 30
  days) and never emailed. The rows use the list's own status words (Tyler's
  pick, 19 Oct 2026). All people is on whenever the list is unfiltered.
  Pressing a row shows those people in the middle; pressing it again shows
  everybody. Each row is a set of segment rules
  (`src/lib/contacts/contact-shortcuts.ts`), so "Save to segment" saves it as
  it is.
- **Segments** lists every segment with how many people are in it now. A
  rules segment's dot is solid and a hand-picked one's is grey. Pressing one
  applies it to the list. Its cog opens the segment window (name,
  description, rules or people) and its bin deletes it. The + makes a new one.
- **Last 30 days** counts the people who joined, opted out and bounced in
  that time. Opted out reads the date of the opt-out, so somebody put back
  since is not counted. Bounced counts people, from newsletter sends; an
  automation email records no bounce date.

### Middle panel

The header names what the list shows (All people, a People row, a segment, or
Filtered contacts) and how many. Its buttons, left to right:

- **"N selected"**, while ticked rows exist. Its menu holds Add to segment,
  Remove from segment and Status, each stepping into its own list, then Delete,
  then Clear selection. Add and Remove list the hand-picked segments only,
  because a rules segment works out its own people. Once a whole page is
  ticked it offers everybody who matches; every change is then sent as the
  filters, not as ids.
- **Search**, a magnifying glass that opens into the box.
- **Filter**, holding the same rule builder a segment is written in. A change
  applies a moment after it is made, and a rule still being filled in waits.
  Beside Clear is the save: "Save to segment" with nothing open. With a rules
  segment open it is a Save menu of "Update <segment>", once the rules differ
  from the segment's, and "Save as new segment". Update asks first, because
  every newsletter and automation sent to that segment from then on reaches
  different people. With a hand-picked segment open it is "Save as new segment"
  alone. Search words are never saved, only the rules.
- **Import**, a borderless button like Filter, with a menu of "Upload a CSV
  file" and "Download a sample file". See
  Importing a CSV file below.
- **New contact**, a dropdown: email, first and last name, status and tags.
  An address already on the list is updated rather than added twice.

Each row shows:

- **Person:** the initials in a circle, the name, an Account badge for
  somebody who can sign in, and their status as a coloured dot and its words.
  Green is on the list, grey opted out, red bouncing or marked it spam, amber
  gone quiet. Someone with no name shows the address instead.
- **Email** and **Tags**, each in its own column (Tyler, 20 Oct 2026). Up to
  three tags show, on one line. Once the Email column has gone in a narrow
  panel, the address shows under the name.
- **Engagement:** "Opened 2 of 3" over a bar. It counts newsletter sends that
  went out, not the ones that failed before leaving, and a click counts as an
  open, because a mail client that blocks pictures never reports the open.
  "No emails yet" for somebody never sent anything.
- **Source**, **Last emailed** and **Added**, then a "…" menu holding Take off
  the list (or Put back on the list) and Delete contact.

The open person's row is shaded with a dark bar down its left edge. Columns
drop out as the panel narrows: Last emailed first, then Source, Added, Tags,
Engagement and Email. The header has no loading circle beside the count. The page footer shows only when there is more than one page.

Tags work the way Project's task tags do (Tyler, 19 Oct 2026: "fix how tag
flow. Look at how project does it"): each tag is a pill with an ×, typing a
name and pressing Enter places it, Backspace in the empty box takes the last
one off, and tags other contacts already carry show under the box to click as
you type. On the open contact each change saves at once, by the contact's id,
and goes back if the save is refused, so a contact deleted in another tab is
refused rather than added again; in New contact they wait for Create contact. The side cards'
arrows and buttons show only while a card is pointed at, as on Project's
panels.

The tick boxes stay hidden until Mass select, beside the Person heading, is
pressed. Clicking a tag on a row adds it to the "tagged any of" rule, or takes
it off.

A new segment saved from the list opens straight away in the left panel.
Changing the rules of an open segment keeps it open, so it can be updated;
emptying the rules closes it.

### Right panel

The open contact. The header holds only their status and its dot, saved the
moment it is picked, drawn with no outline and no "Status:" label. Tyler took the up
and down arrows and the × off on 20 Oct 2026, so another row opens somebody
else and nothing closes the panel. Deleting somebody is in their row's "…"
menu. Below:

- **Their card:** name, address and what their status means, over Source,
  Joined, Last emailed and Type. Type is Account for somebody who can sign in,
  which opens their account, and Subscriber for an address alone.
- **Tags**, as described above.
- **Segments:** the ones they are in now, as pills. Pressing one shows it in
  the list. A hand-picked one has an × that takes them out, and the card's +
  puts them in another hand-picked one. A rules segment has no ×, because its
  rules decide.
- **Notes:** a box that saves 700ms after the last key, when it is left, and
  before the panel moves to somebody else. The heading says Saving…, Saved or
  Not saved. A refused save keeps what was typed. Up to 10,000 characters,
  kept in `contacts.notes` (migration 0096).
- **Activity:** one line per email at the furthest it got (bounced, clicked a
  link in, opened, sent, or could not send), newest first, ten at a time,
  then the day they joined at the end.

With nobody open the panel says to click a contact.

The page never arrives with nobody open. Opened from the left menu or a
bookmark, it first goes back to the address it had last time in this browser,
for this person and this site, and then opens the list's first contact if
nobody is open. A remembered contact who has since been deleted gives way to
the first one. A pasted link keeps its own view. Deleting the open contact
leaves the panel empty until the next visit. Tyler asked for this on
19 Oct 2026, for every three-column dashboard (UI standard, "Three-column
dashboards").

### The address

The search, the rules (`filter`), the open segment (`segment`), the sort, the
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
