# The CRM: the inbox, and the leads it makes

The CRM is one screen at `/admin/crm` for mail that comes in. It reads it,
answers it, and keeps a record of who it was with so they can be chased later.
Everything else in the app sends mail outward; this is the only part that
receives any.

Three panels, and each has one job:

- **Left, the inbox.** One row per conversation, with search and filters above
  it.
- **Middle, the conversation.** The back-and-forth oldest first, with the box to
  answer it at the foot.
- **Right, the lead.** Who they are, what stage they are at, what the work is
  worth, and when to chase them.

There is no bottom panel. The email and automation editors use one to show a
list of things that happened to the thing above it, and a conversation already
is that list.

## What it looks like, and why

Tyler set the look on 2 Oct 2026 with a picture:
[the mockup](../assets/pasted-image-1790966797817093000.png). Four things in it
are decisions, not decoration.

**The inbox header is two tabs and two buttons.** All and Unread, each carrying
its own count, because those are the only two things looked at constantly.
Search sits behind the magnifying glass and the rest of the filters behind the
funnel. Five controls on permanent display would take a third of the panel's
height from the list they exist to narrow. The funnel carries a dot when
something is on, so a list narrowed yesterday cannot look empty today.

**A tab's count is a soft grey chip, never a coloured number.** `TabsCount` in
`src/components/ui/tabs.tsx` draws it, so every screen in every app gets the
same one. On the chosen tab it sits on the raised white pill and reads as a
chip; on the others it sits on the track, which is the same shade, so it
quietly disappears — which is what a count on a tab nobody is looking at should
do. A coloured number competes with the label and makes the control look like
it is warning about something. Tyler set this on 3 Oct 2026 with
[a picture](../assets/pasted-image-1790999823792568000.png). The digits are
fixed-width with a minimum width, so the pill does not jump going from 9 to 10.

**Neither count moves when you press the other tab.** Both obey every filter
except the unread one, so a search for "kitchen" answers how many of those
there are and how many of those are unread. `countInboxThreads` works both out
in one query, which is why they can never disagree. Counting the list instead
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

**The three panels start at roughly a fifth, a half and a quarter**, and each
browser remembers where you drag the dividers. The inbox came down by a fifth
on 3 Oct 2026: a conversation needs the room more than a list of names does.
When those starting widths move again, the key in
`src/lib/layout/panel-layout.ts` has to move with them — a remembered layout
outranks the default, so a browser that had already drawn the old proportions
would keep them and the new ones would appear to do nothing.

**A conversation is drawn as a back-and-forth.** Theirs sit left in a plain
bubble, ours sit right in a bubble tinted with the brand colour, and the time
sits under each one. A day separator appears whenever the date changes, because
a bare `10:41` on mail three weeks apart says nothing. Nobody's address is
repeated on every message: it is the same two people the whole way down, so the
header says it once. A screen reader still hears "You wrote" or "They wrote" on
each one, so which way it went never rests on which side it is drawn.

The three square buttons in the conversation header are **mark unread**,
**snooze** and **close**, and each does something. There is no star: nothing in
the CRM is starred, and a button that only looks right is a button that lies.

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

## Unread, snoozed and closed

A conversation is **unread** while its `read_at` is null. Opening it stamps the
time, the envelope button in the header clears it again, and a new message
clears it too, which is what puts it back at the top of the inbox in bold.

**Opening one marks it read, and that is a write**, so it goes out as its own
POST once the conversation is on screen rather than inside the read that
fetched it. A GET skips the origin check on purpose — see `src/server/guards.ts`
— which makes a GET that writes a write another site can have an admin's
browser perform. Unread is shown with a dot and a heavier weight, never
by colour alone.

A conversation is **open**, **snoozed** or **closed**. Snoozed is "not now, ask
me again later" and carries its own date; the background pass puts it back to
open when that date passes. Closed is done with. Neither deletes anything, and
the inbox shows open ones by default because the question this screen answers is
what needs doing.

**Answering a conversation reopens it.** If you reply in one that was closed or
snoozed, it goes back to open and a snooze date is cleared, and a toast says
"Reopened, because you answered it." If you are still talking, it is not done.

This closes the one way the CRM could silently lose a live conversation: close a
thread, find it again in a search, answer it, and it stays invisible in an inbox
that shows open ones. Their answer then arrives into a thread nobody looks at.

The status changes in the same statement that bumps the message count, so there
is no moment where the reply exists and the status is stale. A refused send
writes nothing at all, the status included.

**An inbound message does not reopen a closed thread.** A new message already
clears `read_at` and puts the conversation at the top of the list it is in.
Whether somebody writing again should reopen a thread you deliberately closed is
a separate question, and the answer may be no.

## Following up

A lead can carry a date and a note. When the date passes, the background pass
writes a `crm_follow_up` notice into the bell for the person the site belongs to,
with the note as its words, and clicking it opens the newest conversation with
that person.

**It fires once.** The stamp that says so is written in the same statement that
finds the row, so two overlapping passes cannot both send it. Moving the date
clears that stamp, which is what lets a date moved forward be chased again. A
lead already Won or Lost is never chased.

## What the right panel holds

Name, address, company, phone, stage, what the work is worth, the follow-up
date and its note, and the button that puts them on the newsletter list. Each
box saves as it is left, on its own, so two people editing the same lead cannot
have one of them write a stale copy over the other's change. Money is stored in
cents and shown in dollars.

**One column, no tabs.** It had four at first — the lead, their whole history,
notes and to-dos, and saved replies — and Tyler called that badly thought out on
3 Oct 2026. He was right. Three of the four were things you would go looking for
once a month, parked permanently beside the one thing you look at every time,
and each tab hid the others behind a click. The tables behind them went with
them rather than sitting in the database with no way in; migration 0082 had
never been deployed, so they came out of it instead of arriving and being
dropped one file later.

Attachments did not go with them. They show in the message that carried them,
which is where somebody looks for a file anyway.

## Attachments and HTML

An attachment shows its name and, when the provider said, its size. Resend's
event does not carry sizes, so inbound files usually show none rather than a
made-up number.

Mail that is HTML only is **read as text** rather than drawn. Putting a
stranger's markup into the admin page is not worth the formatting it would buy.

Quoted history folds away behind "Show earlier text". It is the previous email
rather than this one, and a one-line answer under three paragraphs of quoting
would otherwise show the quoting in the list and in the bubble both.

## What the background pass does for the CRM

Three jobs, each isolated so one failing does not take the others with it:

- Chase the leads whose follow-up date has come.
- Wake the conversations whose snooze has run out.
- Ask Resend again for the message bodies that never arrived.

They ride the same pass as the automation tick and the broadcast send, so they
run on the dev server's timer locally and in the worker container in production.

## Setting it up

Four steps, and until they are done the screen runs on the sample leads the
local seed writes.

`npm run db:setup` writes eight of them, from
`scripts/crm-samples.mjs`. Between them they cover every state the screen can
be in: each of the five stages, an unread conversation, a snoozed one, a closed
one, a chase date that has already passed, a message with files attached, a
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
4. Paste that address into **Settings → Email → Address mail arriving at**.
   Empty means the CRM has no mailbox and cannot reply, and the Send button says
   so.
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

`/admin/crm` sits in the Administration section under Overview. A workspace
saved before the screen existed gets the link through navigation upgrade 20,
which adds it once and never doubles one that is already there however it got
there. A sidebar with no Overview link gets it at the front of the section
instead, because a link nobody can reach is worse than a link in a surprising
place.
