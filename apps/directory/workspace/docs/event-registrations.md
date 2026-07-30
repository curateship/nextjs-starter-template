# Event RSVPs and Registration

How people sign up for an event, free or paid, and what happens after they do.

## Where the settings live

An event's registration settings sit on its `event-content` block, next to the date, time and
venue — the same block-JSON model the rest of events already uses (see
`content-template-inheritance.md`). Four values:

- `registrationMode` — `free`, `paid`, or absent (off).
- `capacity` — a whole number of seats. Absent or 0 means no limit.
- `ticketPriceId` — the Stripe Price id that is actually charged. Paid events only.
- `ticketPriceLabel` — display text on the button, e.g. `$25`. Never used to charge anyone.

The owner edits these in the event builder's **Registration** card. A paid event with no valid
Stripe price reports itself as "off" rather than showing a buy button that would fail at checkout.

Nothing about registration lives in an `events` column, so no schema change is needed to turn it on
for an event — only `event_registrations` (migration 195) is new.

## Free RSVP

The public event page renders `EventRegistrationPanel`. The page itself is cached, so the panel
always asks the server for the live state on mount: mode, seats taken, seats left, whether the event
has started, and (for paid) whether the site can take a payment.

A submission goes through `submitEventRegistrationAction`:

1. Honeypot, then a per-IP-per-site rate limit.
2. The event must be published and in `free` mode, and must not have started.
3. Inside a transaction that locks the event row, the seats are counted and the row is inserted. The
   lock is what stops two people racing for the last seat.
4. The same email signing up twice gets "you're already on the list" — one live row per person per
   event, enforced by a partial unique index on `(event_id, lower(email))`.
5. The confirmation email is sent, and `confirmation_sent_at` is stamped only if it actually went
   out. A site with no Resend integration still records the RSVP.

## Paid tickets

Paid uses the same Stripe Checkout pattern as Featured listing upgrades:

1. The seat is held first — a `pending` registration row — so "sold out" stays truthful while the
   buyer is on Stripe's page.
2. A Checkout session is created with `commerceType: event_ticket` metadata carrying the site,
   event and registration ids. If Stripe rejects the request, the hold is deleted so the buyer can
   retry.
3. `checkout.session.completed` (or `async_payment_succeeded`) in the Stripe webhook calls
   `confirmEventTicketRegistration`, which re-validates every metadata field against the database
   and flips the row to `confirmed`, recording what Stripe says was charged.
4. The success redirect back to the event page also confirms, so the buyer sees the result
   immediately. Both paths are idempotent — the update is guarded on the row being unconfirmed, and
   the Stripe session/payment-intent ids are uniquely indexed.

A `pending` row stops counting against capacity after `REGISTRATION_HOLD_MINUTES`, so abandoned
checkouts release their seat. If payment lands after the hold lapsed and the event has filled up in
the meantime, the paid attendee is still confirmed — the admin screen shows the count against
capacity so the owner can see the overage.

**One payable session per seat.** A seat's Stripe session id is stored on its hold, and starting a
second checkout for the same email expires the previous session first. Without that, someone with two
tabs open (or who used the back button) would have two live sessions for one ticket, could be charged
twice, and only one of those payments could ever become a registration. If the earlier session turns
out to have already been paid, it is confirmed instead and the second checkout is refused. Should a
duplicate payment still arrive for a seat that is already paid for, the confirmation refuses it and
logs `Event ticket paid twice for one seat — refund required` with the payment reference, rather than
quietly reporting success.

## Emails

Two editable system-email templates, alongside the app's other transactional emails:

- `event_registration_confirmation` — immediately after signing up or paying.
- `event_reminder` — sent by `/api/cron/event-reminders` (hourly) when an event starts within
  `REMINDER_LEAD_HOURS` (24h).

