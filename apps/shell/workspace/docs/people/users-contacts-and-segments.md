# Users, subscribers, leads and segments

Three separate lists, which never copy into each other (Tyler, 9 Nov 2026):

> "We need to plan this out better because right now is super confusing with
> the overlapping of users, contact and leads. I think its better that leads
> are completely seperate from people ... people should be renamed to
> subscribers ... users and subscribers are also seperate. Meaning that a
> user signs up for an account to the app does not gets added to the
> subscribers list. Subscribber lists are exclusive to impport, manual add or
> through an email form"

- **Users** (Admin → Users, `users`): everybody with an account.
- **Subscribers** (the CRM's Subscribers section, `contacts`): the mailing
  list. Only a CSV import, a hand add, "Add to subscribers" on a lead, or
  (later, its own task) an email signup form puts somebody here. Signing up
  for an account never does.
- **Leads** (the CRM's Leads section, `crm_leads`): every address that
  wrote in, was written to from the CRM, or was added on Leads. **New lead**
  on the Leads header offers the same two choices as New contact (Tyler,
  9 Nov 2026: "allow me to add manual leads as well as paste a csv file too
  just like suvscribers"): **Add a lead** (address, name, company, phone,
  stage) and **Upload a CSV file** (columns guessed from their headings:
  email, full or first and last name, company, phone; every new lead starts
  at New). An address already a lead, whatever its capitals, is updated
  rather than added twice: the file's name, company and phone fill in, and
  the stage, deal and conversations stay. Adding a lead never puts them on
  the subscriber list. `addWorkspaceLeads` in `src/server/crm/leads.ts`,
  `src/components/crm/new-lead-dropdown.tsx` and `lead-import.tsx`.
  Every Leads column sorts (Tyler, 9 Nov 2026: "missing sorting"): Stage in
  the pipeline's order (New, Contacted, Quoted, Won, Lost), Value biggest
  first on the first press, Added newest first, words A to Z, and a blank
  name or company always last (`CRM_LEAD_SORTS`).
  A subscriber's right-click has **Add to leads** (Tyler, 9 Nov 2026: "in
  subscribers, I should be able to right click and add subscriber to lead as
  well"): they become a lead at New, source "Subscribers", and stay a
  subscriber. An address already a lead is left as it is
  (`addContactToLeads`). The new lead shows in the Leads list.
  The Leads list has the Subscribers list's right-click and mass select
  (Tyler, 9 Nov 2026: "leads table is missing right click function", "Its
  also missing mass select"). Right-click: Mass select, Add to subscribers
  (or Open in Subscribers when that address already is one), Delete lead.
  Ticked leads: Stage (all to one stage) and Delete. **Deleting a lead
  deletes their conversations and messages too**, and the files those
  messages kept in storage; the confirm says so. A subscriber on the same
  address stays. `setLeadsStage` and `deleteLeads` in
  `src/server/crm/leads.ts`, `src/components/crm/lead-bulk-menu.tsx`.
- **One address may be on more than one list** (Tyler picked this the same
  day): a customer who writes in can still get the newsletter. Each list
  shows only its own kind; nothing marks a row as "also" anything.

Until 9 Nov 2026 every account was copied onto the mailing list as a contact
marked "Account" (`syncContactsFromUsers`). Migration 0111 removed those
copies, the `contacts.user_id` link and `crm_leads.contact_id`, and the
"Has an account" and "Plan" segment rules. A subscriber who was added by
hand or imported and also has an account stayed, as an ordinary subscriber.

**Emails to accounts** (welcome, payment failed, trial ending, the member
events) go straight to the account's own address, read from `users`, not
through a subscriber row: see `workspace/docs/automations/` and
`src/server/automations/audience.ts`. Their unsubscribe link turns the
account's automated mail off (`users.automated_mail_off_at`); emails about
the account itself (verify, password reset) still go.

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

## Subscribers and segments in the CRM

Subscribers and segments are the CRM's **Subscribers** section
(`/admin/crm?tab=subscribers`), named People until 9 Nov 2026, when its
leads moved to a Leads section of their own. They were their own dashboard
at `/admin/contacts` from 19 Oct 2026; that address and `/admin/segments`
forward to Subscribers, keeping a link's segment, filter and open
subscriber. An old `?tab=people` link is not read: it opens the CRM's first
section, as any unknown section does.

### The list

- **Header:** the CRM's one header: "N selected" while subscribers are
  ticked (Add to segment, Remove from segment, Status, Delete), the search
  box, Select (Mass select), Filter (the segment rule builder, with Save as
  segment and Update), the view dropdown, and New contact. New contact opens
  two choices first (Tyler, 9 Nov 2026: "clicking on add new contact should
  open a dropdown to give me 2 options to add new contact"): Add a contact
  turns the dropdown into the form, and Upload a CSV file opens the import
  window. There is no ⋮.
- **Adding everybody who matches asks first.** After "Pick all N who match",
  Add to segment opens a confirm naming the count and the segment ("Add 12,400
  people to Newsletter readers?"), because one click there can add thousands.
  Ticked rows on the page still join with one click. Either way the list
  redraws afterwards, so a list filtered by that segment shows the change.
- **The view dropdown:** All, On the list, Opted out, then each saved
  segment. On the list and Opted out are the rules Filter writes, so one
  shows as picked when Filter matches it.
- **The table:** Person (a status dot), Email, Status, Tags, Opened, Added.
  Person, Email, Status and Added sort.
- **Right-click:** Mass select, Take off or Put back on the list, and Delete.
- The other groups the old left panel counted (bouncing, gone quiet, new this
  month, never emailed) are one Filter rule away.

### The right panel

A subscriber (`ContactPanel`): their initials, name and address; the ⋮
holds Person (address, where they came from, joined) and List (status, tags,
segments), then Delete; the body is two grey cards, the ones Settings →
Styling → Panel cards colours (Tyler, 9 Nov 2026: "remove the note feature
for subscribers. Add a card there ... that show subscriber basic
informations like: Date added, status, tags, segments and came from. The
activity should also be in a card"): **Details** reads back Added, Status,
Tags, Segments and Came from (changed from the ⋮), and **Activity** lists
what happened to each email they were sent. The footer is their status and
Take off or Put back. Notes are gone from the panel and the API; the
`contacts.notes` column stays in the database, unread, holding whatever was
written before. Segments are also a block on
the CRM's left page; on Subscribers a segment row's ⋯ has Edit and Delete.

### Leads

The CRM's **Leads** section (`?tab=leads`, `src/components/crm/crm-leads-tab.tsx`)
lists every lead: stage dot and name, address, company, stage, deal value,
added. Search looks through name, address and company; Filter's Stage, or a
stage pressed on the left page's Leads card, narrows it to one stage. The
Leads card's first row opens the section, and it is not in the Dashboards
block. On the right, a lead
somebody has written to opens on their newest conversation, read and
answered in place as in Inbox (`ConversationRecord`, the Inbox's own panel;
Tyler, 9 Nov 2026: "If there's a conversation, why not just put the
conversation there instead of a button?"). A lead nobody has written to opens
the lead panel (`LeadRecord`). Either ⋮ has Add to subscribers, or Open in
Subscribers when a subscriber already has that address; adding them leaves
them a lead too.

### The address

`?tab=subscribers` shows the list. The search, the rules (`filter`), the open
segment (`segment`), the sort, the page, the page size and the open
subscriber (`open`) are all in the address. Pressing a segment puts only
`?segment=<id>` there, which shows the segment's rules as saved; the rules
join it as `filter` once one is changed, which is what makes Filter offer
"Update". Saving a segment goes back to `?segment=<id>` alone. A link to a
segment that has since been deleted shows everybody and says so. Pressing a
segment also empties the search box, so the list holds the number the row
showed.

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
  theirs.
- **The rows go 500 at a time.** A batch that fails stops the import and says
  how many went in; those people stay. Rows with no real email address are
  counted in the dialog before Import is pressed. A finished import shows no
  toast: the people appear in the list.

There is no sample file to download any more (Tyler, 9 Nov 2026: "Remove the
download sample file feature"). The reading is
`src/lib/contacts/contact-csv.ts` and the saving is `importWorkspaceContacts`
in `src/server/people/contacts.ts`.

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
Saving a segment that already exists sends only who joined and who left since
the window opened (`addIds` and `removeIds`, up to 1,000 each). The server
applies both, with the new name, in one transaction
(`updateWorkspaceSegment` in `src/server/people/contact-segments.ts`). A new
segment still sends everybody picked. Until 13 Nov 2026 every save sent the
whole list, and the server refuses a list over 1,000, so a segment that "Add to
segment" had grown past 1,000 could not even be renamed. Joiners and leavers
are worked out against the people loaded, so Save still waits for them:

- **While they are loading**, the people card shows a loading line where the
  already-chosen people will appear, the live count says it is counting, and
  Save is switched off with the reason in a tooltip.
- **If the load fails**, the card shows the failure in place with a Try again
  button, and Save stays off until they load, so nobody saves a segment
  without seeing who is in it.
- **Anyone ticked while the list is still in the air is kept.** The arriving
  list is merged with those ticks, never written over the top of them.
- **Save is only held for a hand-picked segment.** A segment being turned into a
  rules one can still be saved while its old people are in the air, because
  saving it drops them on purpose.

Renaming a segment whose people have loaded changes nothing about who is in it.
