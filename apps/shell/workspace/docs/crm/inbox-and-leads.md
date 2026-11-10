# The CRM: the inbox, and the leads it makes

The CRM is one screen at `/admin/crm` for all the app's email. Its Inbox
reads mail that comes in, answers it, and keeps a record of who it was with so
they can be chased later. Its Leads section lists everyone who wrote in or
was written to, its Subscribers section the mailing list (People until
9 Nov 2026, when the two were separated; accounts are on neither:
`workspace/docs/people/users-contacts-and-segments.md`), and Broadcasts and
System emails the newsletters and the app's own emails. Its Overview is a
page of widgets, empty until there are CRM widgets.

## One screen for all the app's email

Tyler, 7 Nov 2026: "The broadcast, contacts, outbox and systems email. They
all are related but yet they're currantly in separate dashboard ... I want to
consolidate them all into one CRM dashboard". Then, of the first try: "We
need to consolidate this [the newsletter editor] into the CRM dashboard too
and not linked it outside. The Ui is all over the place as well."

- **Sections, picked on the left, laid out as the Admin dashboard** (Tyler,
  8 Nov 2026: "We need to get the CRM dashboard up to date with the new admin
  dashboard. We dont have any CRM widgets so lets leave it empty for now").
  The middle header's tabs became the left page's fixed **Dashboards** block:
  Overview, Inbox, Subscribers, Broadcasts and System emails (Leads left it on
  9 Nov 2026 for a card of its own, the Leads block below), in that
  order, each with a count (Overview its widgets, Inbox its open
  conversations, Subscribers every subscriber, Broadcasts
  every newsletter, System emails the
  app's 15; `workspace/docs/email/system-emails.md`). It is the Admin page's block, the same
  rows and the same sliding bar (`DashboardsRows` in
  `src/components/shared/notes/dashboards-rows.tsx`).
- **One frame for every section** (`src/components/crm/crm-frame.tsx`): the
  left page, its ⋮ and anything typed there stay put while the section
  changes; only the middle and the record on the right are the section's,
  as on the Admin dashboard.
- **Overview** is the Admin dashboard's widget grid with no middle panel,
  two panels with a layout of their own, its rows and spots set in the CRM
  ⋮'s **Widgets** tab and saved for the site (`admin_widget_layouts`, board
  `crm`). The CRM has no widgets of its own, so a new site starts with one
  row of two spots, each saying "No CRM widgets yet.", and the Widgets tab
  shows only the rows. An app adds CRM widgets through `crm.widgets` in its
  `src/app/options.ts` (`docs/shell/admin-blocks-and-widgets.md`). A bare
  `/admin/crm` on a browser that never opened the CRM lands on Inbox, not on
  an empty Overview.
- **One middle header on every section** (`CrmListHeader` in
  `src/components/crm/crm-row.tsx`): the section's icon and name, "N
  selected" while rows are ticked, the search box (always there), Select
  (Mass select) right after it, Filter, the view dropdown, the one New …
  button, a ⋮ only where a section has rows of
  its own for it (none does since Subscribers' Upload a CSV file moved into New
  contact on 9 Nov 2026), and last the button that reopens a shut
  right panel. Every button but New, and the search box, has a white fill
  and a light grey line of its own (`zinc-200` at 60%), not the Divider
  lines colour (Tyler, 9 Nov 2026: "Lets take
  the search and mass selet out of the dropdown and have all the buttons use
  a more visible button", then "dont wire the border to the settings"). A shut left panel comes back
  from a button before the icon. The edge knobs are gone except on Overview,
  which has no header. The header and the tables sit 24px in from the
  middle's edges. Inbox's Filter opens 240px wide, as the Admin lists' do;
  Subscribers' is the segment rule builder, three boxes to a rule, and stays
  480px.
- **The view dropdown** (`ViewMenu` in `src/components/shared/view-menu.tsx`)
  picks which part of the tab's list shows, with a count on each. It sat as a
  row of pills under the header until Tyler, 7 Nov 2026: "We dont need a
  second subnav. Just put it as a dropdown filter here". Its choices:
  - **Broadcasts:** Drafts, Scheduled, Sent, Templates.
  - **Inbox:** All, Unread, Saved, Waiting, and Outbox on a laptop.
  - **Subscribers:** All, On the list, Opted out, then each saved segment.
- **One table on every tab, laid out as Project's middle panel is** (Tyler,
  7 Nov 2026: "look at the design patter of project middle panel especially
  how the table are laid out"; `CrmTable` in `src/components/crm/crm-table.tsx`,
  after `apps/project/src/components/project/task-list.tsx`):
  - Column headings straight under the header, the first column 16px in and
    the last 12px in, lined up with the header.
  - Group headings across the table with a muted count and Project's fold
    button, folding the rows under them. The Inbox groups by Today, Yesterday, This week and Earlier.
  - A group's first row has 8px above it and its last row 12px below it,
    before the next heading or the end of the table. Rows in the middle keep
    4px (Tyler, 9 Nov 2026: "Add some spacing for the top item and add a bit
    bigger spacing for bottom item"; `GROUP_EDGES` in `crm-table.tsx`). A
    folded group and a table with no groups change nothing.
  - One line per row, no line between rows, and no shade on the open one,
    exactly as Project draws them (Tyler: "THe one you made is inconsistence
    and a bit off"). Each row starts with Project's 10px dot, in one palette
    (`DOT` in `crm-table.tsx`): blue unread or scheduled, grey read or
    nothing to do, a lead's stage colour, a newsletter's state colour. Then
    the name with its small badges, each fact as a chip in its own column,
    and the open button (a cog). A table whose rows only open can leave the
    cog's column out (`actions={false}` on `CrmTable`), as System emails
    does (Tyler, 9 Nov 2026: "remove the action col"). Such a row keeps the
    36px a cog gives the others ("the items sit too close together"). Columns drop out as the panel narrows, each only
    once there is room for every column before it too, so a table never runs
    past the panel (checked from 1280 to 2240px wide). A preview column's
    rule is `hidden md:hidden @4xl:table-cell`, as on the Admin lists:
    without `md:hidden` the table's own `md:table-cell` showed it on any
    laptop however narrow the middle was, which cut off the Actions column
    at 1440px until 8 Nov 2026.
  - **The open row** (Tyler, 8 Nov 2026: "I want to add the pill sliding in
    ui to the table items"): a small dark bar grows in before its dot, its
    width and margin over 220ms on cubic-bezier(0.2, 0.8, 0.2, 1), while the
    last open row's shrinks away (`OpenBar` in `crm-table.tsx`). A pressed
    row shows open at once and the record opens after the bar, because
    drawing the record froze a bar growing at the same time; with less motion
    asked for it opens at once. Only a bar already on screen when a person
    presses slides. A bar drawn after that, by a refresh, a new dashboard or
    the row the page opens by itself on arrival, snaps into place (Tyler,
    9 Nov 2026: "whenever i load a page, the black pill animation pushes in
    every time. We have to disable that", then "if it has to refresh then
    dont add animation"; `src/lib/layout/press-motion.ts`). Names are grey, black while pointed at and
    while open ("change the items to gray and if hover over it turns black
    and when selected it stays black"). The same rows draw the Admin
    dashboard's Users, Feedback and Media library lists.
  - Inbox: From, Email, Stage (from a 896px middle), Tags (from 1024px),
    When. From is only as wide as the names and Email takes the rest, so the
    words sit next to who sent them. Leads: Lead, Email, Company, Stage,
    Value, Added (Lead, Email and Added sort). Subscribers: Person, Email,
    Status (from 896px), Tags (from 1024px), Opened (from 1152px), Added
    (Person, Email, Status and Added sort).
    Broadcasts: Newsletter, Subject, Status, Sent (from 896px), Changed. Templates and the
    Outbox have the same shape.
  - Every row right-clicks: Mass select first, the row's own actions, the
    destructive one under a line. Mass select adds a tick column only as
    wide as the box.
- **One right-panel shape** (`RecordFrame` in `record-frame.tsx`): the
  record's avatar, name and muted line, its ⋮ (grouped rows that save
  themselves), the collapse button; the body; a footer with its state and its
  main button. A conversation, a contact, a lead, a newsletter, a template, a
  system email and an outbox email all use it.
- **The left page is the same on every section.** A block pressed on the
  wrong section goes to the right one: an address or a stage opens Inbox, a
  segment opens Subscribers. On Inbox an address or a stage narrows the list
  in place, keeping its other filters; on Subscribers a segment shows in
  place, the open subscriber staying open. A segment row's ⋯ (Edit, Delete)
  shows only on Subscribers, whose windows they open. The CRM settings ⋮ opens to the right,
  over the list. It has an **Emails** tab, the addresses mail arrives at
  (pressing one narrows the inbox; they were a block on the page until
  Tyler, 7 Nov 2026: "move the email block to the settings"), and the
  **Widgets** tab. Each address has a pencil and a bin, in place of the
  Rename and Remove words, with no open count on the row and no line of
  help under the list (Tyler, 9 Nov 2026). The pencil opens a small box by
  it, not a window ("the rename shouldnt open a modal, make it a popover
  instead"): the name, Cancel and Save, Enter saving, the ⋮ staying open
  behind it. Its System emails tab became a section on
  9 Nov 2026.
- **Nothing leads outside.** A newsletter, a template and a system email are
  written on the right panel (`workspace/docs/email/newsletters-and-broadcasts.md`).
  A lead's conversation is answered on the Leads section's right panel too,
  the same panel as Inbox's (`ConversationRecord`), not behind an "Open their
  conversation" button (9 Nov 2026). Its ⋮ has Add to subscribers, or Open
  in Subscribers when a subscriber already has that address.
  `/admin/newsletter`, `/admin/newsletter/<id>`, `/admin/contacts`,
  `/admin/segments`, `/admin/system-emails`, `/admin/system-emails/<kind>` and
  `/admin/dev-outbox` all forward into the CRM, and navigation version 22
  takes their links out of the left menu (`removeEmailScreenLinks`).
- **Each section reads only its own address keys**
  (`src/lib/crm/crm-search.ts`); Overview owns none. Inbox, Leads and
  Subscribers all use `open`, `q` and `sort`, and a subscriber's id is not a
  conversation's, so
  picking a section starts the address again with `?tab=<name>` alone. A
  bare `/admin/crm` goes back to the section and row it last had.

It is drawn in the Admin 3 panel design
(`.agents/skills/Design/admin-3-panel-design/SKILL.md`) since 7 Nov 2026.
Tyler: "Left panel list blocks like emails, I want to add new emails to the
CRM so we'd need to add a + in the top header. Middle panel shows the inbox,
second tab unread, 3rd tab saved. Right panel shows the full conversation and
information about that contact." Every card is Trade's block card ("we need
to use trade's card design though").

Three panels, and each has one job:

- **Left, the page.** One page per site, written on like any page in the
  design, holding "/" blocks. The header's **+** opens a menu of four
  (Tyler, 9 Nov 2026: "The left header dropdown should now chnage to: Add a
  subscriber, add a lead, add a segment and add a broadcast", then "remove
  the \"a\" so its just Add subscriber"). Picking one turns the dropdown
  into its form, and making it keeps the admin where they are: nothing moves
  to another section or opens a window (Tyler, 9 Nov 2026: "in crm. Fix all
  of these ... they either forward somewhere else or open a modal").
  - **Add subscriber** and **Add lead:** the same forms as Subscribers' New
    contact and Leads' New lead (`useSubscriberForm`, `useLeadForm`).
  - **Add segment:** a name, an optional description, the same rules and
    live count as the segment window, in a 30rem box. A hand-picked segment
    is made on Subscribers, by ticking people.
  - **Add broadcast:** a name; the newsletter is made as a draft and written
    in Broadcasts.
  - The forms are `crm-add-forms.tsx` and the two dropdowns' own files;
    `AddMenuButton` in `src/components/crm/crm-page-panel.tsx`. Making
    anything reads the page's blocks and the list again.
- **Middle, the inbox.** One row per conversation, under the All, Unread,
  Saved and Waiting views. Each row is the read dot, the person's initials
  in a small round avatar, then their name (Tyler, 9 Nov 2026: "Users,
  inbox, subscribers and leads should have its avatar beside it"); the
  Leads, Subscribers and Admin Users lists draw it the same way
  (`MainCell`'s `avatar` in `src/components/crm/crm-table.tsx`). Nobody has
  a stored picture, so it is always initials. A conversation shows the same
  avatar beside every bubble ("the conversation should show avatar too"):
  theirs on the left is the person the conversation is with, whichever of
  their addresses a message came from; ours on the right is the sender's
  name, or the name replies go out under ("Tyler" gives TY). The Filter window's Clear and
  save buttons take the header buttons' light grey line.
- **Right, the conversation.** The back-and-forth oldest first, and the box
  to answer it at the foot. The ⋮ holds who they are and where they are up
  to.

There is no bottom panel. The automation editor uses one to show a list of
things that happened to the thing above it, and a conversation already is
that list.

## The left page

The page is the shell's page with "/" blocks (`docs/shell/page-blocks.md`),
kept in `crm_pages`, one row per site. A site that has not written on it yet
sees the Dashboards block, then Follow up today.

**Dashboards** is fixed, as the Admin page's is: it is never in the "/"
list, the editor refuses any change that would take it off (Backspace, cut,
select all and delete), the server puts it back at the top of a page saved
without it and drops a second one (`withFixedBlock` in
`src/lib/notes/fixed-block.ts`), and its ⋮ holds only Move up and Move down.
While the page is read, or when it could not be, the block is drawn on its
own above the "Reading the page…" line or the error, because it is the only
way between the sections. An Emails block saved before 7 Nov 2026 is
left out when the page is read; the addresses are in the CRM settings ⋮. The CRM adds three blocks of its
own to the "/" list, in `src/components/crm/crm-blocks.tsx`. Every one draws
its rows as the Dashboards block does (Tyler, 8 Nov 2026: "segment and stages
blocks are not changed ... other blocks too. Only the dashboard ones are the
new ui"): grey names, the picked one dark with the sliding bar, no lines
between rows, and counts in the soft grey pill (`SideRows`). The Leads card
shows each stage's dot from the tables; Waiting on you shows how long in the pill; a
segment's ⋯ takes its pill's place while the row is pointed at.

- **Follow up today.** Leads whose chase date has come, soonest first, never
  one already Won or Lost. Pressing one opens their newest conversation.
- **Leads** (the Stages block until 9 Nov 2026; Tyler: "I think leads should
  be its own card. We can rename the stages block to \"Leads\" and put the
  first item as leads and the rest are filters from leads"). The first row
  is Leads with every lead's count; under it each stage with its dot and
  count, all six always shown. Pressing Leads opens the Leads section;
  pressing a stage opens it filtered to that stage (`?stage=`, the same as
  its Filter's Stage). The row showing is picked. Its ⋮ hides and shows
  stages with the eyes the Dashboards block uses (`hiddenLeadStages`, for
  the whole site). Its saved name is still `noteCrmStages`, so pages saved
  with the Stages block keep it. Stages no longer narrow the Inbox from here;
  the Inbox's own Filter still has Stage.
- **Segments.** Every saved segment of contacts with how many are in it.
  Pressing one shows its subscribers on the Subscribers section, where a
  row's ⋮ has Edit and Delete. The block's own ⋮ holds **Add a
  segment**, which opens the new segment window on Subscribers, and
  **Delete block** (Tyler, 7 Nov 2026: "replace this trashcan icon with a
  vertical 3 dot to open a dropdown that show add a segment and delete
  block").

The header holds the collapse button, "CRM" (the open conversations under
it were taken off on 9 Nov 2026, Tyler: "remove this label"), the **+**,
and the ⋮ (CRM settings: General, Emails, Widgets), 20.25rem
wide: 25rem, then 10% narrower twice (Tyler, 9 Nov 2026, "Resize the
dropdown 10% narrower" the second time). The
⋮'s General tab has the cover photo, and Lock blocks as its footer, under a
line across the menu (`docs/shell/page-blocks.md`). The Dashboards block's
⋮ shows and hides Inbox, Leads, Subscribers, Broadcasts and System emails, as the Admin one does
(`hiddenCrmSections`; `workspace/docs/ui/admin.md`, "Show and hide"). Locked, the page reads only, and
the server refuses a save.

## Several addresses

A site can have more than one address mail arrives at, such as sales@ and
support@, in one inbox (CRM task 18). They are listed, renamed and removed
in the left header ⋮'s Emails tab, and **Add address** at the bottom of that
tab adds one (it was the + menu's "Add a person" until 9 Nov 2026). The list is `crm_inbound_addresses`.
Each conversation remembers the address its mail came to, in
`crm_threads.to_address`.

- **A reply goes out from the address the mail came to**, while that address
  is still on the list. Otherwise it goes out from the first one. A customer
  who wrote to support@ never gets an answer from sales@.
  `senderFromSettings` in `src/server/crm/sender.ts` decides which, and the
  footnote under Send reads from it.
- **The first address is the Settings → Email one.** It was the only one
  before the list, and the reply sender falls back to it. Adding the first
  address writes it there too. Removing it moves the next one in, or clears
  the box when it was the last. Migration 0098 copied every saved address
  onto the list.
- **Conversations from before the list have no address recorded.** They came
  to the first address, so they count under it in the Emails block and show
  when it is picked.
- **A row names its address only when there are two or more**, as "To
  Support", because a label on every row is noise.
- **Mail to an address that is not on the list is still filed.** Its address
  is recorded, and the reply goes out from the first one.

## What it looks like, and why

Tyler set the look on 2 Oct 2026 with a picture:
[the mockup](../assets/pasted-image-1790966797817093000.png). Four things in it
are decisions, not decoration.

**The inbox has one header.** It is the CRM's one header (above). Its view
dropdown holds All, Unread, Saved and Waiting, each with its count, then
Outbox on a laptop. They were the header's tabs until 7 Nov 2026 and are
`?view=` now; an old `?unread=true` or `?saved=true` link
opens All. The
The search box is always in the header, and Select is a button right after
it. Filter holds the status, the stage, the address when there is
more than one, the order and the follow-up filter, and counts what is on. A
list narrowed or reordered yesterday cannot look like an ordinary one today.

**Saved is one mark per conversation, for the whole site**, as unread and
closed are (Tyler, 7 Nov 2026). The star in the conversation header saves it,
and so does a row's right-click. A saved row shows a small star beside its
time. `crm_threads.saved_at` holds when it was saved.

**A tab's count is a soft grey chip, never a coloured number.** `TabsCount` in
`src/components/ui/tabs.tsx` draws it, so every screen in every app gets the
same one. On the chosen tab it sits on the raised white pill and reads as a
chip; on the others it sits on the track, which is the same shade, so it
quietly disappears — which is what a count on a tab nobody is looking at should
do. A coloured number competes with the label and makes the control look like
it is warning about something. Tyler set this on 3 Oct 2026 with
[a picture](../assets/pasted-image-1790999823792568000.png). The digits are
fixed-width with a minimum width, so the pill does not jump going from 9 to 10.

**No count moves when you pick another view.** All four obey every filter
except the views' own, so a search for "kitchen" answers how many of those
there are, and how many are unread, saved and waiting. `countInboxThreads`
works all four out in one query, which is why they can never disagree. Counting the list instead
made All read 6 and then 2 the moment Unread was pressed, because the list it
was counting had become the unread one.

**A row is an avatar, a name, a time, and a line of the message.** The avatar is
the person's initials: first and last for a full name, the first two letters for
one word, and the start of the address for somebody who has never given a name.
The time is the few characters a mail client uses — `now`, `18m`, `3h`,
`Yesterday`, `Mon`, `Sep 28` — because "18 minutes ago" would take the width the
message needs.

**Unread is a dot and a heavier weight, never colour alone.** A row also says
"To follow up" when the chase date has passed, and names the status when it is
not open. Those two lines only appear when they are true, so an ordinary row
stays three lines.

**The panels start at 10%, 74% and 16%**, the widths every `ThreePanels`
dashboard opens at unless Admin → Styling → Side panels sets others
(`settings/side-panel-widths.md`), and each browser remembers where you drag
the dividers.
When those starting widths move again, the key in
`src/lib/layout/panel-layout.ts` has to move with them. A remembered layout
outranks the default, so a browser that had already drawn the old proportions
would keep them and the new ones would appear to do nothing. The key is
`crm-workspace-horizontal-4` since 7 Nov 2026.

**A conversation is drawn as a back-and-forth.** Theirs sit left in a plain
bubble, ours sit right in a bubble tinted with the brand colour, and the time
sits under each one. A day separator appears whenever the date changes, because
a bare `10:41` on mail three weeks apart says nothing. Nobody's address is
repeated on every message: it is the same two people the whole way down, so the
header says it once. A screen reader still hears "You wrote" or "They wrote" on
each one, so which way it went never rests on which side it is drawn.

**The conversation header is the person, the star and the ⋮.** The star
saves it for the Saved tab. The ⋮ (`src/components/crm/crm-record-menu.tsx`)
has two tabs:

- **General** holds grouped rows: Person (name, email, company, phone), Deal
  (status, worth) and Follow up (date, note). Under them are Mark unread, Add to contacts, and Block this
  address in red under a line.
- **Files** lists every file the conversation carried.

**A row's right-click** has Mass select, Save, Mark unread, then Block
under a line. Block asks first, as the ⋮ does.

Mark unread exists because opening a conversation marks it read. Without a way
back, one opened by accident, or meant for later, would look dealt with.

## A lead is an address, not a contact

**Somebody emailing you has not asked for a newsletter.** So inbound mail never
writes a row in `contacts`. It writes a lead, which is the CRM's own record of
one email address, and links to a contact only when one already exists on that
address.

The only way a lead joins the newsletter list is the **Add to contacts** button
on the lead tab. Getting this wrong would quietly add every stranger who wrote
in to the audience of the next newsletter.

A lead carries what a conversation cannot: their name, company and phone, what
stage they are at, what the work is worth, and the date to chase them on. The
address itself is read-only, because the address is what the lead *is* —
changing it would mean a different person, and the mail already filed under the
old one would follow them.

### The stages

`New`, `Contacted`, `Quoted`, `Won`, `Lost`, in that order. Plain words on
purpose; "Qualified" and "In pipeline" are sales jargon for things a person
would say differently.

**Replying moves a lead from New to Contacted on its own**, because that is what
contacted means. Only from New: a lead somebody has already moved to Quoted or
Won does not go backwards because another email went out.

## How mail gets in, and why it takes two requests

Mail arrives at a **Resend inbound address**, saved in Settings → Email as
"Address mail arrives at". Replies go out from that same address, so the answer
comes back into the CRM rather than to a send-only sender nobody reads.

Resend announces a new email by calling `/api/webhooks/resend` with an
`email.received` event. **That event carries metadata only**: the sender, the
subject, the Message-ID and the attachment names. The body, the headers and the
files are not in it, because an attachment-heavy email would not fit in a
webhook body on most hosts. So one piece of inbound mail is two requests:

1. The webhook writes the lead, the conversation and the message, with no body.
2. The handler then asks Resend's receiving endpoint for that email's words and
   fills them in.

The write happens first and the fetch second, so a slow or broken Resend cannot
stop the mail being recorded. A fetch that fails leaves the message with no
body, the conversation says so in place with a Try again button, and the
background pass asks again. After five attempts it stops asking.

**Which workspace the mail belongs to comes from the signature on the webhook**,
not from the address in the payload. Each workspace signs with its own secret,
which is how every other Resend event already finds its workspace. The inbound
address is what makes mail arrive at all; it is not consulted again to decide
whose mail it is.

A webhook that arrives twice writes one message. Resend retries any call it was
not answered quickly enough, so the same email arriving more than once is normal
rather than exceptional, and a unique index on Resend's own email id is what
makes the second one harmless.

### Which conversation a reply joins

Three rules, tried in this order:

1. **The `In-Reply-To` header**, when the sender's client set one. It holds the
   Message-ID of the mail being answered, so a match there is certain.
2. **The same person and the same subject within 30 days**, with every `Re:` and
   `Fwd:` stripped off before comparing. Some clients send no `In-Reply-To` at
   all, and somebody writing "Re: your quote" three weeks later means the same
   conversation.
3. **A new conversation**, when neither found anything.

Never the subject alone. Two different people both writing "Hello" is two
conversations, and merging them would show one person another person's mail.

Rule 1 needs the headers, which only arrive with the body, so the mail is first
filed by rule 2 and moved afterwards if the header disagrees. **That move only
ever happens to a message sitting alone in a conversation created a moment
earlier.** Splitting a conversation somebody has already read is worse than one
conversation appearing twice.

The subject used for matching is kept on the conversation as `subject_key`,
lowered and squeezed, because SQL cannot strip a stack of reply prefixes. The
subject shown on screen is always the one the mail actually arrived with.

## Answering

The reply box is a plain box, not the newsletter's block editor. A reply is a
person typing, so it goes out with no blocks, no branding frame and **no
unsubscribe footer**. That footer belongs on a newsletter; offering to
unsubscribe somebody from a conversation they started would be absurd.

**A reply goes out under a name, never a bare address.** The From line is a name
in front of the address mail arrives at, such as
`Tyler <leads@inbox.example.com>`. The name is one box in Settings → Email,
"Name replies come from", and it is one name for the whole workspace. Leaving it
empty sends under the app name rather than under the address alone, because mail
from a bare address reads as automated and a typed personal answer is the
opposite of that.

The address in that From line is always the address mail arrives at, so the
answer still comes back into the CRM. Only the name is anybody's to change.

`src/server/crm/sender.ts` is the single place that works the From line out, and
both the send and the footnote under the Send button read it from there. That is
why the footnote says exactly what the customer will see.

**The footnote is one line and no explanation: "Sent as Tyler
<leads@inbox.example.com>".** It used to add "so their answer comes back here",
and Tyler cut that on 3 Oct 2026: "why do we even need it? I mean where else
would their reply goes?" A reply to an email comes back to whoever sent it, so
the sentence was answering a question nobody asked. Who the mail goes out as is
the only part you cannot work out for yourself, so that is the only part the
line says. A name holding a comma
or a quote mark is stripped of those characters before it goes anywhere near the
header, by the same `composeFromAddress` the app's own email uses, because a
comma in a From line makes a mail server read it as two senders. A name that is
nothing but punctuation leaves nothing usable, so the app name steps in.

**Every reply carries the workspace's signature under a thin line.** It is one
box in Settings → Email, "Signature on CRM replies", and it holds whatever you
would type by hand: a name, a business, a phone number. A blank box adds
nothing, not an empty gap and not a stray line, so a reply sent with no
signature is the same mail the CRM sent before the setting existed.

The signature is plain typing, escaped exactly like the body. Someone who types
`<b>` gets those four characters in the mail, not bold text and not a broken
message. It is deliberately **not** the newsletter's branded frame from
`src/server/email/branding.ts`: a personal answer arriving in a marketing
wrapper is worse than one with no signature at all. There is no unsubscribe
link for the same reason as the rest of the reply.

**The mail carries a plain-text part as well as an HTML one**, and both end with
the signature. Where the HTML draws a rule, the text uses `--` on its own line,
which mail clients have read as the start of a signature since before HTML mail.
Without that second part, somebody reading in a plain-text client would see the
message stop before the phone number.

**A reply carries the message it answers underneath it**, the way every mail
client does: your words, then a line saying who wrote and when, then their
message indented behind a border. Only the newest message that came in, never
the whole thread, because the thread is already in their own mail client and
quoting all of it would grow every reply.

The order is your words, then the signature, then the quote, which is what
Gmail and Outlook both do. The signature belongs to what was just written, so
it stays with it instead of sitting below somebody else's message.

The switch is in Settings → Email, "Put their message under your reply", and it
is on unless somebody turns it off. Off sends exactly what the CRM sent before
quoting existed. It exists because somebody answering twenty short questions a
day does not want three lines of quoting under each one.

**The attribution line is written to match the fold.** `splitQuotedText` in
`src/lib/crm/message-text.ts` looks for `On ... wrote:` when a message arrives,
and `quotedMessage` in the same file writes that exact shape on the way out.
Both halves live in one file for that reason: when their answer comes back with
our quote inside it, the conversation panel folds it away behind "Show earlier
text" rather than showing it. A test sends a quote through the splitter to
prove the two agree.

**A message whose body never arrived quotes nothing.** Inbound mail is written
by the webhook before its body is fetched, so for a moment a message has no
words. Replying in that moment sends the typed words alone, with no attribution
line standing over an empty block.

**Their own quoted history is passed on, not trimmed.** If their mail already
held three levels of quoting, that is what they sent and what they get back.

**The signature and the quote are not drawn in the conversation on screen.**
The signature is the same lines every time and would bury the words in every
bubble you ever sent; the quote is a message already sitting above it in the
same conversation. The message row keeps the typed words in `text_body`, which
is what the screen draws, and the mail that actually went out in `html_body`.

`In-Reply-To` and `References` carry the newest Message-ID in the conversation,
which is what makes the answer land in the same thread in the reader's own mail
client instead of as a loose email.

Nothing is written when the provider refuses the send. A reply that did not go
out must not appear in the conversation as though it had, and what was typed
stays in the box so the words are not lost over something worth retrying.

### A half-written reply survives a switch

**Opening another conversation no longer empties the box.** You can type three
paragraphs, click another thread to check a date, and come back to your words
with the caret after the last one. Every conversation keeps its own half-written
reply, and three of them never cross.

The words live on the CRM screen rather than in the box itself, in
`src/lib/crm/reply-drafts.ts`, because the conversation panel is thrown away and
rebuilt every time another thread is opened. State inside it is lost on every
switch by definition.

**A conversation with a draft says "Unsent draft" on its row** in the inbox, on
the same line as "To follow up". In words rather than a dot, because "you left
this half written" is not something a colour can say.

Sending clears that conversation's draft, so the words never come back as a
ghost over the next reply, and emptying the box by hand clears it too, mark
included. Spaces alone are not a draft.

**They are held for as long as the screen is open and no longer.** A reload
clears every one of them, which is deliberate: a draft that outlives a reload
needs its own database column, its own cleanup rule, and an answer for two
admins typing in one conversation. If it turns out people reload with drafts
open, that is its own piece of work.

Beside Send there is one shortcut. **Draft with AI** writes a first draft from
the conversation, through the same metered path as every
other AI feature, so the allowance is checked before it and the spend is
recorded after it. It is added under anything already typed rather than over it,
it is never sent, and it is told not to invent a price, a date or a fact that is
not in the conversation.

## Blocking an address

Mail from a blocked address never reaches the inbox. The list is per workspace,
kept in **Settings → Email → Blocked senders**, and a pattern is one of two
things:

- A whole address, `spam@example.com`.
- A whole domain, written with a leading at sign: `@example.com`.

**Nothing is ever deleted.** The message is written exactly as anybody else's
would be, and its conversation arrives already closed and already read, so it
stays out of the default inbox. Setting the inbox's status filter to All finds
it. Silently destroying inbound mail is the one thing this feature must not do,
because a customer blocked by accident has to be recoverable.

**The match is equality, never a substring.** `@example.com` catches
`anyone@example.com` and leaves `me@notexample.com` alone. `jane@buyer.com`
does not catch `notjane@buyer.com`. Capitals make no difference on either side:
the pattern is stored lowered and the sender's address is lowered before it is
compared, because mail arrives with whatever capitals the sender's client used.

**A subdomain of a blocked domain is not blocked.** `@example.com` leaves
`sales@mail.example.com` alone. Blocking a domain nobody listed is the same
mistake as a substring match in a different shape, so the subdomain has to be
listed too if it writes in. This is the opposite of the throwaway-domain list
in `src/server/email/deliverability.ts`, which does catch subdomains — that
list is a hand-kept set of providers whose whole business is temporary
addresses, and those hand out endless subdomains of one name.

**Blocking from the conversation is one press and one confirmation.** Block
this address, in the ⋮ or a row's right-click, blocks it and closes the thread, in
that order: if closing fails the address is still blocked, which is the half
that matters. The confirmation exists although nothing is destroyed, because
a misclick that quietly stopped a real customer's mail is the failure this
whole design is shaped around. The note it writes is "Blocked from the conversation", so the settings
list says where the block came from.

**Unblocking is one press and reopens nothing.** The next message from that
address lands in the inbox; the mail that was blocked stays where it was put.
Reopening a month of spam somebody has already dealt with is not what
unblocking one address is asking for.

**A second Block on the same sender is not an error.** The write answers
whether it was what added the row, so the screen says "that one was already
blocked" instead of a refusal nobody can act on.

**No stage changes and no notice goes out.** A blocked sender's lead is still
written, because a message needs a conversation and a conversation needs a
lead — that is the only way to keep the mail. The lead stays at New with no
chase date, so the follow-up job never mentions it.

**The webhook still answers normally.** A block is not an error, so nothing
throws and Resend does not retry the delivery. `isSenderBlocked` in
`src/server/crm/blocked.ts` is one indexed lookup on the unique index migration
0091 built, asked once per piece of mail.

**One place the block has to be asked about twice.** `mergeByHeaders` moves a
message into the thread its `In-Reply-To` points at, and that move normally
makes the parent thread unread. It runs from the body fetch rather than from
the write, so it asks the blocked list again: without that, a blocked sender
who changed the subject mid-conversation would have their message moved into
the thread they had open before the block, and the move would raise it into the
inbox the block exists to keep clear.

**What blocking does not do.** It does not judge spam by score or by content,
it does not block on the way out, and it is not per inbound address. One list
per workspace, typed by a person.

## Unread, snoozed and closed

A conversation is **unread** while its `read_at` is null. Opening it stamps the
time, Mark unread in the ⋮ or a row's right-click clears it again, and a new message
clears it too, which is what puts it back at the top of the inbox in bold.

**Opening one marks it read, and that is a write**, so it goes out as its own
POST once the conversation is on screen rather than inside the read that
fetched it. A GET skips the origin check on purpose — see `src/server/guards.ts`
— which makes a GET that writes a write another site can have an admin's
browser perform. Unread is shown with a dot and a heavier weight, never
by colour alone.

**There is no open, closed or snoozed.** Tyler, 9 Nov 2026, of open and
closed: "remove the open and closed \"status\" I dont understand the purpose
of it"; then of Snooze, once it was explained: "remove this feature". Nothing
in the CRM closes or snoozes a conversation by hand: Close and Snooze left the
⋮, the right-click and the ticked rows' menu, and Filter lost its "Which
conversations" row. The Inbox is every conversation. Migration 0112 put every
conversation closed by hand back in the inbox, and 0113 every snoozed one; the
background pass no longer wakes snoozes. The inbox's address has no
`status` key any more, and its list always asks for the conversations that
are not closed.

**Closed still exists underneath, for blocked senders only.** Mail from a
blocked address arrives closed and read, and blocking closes the
conversation, so it never shows in the inbox. Answering one brings it back
with "Back in the inbox, because you answered it." `crm_threads.status` keeps
all three values and `snoozed_until` stays, unread, so saved rows still read.

**The word on the left of the reply box's last line is the lead's status**
(their stage: New, Contacted, Quoted, Won, Lost) as a dropdown (Tyler, 9 Nov
2026: "replace it with the status dropdown I can choose", "when I say status
I mean stage but actually change \"Stage\" to \"Status\" stage makes no
sense"). Every screen says **Status** for a lead's stage now: the Leads
table, Filter, New lead, the ⋮'s Deal group and the ticked leads' menu. The
code and the database still call it `stage`.

## The order the inbox comes in

The inbox is newest first, and Filter's Order holds one other choice: **Longest
waiting**, which puts the person who has been waiting the most days at the top.

Newest first is the order for reading mail. Longest waiting is the order for
clearing it. A customer who wrote on Monday was at the bottom of the list by
Thursday, pushed down by everybody who had written since, which is backwards
from who needs answering.

**The choice lives in the address as `sort`.** `/admin/crm?sort=oldest` is the
longest-waiting inbox, so a reload keeps it and the link can be handed to
somebody else. `readCrmSearch` checks it against the two values in
`CRM_INBOX_SORTS`, so a hand-edited address can only fall back to newest first.
The default stays out of the address: there is no `?sort=newest`.

**Filter counts a non-default order as one of the things that is on**,
because a reordered list must not look like an ordinary one. Filter's Clear
puts the order back to newest first along with the rest.

**The order is not a filter, and the empty row knows the difference.** An inbox
with nothing in it says "Nothing has arrived yet" rather than "Nothing matches
that" when all that changed was the order, because the order hides no rows.

**Load more carries the order.** Without that the second page would come back
newest first and restart the list halfway down. Ticked rows are cleared when
the order changes, for the same reason a filter change clears them: page 1 of
one order is not the same set of rows as page 1 of the other.

Paging is `LIMIT`/`OFFSET` over a list that moves. Mail arriving while
somebody is partway down can push one conversation onto the next page or pull
one back, so a row can be missed or seen twice. That was already true of
newest first and the order does not make it worse. `loadMore` in
`src/components/crm/crm-workspace.tsx` filters what comes back by id, so at
least the same conversation cannot be drawn twice.

Both orders are plain `asc`/`desc` on `last_message_at`, which is `NOT NULL`,
so neither needs a `NULLS LAST` — the trap in the last section of this doc.
`src/server/crm/reads.test.ts` runs both of them against a real database.

## Clearing a handful at once

Mass select, in the inbox's ⋮ or a row's right-click, puts a tick box on
every row. The "N selected" menu in the header then deals with the ticked lot
in one press. A morning of newsletters and no-reply notices was otherwise
twenty conversations opened and closed one at a time.

**The tick box sits where the initials were**, so ticking never moves the name
under the pointer. While Mass select is on, pressing a row ticks it rather
than opening it. Turned on from a row's right-click, that row starts ticked.
Turning it off clears the ticks.

The box is a sibling of the row's button, not a child of it. A button inside a
button is invalid HTML, and the inner one swallows the outer one's click.

**The "N selected" menu holds Mark read** (Close and Snooze until were taken
out on 9 Nov 2026).

**One press is one request.** `markConversationsRead` in
`src/lib/api/crm/inbox.ts` takes the whole list of ids, and `markThreadsRead`
in `src/server/crm/inbox.ts` writes them in one statement with `inArray`. Twenty
rows is one trip, and either all twenty are written or none are. The list is
asked again once rather than twenty times.

**The count said is the count that changed.** The write comes back as
`{ changed, unchanged }`. `changed` is how many rows the statement wrote.
`unchanged` is how many of the asked-for ids were this workspace's and were
already in that state, which is the difference between "17 marked read." and
"17 marked read. 3 were already read." An id from another workspace, or one that
no longer exists, is in neither number: nothing happened to it, so nothing is
claimed about it.

Rows already in the asked-for state are left out of the write rather than
written over. Without that, a conversation read yesterday comes back from
`RETURNING` and gets counted as something this press did.

The wording comes from `describeBulkResult` in
`src/lib/format/bulk-result.ts`, through its `keptReason`. Without that reason
the line reads "could not be closed", and a conversation that was already
closed being reported as one that could not be closed sends somebody looking
for a bug that is not there.

**Changing a filter clears the ticks**, through
`useClearSelectionOnListChange`, the same hook every dashboard table uses. The
search, the status, the stage, the unread tab and the follow-up filter all
count. The rows the ticks pointed at are no longer the rows on screen, so a
press on the bar could otherwise act on conversations nobody can see.

**A tick never outlives the row it pointed at.** A fresh loader result also
arrives after a conversation is opened and after a press, and it comes back as
the first page only, so the ticks are pruned to the ids the new list actually
holds. Without that, a tick made on row 45 of a loaded-more list survives into
a list that stops at 30 and the bar counts a row nobody can see.

**Two hundred is the most one press may carry**
(`CRM_MAX_THREADS_PER_PRESS` in `src/lib/crm/crm.ts`). The ids arrive from the
browser and an uncapped array is an invitation to send a hundred thousand of
them. The inbox loads thirty rows at a time, so the cap is seven presses of
Load more with every row ticked, and the bar says so in words rather than
letting the request come back with a validation refusal nobody can read.

Deleting is not here. Nothing in the CRM deletes a conversation yet. Neither is
acting on every conversation the filter matches rather than the ticked ones,
which the contacts list has and which needs its own confirmation.

## Following up

A lead can carry a date and a note. When the date passes, the background pass
writes a `crm_follow_up` notice into the bell for the person the site belongs to,
with the note as its words, and clicking it opens the newest conversation with
that person.

**The bell shows it as "Follow up with <name>"**, with the note on the line
under it and a calendar icon instead of someone's initial. The admin
Notifications table shows and searches the same words. Notices that carry their
own words share one list, `SELF_WORDED_NOTIFICATION_TYPES` in
`src/lib/notification-types.ts`, and a new kind of that sort is added there and
nowhere else. A kind missing from the list falls through to the feedback
wording and reads "Somebody commented on your feedback".

**It fires once.** The stamp that says so is written in the same statement that
finds the row, so two overlapping passes cannot both send it. Moving the date
clears that stamp, which is what lets a date moved forward be chased again. A
lead already Won or Lost is never chased.

## Chasing unanswered mail

**When somebody wrote last and nobody has answered for three days, the bell
says so, once** (CRM task 11): "Jane has waited 4 days for an answer", with
the subject under it. It is the same `crm_follow_up` kind as a hand-set date,
so it shows and searches the same way and opens the conversation. The number
of days is the CRM settings ⋮'s "Unanswered mail" row: Off, or after 1, 2,
3, 5, 7 or 14 days, kept in `email_settings.crm_unanswered_days` (migration
0100), 3 unless changed.

- **Once per conversation.** The stamp is written in the same statement that
  finds the row, and a new message from them clears it, so a conversation
  ignored twice is chased twice.
- **Closed ones are skipped** (only a blocked sender's are closed now), and
  so are leads already Won or Lost.
- **On screen:** the row says "Waiting 4 days", the left page's Waiting on
  you block lists them, the longest waiting first, and the **Waiting pill**
  shows them all. The pill, its count and the block read one rule,
  `waitingConditions` in `src/server/crm/inbox.ts`. With the chase off the
  pill is not drawn.
- **The Outbox pill** sits after Waiting on a laptop only: the mail this
  server would have sent, one row each, the open one on the right as it
  would have arrived (`outbox-panels.tsx`). A live server keeps none.

## A notice when mail lands

**The bell says who wrote in and about what** (CRM task 10): "Jane Doe wrote
in", with the subject under it, and pressing it opens the conversation. Its
own kind, `crm_mail_arrived` (migration 0101 widens the notifications check;
the list only ever grows). It goes to the person the site belongs to, as the
chase notices do, because nobody owns a lead yet.

- **Once an hour per conversation**, so a back-and-forth is one notice, not
  ten.
- **Never for a blocked sender.**
- **A notice that fails never stops the mail being written.**
- Settings → General → Notifications has its switch, "Mail arriving in the
  CRM".

## The live inbox

**Mail arriving while the CRM is open shows at once without moving the
rows** (CRM task 33). The bell's stream already nudges a tab when a notice
lands. The CRM listens for those nudges (`STREAM_NUDGE_EVENT` in
`src/lib/hooks/use-notification-stream.ts`), so it shares the bell's one
connection and its switch, and nothing polls.

- On a nudge it reads the first page again, quietly. A bar says "New mail in
  2 conversations. Show it." and pressing it redraws. A list that moves while
  you read it is worse than one a moment stale.
- The tab counts change at once, because a number changing is not rows
  moving.
- The conversation open on the right takes its new message in place.
- Inside the notice's quiet hour the nudge is still sent, so the screen hears
  every message even when the bell stays quiet.
- With the live bell off, there is no nudge and the screen is what it was.
- **Only the person the site belongs to gets the nudge**, the same person the
  notice goes to. Another admin with the CRM open sees new mail when the
  inbox is next read, not as a bar.

## Starting a conversation

**New email, the inbox's one primary button, writes to somebody who has not
written first** (CRM task 15): to, their name, the address it goes from when
there are two or more, a subject and the message. A small business finds
half its work the other way round, and the CRM could only answer before.

- **Nothing is written when the provider refuses.** The mail goes out first;
  the lead, the conversation and the message are written only after.
- **An address that already has a lead joins it.** A new one is a lead with
  "Added by hand" as where it came from, already Contacted. It never writes a
  contact.
- **The first mail carries a Message-ID of its own**, so their answer
  threads back by header. If Resend puts its own in its place, the answer
  still joins: the same person writing about the same subject within 30 days
  is the same conversation.

## Forwarding

**Forward, in the conversation's ⋮, sends the whole conversation on**, such
as to a builder the job is subcontracted to (CRM task 20): your note, then
every message oldest first, with each file named.

- **Their answer starts a conversation of its own.** The forward carries a
  new Message-ID that is in none of the conversation's mail, and no
  `In-Reply-To`, so there is nothing to thread on.
- **The conversation records it as a quiet line**, "Forwarded to
  builder@example.com, Nov 7 3:12 PM", never a bubble, because it was not
  part of the back-and-forth. Each forward is a row in
  `crm_thread_forwards` (migration 0103).

## What this conversation is about

**Summarise, in the ⋮ of a conversation with four messages or more, writes
two or three plain sentences above the messages** (CRM task 32): what they
want, where it stands, and what is waiting on whom.

- **A press, never on its own.** Each press spends from the AI allowance
  through the same metered path as Draft with AI; a summary on every open
  would spend it all.
- **It is kept** on the conversation with the message count it was made at
  (migration 0102), so opening it twice does not pay twice. Newer mail makes
  it stale, and it says so with "Write it again".
- **It is told not to invent a price, a date or a promise**, and never
  suggests a stage or a next step.

## Who it is with

Name, address, company, phone, stage, what the work is worth, the follow-up
date and its note, and Add to contacts. They are rows in the conversation's
⋮, General tab, since 7 Nov 2026. Each row saves itself, on its own, so two
people editing the same lead cannot have one of them write a stale copy over
the other's change. Money is stored in cents and shown in dollars.

**The footer is the reply box and one line under it** (Tyler, 7 Nov 2026:
"clean up the right panel footer"). The box holds the words, any files, and
"Sent as …" at its bottom left. The line under it has the conversation's
state on the left where there is room, and Draft with AI, Attach and Send
together on the right; in a narrow panel Draft with AI keeps its icon alone.
The folding Contact card that sat above the box is gone ("We dont need this
build in block"): the lead's stage, worth and follow-up date are in the ⋮'s
General tab.

**Tags say what kind of lead it is** (CRM task 27), beside the stage, which
says how far along. The ⋮'s Deal group has a Tags row: type one and press
Enter or a comma, pick one the site already uses, or take one off with its ×.
A tag is lowered and trimmed, holds no comma, and is 60 characters at most;
a lead holds 30. One row per tag in `crm_lead_tags` (migration 0099), as
`member_tags` keeps them. An inbox row shows up to three, and Filter has a
Tag choice once any lead has one.

**No tabs of history, notes or saved replies.** The lead panel had four tabs
at first: the lead, their whole history, notes and to-dos, and saved replies.
Tyler called that badly thought out on 3 Oct 2026. Three of the four were
things you would go looking for once a month, parked beside the one thing you
look at every time. The tables behind them went with them; migration 0082 had
never been deployed, so they came out of it. The ⋮'s two tabs are the facts
and the files, both about the conversation on screen.

Attachments did not go with them. They show in the message that carried them,
which is where somebody looks for a file anyway.

## Files

**The files somebody sends open from the conversation** (CRM task 21). Their
mail is written first with the files' names, then the background pass
fetches each file from Resend into the site's storage, under
`crm-files/<site>/<message>/`, never into the media library. A picture shows
small in the bubble; any other file is a link that downloads. Both come from
one guarded route, `/api/v1/crm/files/<message>/<n>`, which serves a file
only to an admin of the site it belongs to. Every file but a plain picture
is served as bytes to download, so a stranger's HTML can never run in the
admin. Nothing scans these files.

A file that is not stored says why, where its link would be:

- **On its way:** the pass has not fetched it yet.
- **Could not be fetched:** five tries failed, and it stops asking, as the
  words' fetch does.
- **Too big to keep, over 25 MB:** named, never fetched.
- **Set up file storage to open it:** the site has no storage. Nothing is
  fetched and no try is counted.

**The Resend call that lists a received email's files has not been run
against a real Resend account from this repo.** It reads Resend's receiving
API (`/emails/receiving/<id>/attachments`, each entry with a `download_url`)
defensively, in `receiveFiles` in `src/server/email/provider.ts`. Locally,
with no Resend key, every file ends at "Could not be fetched". The first
real inbound mail with a file is the check.

**Files go out with a reply from the media library** (CRM task 22): the
paperclip beside Send opens it, and the picked files show above the buttons
with an ×. Up to 10 MB in all, because Resend takes files as base64 inside
the request, which grows them by a third. The media library holds pictures,
video and sound, so a PDF cannot go out this way yet. A file from another
site, or one gone since it was picked, refuses the whole reply and keeps the
words. A sent file is recorded on the message like theirs, so it shows in
the bubble and the Files tab.

**The ⋮'s Files tab lists every file in the conversation**, theirs and ours,
each a link once it is stored.

## HTML and quoting

Mail that is HTML only is **read as text** rather than drawn. Putting a
stranger's markup into the admin page is not worth the formatting it would buy.

Quoted history folds away behind "Show earlier text". It is the previous email
rather than this one, and a one-line answer under three paragraphs of quoting
would otherwise show the quoting in the list and in the bubble both.

## What the background pass does for the CRM

Four jobs, each isolated so one failing does not take the others with it:

- Chase the leads whose follow-up date has come.
- Chase the conversations nobody has answered (see Chasing unanswered mail).
- Ask Resend again for the message bodies that never arrived.
- Fetch the files somebody sent (see Files).

They ride the same pass as the automation tick and the broadcast send, so they
run on the dev server's timer locally and in the worker container in production.

## Setting it up

Four steps, and until they are done the screen runs on the sample leads the
local seed writes.

`npm run db:setup` writes eight of them, from
`scripts/crm-samples.mjs`. Between them they cover every state the screen can
be in: each of the five stages, an unread conversation, a read one, a chase date that has already passed, a message with files attached, a
thread long enough to cross days, and one message whose body never arrived. An
empty inbox cannot be judged, and a sample set that only shows the happy case
is barely better.

It is safe to run again. Each sample is written only if it is missing, so a new
one reaches a database that already has the others, and **the whole thing is
skipped the moment a lead exists that is not a sample** — an install with real
mail in it is never written to.

1. Point **MX records at Resend** for a subdomain, such as
   `inbox.yourdomain.com`, not the main domain. The main domain keeps its normal
   mail.
2. Create an **inbound address** in Resend, such as `leads@inbox.yourdomain.com`.
3. Tick the **`email.received` event** on the Resend webhook that already points
   at `/api/webhooks/resend`.
4. Paste that address into **Settings → Email → Address mail arriving at**,
   or add it with the **+** on the CRM's left panel. Empty means the CRM has
   no mailbox and cannot reply, and the Send button says so. A second address
   goes in through the **+**, once Resend has it too.
5. Type a name into **Name replies come from**, in the same card. Empty is
   allowed and sends under the app name.
6. Type a **Signature on CRM replies**, in the same card. Empty is allowed and
   adds nothing.

Forwarding an existing Gmail account to that address is how mail already arriving
somewhere else gets in.

Locally there are no MX records, so the real inbound path is walked with
`npx tsx scripts/send-sample-inbound.mjs`. It reads the saved webhook secret,
signs a sample `email.received` body the way Resend does, and posts it at the
dev server. The body cannot be fetched for a made-up email id, so the message
lands with no words and the conversation says so, which is the right answer and
worth seeing once.

## Traps this screen fell into

**A query can be pointed at another workspace if it is not told which one.**
`fillMessageBody` took a message id and looked it up across the whole database.
The screen's own check was on the conversation, not the message, so an admin
could hand over any message id and have the fetch run: no body came back to
them, but it spent another business's email allowance, counted an attempt
against their message, and could move it between their conversations. It takes
the workspace as its first argument now, so there is no way to call it without
one.

**A LIMIT subquery has to repeat every condition the outer query has.** The
follow-up batch picked fifty leads whose chase date had passed, then the outer
query dropped the ones already won or lost. Those rows are never stamped, so
they matched again on every pass. Fifty of them would have filled the batch
forever and nobody real would have been chased again.

**An `ORDER BY` Postgres refuses is invisible until something runs it.** A list
was ordered with Drizzle's `asc(sql`col nulls last`)`, which builds
`col nulls last asc`. Postgres wants `col asc nulls last` and refuses the other
way round. The type check passed, every unit test passed, and the whole lead
panel failed to load in the browser with nothing in the console, because the
error was caught and shown as a toast. `src/server/crm/reads.test.ts` now runs
every query the screen makes against a real database for that reason.

**Sample data has to land in the workspace the person is actually in.** The
seed first took the oldest workspace, then the oldest admin's, and both times
filed eight leads under a workspace nobody was looking at. The CRM read its own
workspace, correctly found nothing, and the screen was empty while the rows sat
in the database. It now follows the admin account `db:setup` creates, which is
the one anybody signs in as locally.

## Where the sidebar link comes from

`/admin/crm` sits in the Administration section under Overview. The address
keeps `?open=`, `?saved=`, `?to=` and the filters, and `ThreePanels` puts
back the last address on arrival and opens the first conversation. A workspace
saved before the screen existed gets the link through navigation upgrade 20,
which adds it once and never doubles one that is already there however it got
there. A sidebar with no Overview link gets it at the front of the section
instead, because a link nobody can reach is worse than a link in a surprising
place.
