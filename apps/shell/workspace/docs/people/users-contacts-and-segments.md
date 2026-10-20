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
Segments link.

### Left panel

- **People** counts the contacts on the list, opted out, bouncing, gone quiet,
  and new this month, which is anyone who joined in the last 30 days. The rows
  use the list's own badge words (Tyler's pick, 19 Oct 2026). Pressing a row
  shows those people in the middle; pressing it again shows everybody. Each row
  is a set of segment rules (`src/lib/contacts/contact-shortcuts.ts`), so
  "Save to segment" saves it as it is.
- **Segments** lists every segment with how many people are in it now, and
  "Hand-picked" after the ones chosen by hand. Pressing one applies it to the
  list. Its cog opens the segment window (name, description, rules or people)
  and its bin deletes it. The + makes a new one.

### Middle panel

The header names what the list shows (All contacts, a People row, a segment, or
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
- **New contact**, a dropdown: email, first and last name, status and tags.
  An address already on the list is updated rather than added twice.

Tags work the way Project's task tags do (Tyler, 19 Oct 2026: "fix how tag
flow. Look at how project does it"): each tag is a pill with an ×, typing a
name and pressing Enter places it, Backspace in the empty box takes the last
one off, and tags other contacts already carry show under the box to click as
you type. On the open contact each change saves at once, by the contact's id,
and goes back if the save is refused, so a contact deleted in another tab is
refused rather than added again; in New contact they wait for Create contact. The side cards'
arrows and buttons show only while a card is pointed at, as on Project's
panels.

The tick boxes stay hidden until Mass select, beside the Email heading, is
pressed. Clicking a tag on a row adds it to the "tagged any of" rule, or takes
it off. Each row keeps Take off or Put back and a bin.

A new segment saved from the list opens straight away in the left panel.
Changing the rules of an open segment keeps it open, so it can be updated;
emptying the rules closes it.

### Right panel

The open contact: their status in the header (saved the moment it is picked), a
cog whose menu deletes them, and an × that closes the panel. Below, folding
cards for who they are, their tags, the segments they are in right now, and
every email sent to them, ten at a time. Pressing one of their segments shows it in the list. With
nobody open the panel says to click a contact.

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