Both offer `{{attendee_name}}`, `{{event_name}}`, `{{event_when}}`, `{{event_location}}`,
`{{ticket_url}}`, `{{ticket_qr_url}}`, `{{event_url}}`, `{{event_calendar_url}}`, `{{site_name}}`
and `{{site_url}}`. The two ticket tokens are the only ones besides the name that differ per
recipient — everything else is resolved once for the whole list.
`reminder_sent_at` is stamped only on a successful send, so an unconfigured mail sender means the
reminder retries rather than being silently skipped.

## Events with no date yet

An event whose date has not been set is treated as **not started**, so sign-ups stay open: nothing
can be claimed about a date that does not exist, and closing registration with "this event has
already started" would be untrue. The confirmation email prints "Date to be announced", and the
reminder cron only ever looks at events that do have a date, so such an event simply gets no
reminder until the owner sets one.

## Timezones

Events carry a floating wall-clock date and time with no timezone — the model `calendar.ts`
documents and the `.ics` output relies on. Registration follows it: "has the event started" and "is
the reminder due" compare the event's wall-clock start against the server's clock. A per-event
timezone would have to change the whole event date model (page, calendar feed, `.ics`, recurrence),
so it is deliberately out of scope here.

## Admin

`/admin/events/registrations` lists every signup for the current site: attendee, event, ticket
amount, status, whether they have been checked in, when they registered and whether the reminder
went out. The event filter shows each event's confirmed count against its capacity and how many of
those people actually turned up. Removing a registration cancels it — the seat is freed and a paid
row keeps its Stripe references for the owner's books, and nothing is refunded automatically.

## Check-in at the door

Every registration gets a **ticket code** the moment it is created (migration 198): sixteen
uppercase hex characters, random, unique, and never reused. It is a bearer token — whoever holds it
can open that ticket's page — so it is generated rather than derived from the row id, and the
registrations that predate the migration were backfilled from `gen_random_uuid()`.

**The ticket page** is `/tickets/{code}` on the site's own domain. It shows the attendee's name, the
event, when and where, the code printed in groups of four, and a QR of that same URL. The QR is
generated by `src/lib/utils/qr-code.ts` — `uqr` encodes the matrix, and this file draws it as inline
SVG for the page and as a hand-written 1-bit PNG for the email, because mail clients do not render
SVG. `/api/tickets/{code}/qr` serves that PNG and is what `{{ticket_qr_url}}` points at. Both the
page and the image are scoped to the site the request arrived on, so one site's URL can never serve
another site's ticket, and the image endpoint refuses codes that are not real tickets rather than
acting as a general-purpose QR generator.

**Scanning is the phone's own camera, not an in-page scanner.** Point any phone at the QR and it
offers the ticket URL; an organizer who is signed in to that site's admin lands on the ticket page
with a **Check in** button on it, one tap from done. This is deliberate: the browser barcode API
(`BarcodeDetector`) exists only on Android Chrome, and the app's `Permissions-Policy` header keeps
`camera=()` off for every page — an in-page scanner would work for a minority of organizers and
would cost a security header to enable. The native camera works on every phone and asks for no
permissions at all. Sessions are per host, so the organizer must be signed in on the *site's* domain
(`site.example.com/admin/...`), not the platform one, for the button to appear.

**The door screen** is `/admin/events/check-in`. Pick the event, and it shows how many of the
registered have arrived, a box to type or paste a ticket code, and a name/email search over the
confirmed attendees with a Check in button on each row. Its event picker lists the next event first.
Arrivals are applied to the screen from the server's own answer rather than reloading the board —
on venue wifi, a round trip between every attendee is the difference between a queue moving and a
queue waiting.

Scanning the same ticket twice warns with who it belongs to and when it was first used, rather than
counting them again: the update is guarded on `checked_in_at` still being null, so two organizers
scanning at the same moment cannot both record an arrival. A real ticket for a different event is
refused by name and event title. A ticket whose payment never completed says so and is not admitted;
one the owner removed says that instead. Only confirmed registrations appear in the attendee
list — someone who abandoned a checkout is not registered, and listing them at a door only raises
the question of whether to let them in.

Every check-in path requires an admin session. The code alone lets you look at a ticket; it never
lets you mark one used.
