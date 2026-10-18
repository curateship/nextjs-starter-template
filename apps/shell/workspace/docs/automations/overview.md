# Automations

The automation list lets an admin:

- Create a flow from a blank canvas or template.
- Search, duplicate, rename, and delete flows.
- Test a flow against one contact.
- Turn a flow live or take it offline.

The editor has a node palette, a canvas, an inspector, and a resizable Runs
panel. Changes save after 700 milliseconds of quiet time. The editor compiles
and validates the graph before a run can start.

## Nodes and app ownership

The node registry defines how each step appears and which settings it needs.
The matching executor runs on the server. Apps can register their own node
descriptors, executors, and result views without editing the shared editor.

Built-in starts include:

- Member events.
- Billing events.
- Schedules.
- Segment changes.
- A whole segment, a few at a time (below).
- Manual starts for flows that allow them.

Templates are ordinary flow definitions that can be copied and then edited.

## Runs

The engine creates a run, advances ready steps, records summaries, and closes
the run when the graph has finished. A step can:

- Complete or fail.
- Wait for an approval.
- Sleep until a set time (the Wait step, below).
- Retry.
- Create a delivery record for later work.

The Runs panel shows the saved history and step details.
Runs and delivery histories use the same Load more button and block a repeated
click until the next page returns. A failed load stays in the panel with Try
again. A saved step failure uses the shared inline error text, so it remains
beside the step that produced it without opening a second alert box.

The global pause switch stops automation work without deleting flows or runs.
The system records who paused it and when. Turning the switch back on lets the
background pass continue eligible work.

See [Automation run refresh](run-refresh.md) for live history updates and
[App-owned automation run results](app-owned-run-results.md) for app-specific
reports inside a completed step.

## Testing with one contact

"Test with contact…" walks a flow as if it were about one real contact. Tyler
asked for contacts on 17 Oct 2026: "it should search contacts, not users".

- **Who can be picked.** Any contact in this site that a real send could
  reach: subscribed or cold, with no account behind it or with an active
  member's account. An admin's or an app role's account is never offered.
- **Where the emails go.** Every email goes to the admin who started the test,
  with "[TEST for their address]" in front of the subject. The contact gets
  nothing.
- **The same checks as a real send.** The email is skipped when the contact
  is not in the email's audience, or has an account whose email is not
  confirmed. A contact with no account has nothing to confirm.
- **Tags, waits and webhooks are skipped.** The history says what they would
  have done, such as "Would have called https://… Skipped in this test." A step
  an app adds is skipped unless the app marks it safe for tests.
- **A step that needs an account.** On a contact with no account, the tag step
  says it would stop a real run there, then the test carries on.

The picker reads from `src/server/automations/test-contacts.ts`. Apps can hide
the button on flows with nobody in them through the `memberTest` option, which
keeps its older name so no app breaks.

## Sequences: a segment a few at a time, and Wait

These two steps exist so a flow can send a run of emails days apart, such as
seven emails every other day.

**"Segment, a few at a time" lets a whole segment in.** "Joined a segment"
ignores the people already in it and stops the flow when more than 100 join at
once, which suits a welcome email and rules out an existing list. This start
lets everyone already there in, then anyone who joins later, one batch at a
time.

- **The pace is the drip rules in Settings > Email**: people per batch, minutes
  between batches, sending hours, weekdays only, and the bounce limit. They
  are read live, so changing them changes the pace of a flow already running.
  The Drip sending switch there is about newsletters. This start always drips.
- **Each person gets a run of their own.** So a Wait is two days from that
  person's email, not from whenever the last batch went.
- **Only reachable people are let in.** Opted out, bouncing and spam-marked
  addresses never are. Somebody gone quiet is.
- **Once per person, ever.** Switching the flow off and on, or leaving the
  segment and coming back, never lets anyone in twice.
- **Oldest contacts go first**, so the order is the same on every pass.
- **The bounce limit switches the flow off.** Before each batch it counts the
  people this flow has emailed whose address has since bounced. At 20 or more
  emailed and over the limit (5 in 100 unless changed), the flow goes off with
  the reason on it. Automation emails carry no bounce stamp of their own, so
  the contact's Bouncing status is the record.
- **Nothing new is stored for the pace.** The last batch time is the newest
  enrollment row for the flow, and the gap after it is picked from the range
  using that time as the seed, so every pass of the ticker gets the same gap.
- **The step's panel shows progress**: how many people are let in, how many
  are still to go, and when the next batch goes.

**Wait holds a run for 1 hour to 60 days.** The engine records a "Waiting 2
days, until ..." line, keeps the run pointed at the Wait, and moves its wake-up
time. A sleeping run costs nothing. When it wakes, the Wait runs again, finds
its own line, and decides whether to carry on.

- **It keeps to the sending hours** when the flow starts with "Segment, a few
  at a time". A wait that ends outside them, or on a weekend when weekends are
  skipped, carries on at the next allowed hour. Any other start wakes at the
  exact time.
- **"Stop for anyone who clicked a link"** is on by default. On waking, a person
  who clicked a link in any email this flow sent them ends there, and the
  history names the email. Resend does not say which link was clicked, so any
  click counts.
- **Switching the flow off stops everyone at their next wait.** Otherwise the
  only way to stop a running sequence would be to delete it. A run somebody
  started by hand is not stopped, because a flow that only runs by hand is
  always off.
- **A test with one contact does not wait.** The step says "Would wait 2 days.
  Skipped in this test." and the test carries straight on, so every email in
  the sequence arrives within seconds.

**What a sequence cannot do.**

- **A run keeps the flow as it was when that person started.** Changing an
  email's wording reaches only the people let in after the change.
- **While automations are paused, sleeping runs hold.** Each one sends only its
  next email when the pause lifts, never everything it missed.
- **Seven unopened emails is the default gone-quiet run.** Somebody who opens
  none of a seven-email sequence becomes Gone quiet, which is the rule working.
