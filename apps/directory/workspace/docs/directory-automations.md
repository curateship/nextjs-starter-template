# Directory events in automations

Four directory moments can start a flow on the automation canvas, and one
step can email the person the moment is about with the listing filled in.
They sit in the canvas palette beside the shell's own triggers and steps.

## The four starting points

| Trigger | Starts when | The person |
| --- | --- | --- |
| Submission arrived | Somebody sends in a listing and confirms their email address, so it reaches the review queue | The address that sent it in |
| Submission approved | An admin approves a submission and it becomes a published listing | The address that sent it in |
| Claim approved | An admin approves somebody's claim on a listing | The new owner, at the address they proved when claiming |
| Featured spot ending | A featured spot has the chosen number of days left (1 to 30, 7 to start) | Whoever bought the spot |

- **"Submission arrived" waits for the confirmed address.** An address nobody
  has confirmed may not belong to the person who typed it, so a flow never
  writes to it.
- **The built-in emails still go.** The submitter's approval email, the
  owner's "you now look after" email and the featured renewal reminders all
  work as before. A "Featured spot ending" flow can therefore mean the owner
  gets two emails about one spot, and its settings panel says so.
- **None of them can be started with Run.** There is no submission, claim or
  spot to hand the flow.

## Only this site, and only once

- **A flow on one site never starts from another site's events.** Every look
  is filtered by the site the event happened on.
- **Each submission, claim or featured spot starts each flow once.** The run
  carries a key naming it, and the database refuses a second run for the same
  flow and the same key. The featured look runs every ten minutes across every
  server, and finding the same spot again starts nothing.
- **A flow that cannot start never blocks the approval.** Each event fires
  after its own change is saved, and any failure is written to the server log
  and dropped. The approval stands.
- **The shell's pause switch** (Platform settings) skips these events like any
  other. Lifting the pause does not release the ones that were skipped.

## The person goes into People

Tyler's call on 16 Oct 2026: the person a directory flow is about is added to
the site's People list as a contact, with "Directory" as where they came from.

- **Only when a live flow is starting for them.** A site with no directory
  flows adds nobody.
- **Somebody already in People is left as they are.** Their name and their
  opt-out are untouched.
- **A new contact is on the list**, so the shell's own Send email step and a
  broadcast can reach them too, the same as anyone else in People.

## The details a flow gets

Each run carries these, and the "Email about the listing" step fills them in:

| Write | Becomes |
| --- | --- |
| `{{name}}` | The person's name, when they gave one. A submitter gives none. |
| `{{email}}` | The person's email address |
| `{{listingTitle}}` | The listing's name, or the business name on a submission |
| `{{listingLink}}` | The listing's page. Empty until a submission is approved, and for a draft |
| `{{siteName}}` | The site's name |
| `{{siteLink}}` | The site's front page |
| `{{featuredEndsOn}}` | The day a featured spot ends. Empty for the other three |

The Webhook step sends the same details, because it sends a run's facts.

## The "Email about the listing" step

A CMS step, not the shell's Send email: Tyler asked for a step of this app's
own rather than a change to the shell's email step.

- **It writes to the person the trigger is about.** A flow that did not start
  from a directory trigger has nobody for it to write to, and the step says so.
- **Plain text.** Each line of the message becomes a paragraph, sent through
  the directory's own mail code with the site's sender.
- **Somebody who opted out in People is skipped**, and every email ends with a
  link to opt out of this site's emails.
- **It never sends twice.** A delivery row is saved before the send, the same
  as the shell's Send email step, so a retried step finds it and stops.
- **A failed send is written in the run's history** and the flow carries on.

## Where it lives

- `src/lib/directory/automation-nodes.ts`: the five nodes, how they draw, and
  the details list. Registered in `src/app/options.ts`.
- `src/server/directory/automation-events.ts`: starting the flows, the
  featured look, and what each step does. The executors and the ten-minute
  look are registered in `src/app/server-options.ts`.
- `src/components/directory/automations/`: the two settings panels.
- The events fire from `verifySubmission` and `reviewSubmission` in
  `server/directory/submissions.ts`, and `reviewClaim` in
  `server/directory/claims.ts`.

## How to check it

1. Open http://localhost:3015/admin/automations/ab77ac66-0849-405c-b27b-e5189d0f8664,
   the sample flow "Welcome new owners (sample)" on Eat Drink Toronto: Claim
   approved, then Email about the listing. It is switched off.
2. Open the palette's "All nodes" tab. The four triggers are under Triggers and
   the email step is under Actions, each with its one-line description.
3. Switch the flow on, then approve a claim at
   http://localhost:3015/admin/listing-claims. The run appears under Runs within a
   minute, and the new owner gets the email with the listing filled in.
