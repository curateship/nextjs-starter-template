# Contacts, and who a send goes to

Everyone an app can email lives in one table, `contacts`, one row per address per
website. This file is what a status means, who can set one, and the rule that
marks somebody as having gone quiet. It is true of Custom Shell, Trade, CMS and
Video alike.

## A contact is not an account

Most contacts are also accounts, and `syncContactsFromUsers` keeps those rows in
step with the account: the account owns the address and the name. A contact with
no account is an address somebody typed in or imported, and it is still
mailable.

The contact row keeps existing in its own right on purpose. A send records which
contact it went to, and that record is what makes sending exactly once work, so
the row cannot be a view over accounts.

## The five statuses

A status answers one question: can we still email this person?

| Status | Shown as | Who sets it |
| --- | --- | --- |
| `subscribed` | On the list | Set when the contact is created |
| `cold` | Gone quiet | The gone-quiet rule, or an admin |
| `unsubscribed` | Opted out | The unsubscribe link, or an admin |
| `bounced` | Bouncing | Resend, reporting a refused address |
| `complained` | Marked it spam | Resend, reporting a spam complaint |

**All five can be set by hand**, from the dropdown in a contact's own window.
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

## The contacts list fits the window

The table is a `DashboardTable` with `fillHeight`, so the card is exactly as tall
as the space it is given, the rows scroll inside it, and the column headings and
the paging controls stay put.

Without it the card is shrunk to the space left over and hides what does not fit,
and it hides it with `overflow-hidden`, which nobody can scroll. On a 900px tall
window that put the last four rows and the whole footer out of reach, so there
was no way to change the page size or move to page two. Measured 4 Oct 2026:
1,198px of content in an 812px card, 386px of it unreachable.

**Every other admin table still has this.** `/admin/users` hides 333px the same
way with a full page of rows. `fillHeight` is the fix and it is one word, but it
changes how a short list looks — the card fills the window whether it holds
twenty rows or one — so it is turned on per screen rather than everywhere at
once.

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

## One list of statuses, in one file

`src/lib/contacts/contact-segments.ts` holds the five names, their labels, their
badge colours, their one-line hints and the sentence shown after one is set by
hand. Everything else points at it, including the table's own check constraint
and the type the contacts page uses.

It used to be two lists. Adding `cold` found a second hand-written copy in
`src/lib/api/people/contacts.ts`, which meant the table, the segment rules and
the contacts page each believed something different about how many statuses
existed, and the type check was the only thing that noticed.
