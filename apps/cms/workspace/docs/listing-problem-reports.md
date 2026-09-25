# Reporting a problem on a listing

A visitor who spots something wrong on a listing can tell the site. They pick
what is wrong, add a line about it, and it lands in an admin queue. The listing
does not change, and nothing the visitor wrote is ever shown to the public.

Events and deals have the same link, feeding the same queue. "Reporting a
problem on an event" in `events.md` and "Report a problem on a deal" in
`promotions.md` cover what is different about them: their reasons, their
page's switch, and the queue's Kind filter.

## What a visitor sees

"Report a problem" sits at the bottom of a listing's page, under the written
body and the site's own extra sections. It is a small link rather than a button,
on purpose: it is for the handful of readers who know something the site does
not.

The window asks for two things and offers a third.

- **The problem.** One of four: wrong opening hours, wrong phone or address,
  closed for good, something else.
- **A note**, up to 1000 characters with the counter beside it. Optional, except
  when they picked "something else" — a report that says only "something else"
  gives the admin nothing to act on, so it is refused with a sentence saying so.
- **Their email**, optional. It is there so an admin can ask a follow-up
  question by hand. Nothing is ever sent to it automatically.

No account is needed. The person who drove to a bakery the site said was open on
Sunday and found it shut is the one most likely to know, and they have no reason
to have signed up.

Once it is sent, the link is replaced by a line thanking them.

## What stops it being used for spam

The form is open to the whole internet, so it does its own checking rather than
trusting the page that called it.

- The site comes from the address being visited, read on the server. It never
  comes from the request body, so a report filed on one site cannot land in
  another site's queue.
- The request must have come from this app's own pages, the same check every
  signed-in POST runs.
- **One report per listing per hour, per visitor.** Sending a second one right
  away is refused with a plain sentence, not an error.
- **Ten reports an hour per visitor** across all listings, events and deals, so one
  person cannot report fifty pages.
- **Fifty reports an hour for the whole site**, listings, events and deals together,
  because every report puts one email in an admin's inbox.

Each of the three says something different when it refuses, because they mean
different things. Being told "you have already reported this listing" when you
have never touched it is worse than being told nothing.

A visitor is told apart by their address. If a proxy hides it, everybody behind
that proxy counts as one visitor, so the site gets one report per listing an
hour instead of one per person. The feature still works; it is just stricter,
which is the right way for this to fail.

The words are checked before any of that counting happens. A visitor who forgot
the note would otherwise spend their one report an hour on a typo and be refused
when they came back with the thing they meant to say.

A report can only be filed against a listing that is published on the site being
visited. A draft is not found rather than refused, which is how the rest of the
directory behaves: a draft must stay indistinguishable from a page that was
never written.

## What the admins are told

Every report puts one line in each admin's inbox, through the same sender the
submission and claim queues use. It names the listing or event and the reason, says
nothing on the page has changed, and links to the queue.

A failed email never loses the report. The row is written first, and the whole
notification is wrapped so it cannot throw — not only the sending, but reading
the list of admins to send to, which is an ordinary database query that can fail
on its own. A mail server having a bad afternoon must not discard something a
visitor took the trouble to send, and it must not tell them it failed either:
they have spent their one report an hour, so a false failure would lock them out
for the rest of it.

## The queue

Admin → Reported problems, at `/admin/listing-reports`.

The screen opens on the reports still waiting, because the only question an
admin has here is what is left to do. Choosing All in the status filter is what
asks for the history. The filter, the search box and the page all live in the
address, so a filtered view can be reloaded or handed to somebody else.

Each row shows the listing or event, the first line of the note, whether it is
a listing, an event or a deal, the reason, the status and the date. The Kind
filter narrows the list to listings, events or deals (`?kind=promotion`). Opening a row shows the whole note,
the reporter's email if they left one, a button to edit the listing or event
and a button to see the public page.

Two answers close a report.

- **Mark fixed** means "I have already corrected the page".
- **Dismiss** means "there is nothing to correct".

Neither touches the listing. The correction happens in the listing's own editor,
which is what the Edit the listing button opens. A window that offered to apply
a stranger's words to a public page would be the thing this whole feature exists
to avoid.

Nothing is emailed to the reporter either way. A report is a tip-off, not a
support ticket.

The count of what is still waiting sits in the queue's own toolbar, the same
place the claims and submissions queues put theirs, and it drops the moment a
report is closed without anybody reloading. It is not a badge in the sidebar:
the sidebar is a shell file, its nav items carry no counts, and an app that
edited one would have forked the shell.

## Two admins, one report

The old status is part of the update's match, so the second of two admins
pressing Fixed at the same moment is told somebody has already dealt with it
rather than silently overwriting the first answer. The same match carries the
site, so another site's admin cannot close a report that is not theirs.

## What deleting takes with it

Deleting a listing deletes its reports, and deleting an event deletes its
reports. Deleting a site deletes all of its reports. Both are foreign keys in the database rather than checks the app has to
remember, because a report about a page that no longer exists is a row nobody
can act on.
