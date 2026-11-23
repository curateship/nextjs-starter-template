# Subscribers, and who a send goes to

The mailing list lives in one table, `contacts` (the CRM's Subscribers), one
row per address per website. This file is what a status means, who can set one, and the rule that
marks somebody as having gone quiet. It is true of Custom Shell, Trade, CMS and
Video alike.

## A subscriber is never an account

Accounts, subscribers and leads are three separate lists (Tyler, 9 Nov 2026:
"users and subscribers are also seperate. Meaning that a user signs up for
an account to the app does not gets added to the subscribers list.
Subscribber lists are exclusive to impport, manual add or through an email
form"). Signing up adds nobody to `contacts`; only a CSV import, a hand add,
"Add to subscribers" on a lead, or (later) an email form does. One address
may be on more than one list. Until that day every account was copied here
by `syncContactsFromUsers`; migration 0111 removed those copies and the
`contacts.user_id` link.

Newsletters and subscriber automations ("Every subscriber", a segment) go to
`contacts` only. Account automations (every account, confirmed, paying, a
plan, a member tag, and the member and billing events) email the account's
own address from `users`, and an account opts out of them with its own link
(`users.automated_mail_off_at`), not a subscriber status. A send records the
contact or the account it went to, which is what makes sending exactly once
work.

## The five statuses

A status answers one question: can we still email this person?

| Status | Shown as | Who sets it |
| --- | --- | --- |
| `subscribed` | On the list | Set when the contact is created |
| `cold` | Gone quiet | The gone-quiet rule, or an admin |
| `unsubscribed` | Opted out | The unsubscribe link, or an admin |
| `bounced` | Bouncing | Resend, reporting a refused address |
| `complained` | Marked it spam | Resend, reporting a spam complaint |

**All five can be set by hand**, from the dropdown in the open contact's header
on the Contacts dashboard, or for many people at once from Status in the "N
selected" menu.
That includes the two Resend reports. Marking a bouncing address as fine does not
make the mail arrive, so it is not a repair, but an admin who knows a bounce was
a full mailbox on one bad afternoon needs a way to say so. Nothing pretends: the
next bounce writes the status straight back.

The contacts list also has a one-click Take off and Put back on each row, for the
thing that happens most.

## Who a send reaches

A send excludes the three statuses that mean "must not be mailed":
`unsubscribed`, `bounced` and `complained`. There is no second place that has to
remember to skip them — it is one condition, in `audienceConditions` for
newsletters and `audience.ts` for automations.

**Somebody who has gone quiet is still in the audience.** They never asked to
stop and their address works, and the only way back on the list is opening
something they were sent. Excluding them would make gone quiet a room with no
door.

So a send to everybody includes the quiet ones. A send that does not want them
says so with a status rule in its segment, which also makes "who is this going
to" readable rather than hidden in the sender.

## What a send needs before it goes

A newsletter, a sequence email, an automation email and every "Send myself a
test" need two things, and Settings > Email is where both go.

- **A Newsletter from address.** Nothing sends without one. The server's
  `CUSTOM_SHELL_EMAIL_FROM` does not stand in for it. That address belongs to
  sign-in and reset emails.
- **A Resend key.** The key saved in Settings > Email is used first. With that
  box empty, the send uses the server's `CUSTOM_SHELL_RESEND_API_KEY`, the same
  key sign-up and reset emails use. A saved key the server can no longer read
  counts as empty.
- **Only a one-site app borrows the server's key.** On an app serving many
  sites, set by `CUSTOM_SHELL_WORKSPACE_BASE_DOMAIN`, each site saves its own
  key. Otherwise any site owner could mail their list on the operator's Resend
  account.

When a send can't go, the message names the missing piece: "Add a Newsletter
from address in Settings → Email first." or "Add a Resend API key in Settings →
Email first." Before 22 Nov 2026 the screen always asked for a from address,
even when the address was saved and only the key was missing. Test sends also
ignored the server's key, so systemeverything.com could send a sign-up link but
not a test newsletter. `getSendableEmailConfig` and `getEmailSetupProblem` in
`src/server/email/settings.ts`, tested in `sendable-email-config.test.ts`.

## Who a Send sequence step starts

A sequence holds only its emails and the waits between them. An automation
decides who goes into it, with the Send sequence step. Who that step starts
depends on what comes before it in the flow.

- **After an Audience step**, it starts the sequence for everybody in that
  audience, each on their own run, at email 1. This is the same rule Send email
  follows. Tyler, 22 Nov 2026: "fix the message and the send sequence gap".
- **Anybody already partway through the sequence is left alone.** Pressing Run
  now a second time starts only the people who are new to the audience, so
  nobody gets email 1 twice. The run's history names how many were skipped.
- **Accounts that never confirmed their email are skipped**, as Send email
  skips them.
- **With no Audience step**, it starts the run's one person. That's the person
  a Segment trigger or another person trigger started the run for.
- **A test run starts only the tester**, even after an Audience step, so
  pressing Test never puts a whole segment into the sequence.
- **With neither an Audience step nor a person**, the step stops and says: "This
  run has no person to start the sequence for. Put an Audience step before Send
  sequence, or start the flow with the Segment trigger." Before 22 Nov 2026
  Send sequence ignored an Audience step. It failed on every Run now with a
  message that named a "Segment start" step, which doesn't exist by that name.

`startSequenceForRun` in `src/server/email/sequences.ts`, tested in
`sequences.test.ts`.

## Sequence progress and statistics

A sequence shows how far each person has got and what became of every email.
Tyler, 22 Nov 2026: "Sequence works but there's no statistics at all or any
sort of progression indicators". Everything is read from the sequence's runs
and their emails as they stand, so a bounce Resend reports an hour later
shows the next time the panel opens.

**In CRM → Broadcasts → Sequences, the sequence's right panel shows, top to
bottom:**
- **Statistics.** Two tiles, People enrolled and Finished out of People with
  a bar, then one bar each for Open, Click, Bounce and Unsub, drawn to Tyler's
  design of 23 Nov 2026.
  Each rate is out of the emails that went, so "48%" opened means 48 of every
  100 sent. A rate shows "-" until something has gone. Test runs never count.
- **Emails.** Each email gets a grey line of its own numbers, such as "120 sent
  · 48% opened · 9% clicked · 1 bounced · 2 unsubscribed". Numbers that are
  zero are left out.

There is no list of people in the panel. Tyler, 23 Nov 2026: "we dont need
this". Each person's bar and word show on the flow's Runs tab instead.

**The one word** is the first that fits, in Tyler's order: Complained,
Bounced, Unsubscribed, Clicked, Opened, Delivered, Sent. After those come
Failed, for a run that broke or an email that did not go, and Waiting, for
nothing sent yet. Complained, Bounced and Unsubscribed also read the person's
own list status, so somebody who unsubscribed from a newsletter shows it here
too. Colours come from the old Directory app: refusals red, Unsubscribed
yellow, Opened green, Clicked blue, the rest grey.

**A flow's Runs tab** gets Progress and Status columns, but only when the flow
has a Send sequence step. The columns show what that step started for the
run's person. A Run now that started a whole audience shows one bar summed over
everybody, and the number of people in place of a word.

**Where the numbers come from.** Each automation email remembers when it was
delivered, opened, clicked, bounced, complained about and unsubscribed from,
in `automation_deliveries` (migration 0117 added the last three on 22 Nov
2026).
- **Bounces and complaints** are stamped by the Resend webhook, as well as
  changing the contact.
- **Unsubscribes** are tied to an email by the link. Automation emails sent
  from 22 Nov 2026 carry `d`, the email's id, and `s`, a signature over the
  person and that id. A link with a changed `d` is refused. Links in emails
  sent before that date still unsubscribe the person, but count on no email.
  Newsletter links carry no `d`.

`src/server/email/sequence-stats.ts`, tested in `sequence-stats.test.ts`; the
panel is `src/components/crm/sequence-stats.tsx`.

## The site name in an email's header

The header block of a newsletter, sequence email or system email prints the
site's name as text above the logo. The name is text so an inbox that blocks
images still shows who sent the email.

- **"Show site name" switches it off.** The switch is in the header block's
  Logo card and starts on. With it off, only the logo shows, and the logo's
  hidden label becomes the site name, so a blocked image still names the
  sender. Tyler, 22 Nov 2026: "how do I remove this title from the header
  block".
- **The switch only appears once a logo is chosen.** A header with no logo
  always shows the name, or the band would be empty.
- **Deleting the header block doesn't hide the name.** An email with no header
  block prints the name across its top instead.

`showName` on the header block in `src/lib/broadcasts/blocks.ts`, drawn in
`src/lib/broadcasts/render.ts`, tested in `render.test.ts`.

## The gone-quiet rule

After a run of sends that all went unopened, a contact's status becomes `cold`.
The run's length is Settings > Email > "When somebody has gone quiet", from 2 to
50, and seven unless somebody changes it.

- **Why it exists.** Mailbox providers judge a sending domain partly by how many
  of its messages get opened. Ten thousand addresses that never open drag every
  message to everybody else towards the spam folder.
- **Both kinds of mail count.** Newsletters record their opens and clicks in
  `deliveries` and automation steps in `automation_deliveries`, and the rule
  reads a run across both. Reading one would give a list that gets a weekly newsletter and a
  welcome sequence two separate half-blind runs.
- **A failed send does not count.** It never left, so it cannot have been
  opened.
- **Fewer sends than the run leaves somebody alone.** Two unopened emails is not
  evidence.
- **It only ever overwrites `subscribed`.** The other three statuses say more
  than "has not opened lately".
- **One open anywhere clears it.** The Resend webhook writes the open onto the
  delivery row and puts the contact back to `subscribed` in the same pass. Both
  are tied to the first open: a replayed event finds a date already there,
  changes nothing, and does not resurrect somebody who has since gone quiet
  again.
- **An unopened message is not proof of anything.** The open is a hidden image,
  so a mail client that blocks pictures reports nothing on a message somebody
  read end to end. That is the whole reason the rule needs a run rather than a
  single message, and why the default is seven.

The rule runs after a send rather than on a timer, and only for the people just
sent to: going quiet can only become true at the moment another message goes
unopened, so nobody else's answer can have changed. On a 25,000 contact list a
timed sweep would read every send ever recorded to work out what a batch of 200
already knows.

## The contacts list fits its panel

The contacts list is the middle panel of a three-column dashboard, so the page
fills the window and the list scrolls inside its own panel, with the column
headings and the paging controls staying put. It used to be a `DashboardTable`
whose card hid what did not fit with `overflow-hidden`: on a 900px tall window
the last four rows and the whole footer were out of reach (measured 4 Oct 2026).

The columns hide by the panel's width, not the window's, because the panel is
about half the window. At 646px wide the list shows Email, Status and Actions;
Name, Tags, Last emailed and Added join as the panel widens, and on a phone
Status goes too, since the open contact's header shows it.

A row is as tall as its tallest cell, which is why the tags column stops after
three and offers "+N more". An imported contact carrying 74 tags made one row 74
lines high on its own.

## The two rules about engagement

Both are in the Add a rule menu, they sound alike, and they answer different
questions.

- **When they last opened or clicked** counts **days**. "Opened or clicked in
  the last 30 days." It reads opens and clicks together, across newsletters and
  automation mail.
- **Opens in their last few emails** counts **emails** and has no clock at all.
  "Opened none of their last 7 emails" means the last seven that person was
  sent, whenever that was.

**Why clicks count for one and not the other.** An open is a hidden image, so a
mail client that blocks pictures reports nothing on a message somebody read and
clicked a link in. A click cannot happen by accident, so it is the stronger
signal and the engagement rule reads both. The opens rule reads opens only,
because the gone-quiet rule does and the two have to agree.

**Why the second has no clock.** Stop sending for six months and nobody falls
out of it, because the last seven emails are still the same seven. That is what
makes it the re-engagement rule: it follows your sending rather than the
calendar. The first one keeps ticking regardless.

A worked case. You sent two newsletters all year, both in January, and somebody
opened the second on 20 January. Today is 4 October. "Opened or clicked in the
last 30 days" is false, because that was 257 days ago. "Opened one of their last
2 emails" is true, because the last two you sent are the January ones.

**"Opened none of them" includes somebody who was never sent anything.** There
is no message of theirs that went unopened because there is no message, and the
honest answer to "did they open any" is no. It is also the answer a
re-engagement send wants.

Both are built as one pass over the sends producing a list of contact ids, then
an `in`, rather than a subquery run once per contact. Partly speed, mostly
safety: a hand-written correlated subquery over two tables is where a bare
column name silently resolves against the wrong one and returns a plausible list
instead of an error.

## Segments

A segment names a group once, so everything that has to say who something is for
points at the name. Two shapes:

- **Rules** — the conditions are saved and the people never are, so they are
  worked out fresh every time anything asks. Somebody who unsubscribes this
  morning is out of the group this afternoon with nobody having to remember.
- **Hand-picked** — the people themselves, for the one-off list no rule
  describes.

The contacts list's own filters are written in exactly the same rules, and go
through the same code, so the list you filtered down to and a segment saved from
it can never mean two different things. That matters because two of the things
that read a filter delete people.

Segments live on the Contacts dashboard, not a page of their own (Tyler, 19 Oct
2026: "We have to combine both the contacts and segment into one 3 col
dashboard"). They work like saved views: pressing one in the left panel applies
it to the list, and Filter saves the list's rules as a new segment or updates
the open one. `/admin/segments` only forwards to `/admin/contacts`, with
`?open=<id>` becoming `?segment=<id>`, and the left menu has no Segments link.
The app's own doc, `apps/shell/workspace/docs/people/users-contacts-and-segments.md`,
describes the screen.

## One list of statuses, in one file

`src/lib/contacts/contact-segments.ts` holds the five names, their labels, their
badge colours, their one-line hints and the sentence shown after one is set by
hand. Everything else points at it, including the table's own check constraint
and the type the contacts page uses.

It used to be two lists. Adding `cold` found a second hand-written copy in
`src/lib/api/people/contacts.ts`, which meant the table, the segment rules and
the contacts page each believed something different about how many statuses
existed, and the type check was the only thing that noticed.
