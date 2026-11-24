# Sequences

A sequence is a set of emails in order, with a wait before each one after the
first. It says nothing about who gets it or when: an automation's Send
sequence step does that.

Tyler asked for it on 16 Nov 2026: "in broadcast page. create a tab for
sequence. So we have 2 tabs broadcast and sequence. Sequence is just a
collection of related newsletters." The first version had its own segment
and an on switch. He took both out the same day: "why do i need to pick a
segment?", then "Neither. The trigger is set in automation. This just
organizes sequence." The task is `workspace/tasks/broadcast-sequences.md`.

## Where it is

- **The CRM's Broadcasts section has two header tabs**, Broadcasts and
  Sequences, each with its count, first in the header with no icon or name
  before them (Tyler, 16 Nov 2026: "remove icon"). The first tab is the
  section's name. Sequences is `?tab=broadcasts&list=sequences`. Switching
  tabs lets go of the open record, the search and the newsletters' dropdown.
- **The table:** Sequence, Emails, Used by, In progress, Finished, and when it
  changed. Used by names the automation that sends it, says how many when
  more than one does, or says "Not used yet". Right-click has Mass select,
  Make a copy and Delete. Select deletes several at once.
- **New sequence** asks for a name only, then opens the sequence on the right
  with one empty email.

## The right panel

`SequenceRecord` in `src/components/crm/sequence-records.tsx`, built from the
shell's own pieces, as the newsletter panel is (Tyler, 16 Nov 2026:
"remember to build the right panel using standard ui").

- **The Emails card** lists the emails in order: the number, the subject (or
  "No subject yet") and when it goes ("Right away", "3 days later"). The
  card's + adds an email at the end. It shows when the card is pointed at, as
  every panel card's buttons do.
- **Under each email, a grey line of what became of it:** "120 sent · 48%
  opened · 12% clicked · 400 waiting", only the numbers that are not zero.
  Waiting is the people whose next email this is, about to be sent it or
  waiting out the gap before it, so each person is counted once (Tyler,
  23 Nov 2026: "how many are waiting"). Before anything has gone it reads "Not
  sent yet". It counts every flow that uses the sequence; a live flow's own
  Send sequence card counts only its own people
  ([A running flow](../automations/live-flow.md)).
- **A row's ⋯** has Change the wait, Add an email after, Move up, Move down
  and Delete. The first email has no wait to change, because it goes the
  moment the person reaches the automation's step. A move or a delete keeps
  it that way: whichever email ends up first loses its wait, and an email
  moved down from first gets two days. The last email cannot be deleted, so
  the sequence is deleted from its ⋮ instead.
- **Pressing a row opens the email** in the newsletter editor (`EmailPage`),
  with the same "/" blocks and typing in place. The header says "Email 2 of
  3" and its wait, with a back arrow to the list. The email's ⋮ holds the
  subject, the preview line, the From name, the wait and Delete this email.
- **The Used by card** lists the automations whose Send sequence step sends
  it, each opening that automation's canvas. With none, it says to add a Send
  sequence step in Automations.
- **The sequence's ⋮** has its name, Make a copy and Delete.
- **The footer** says Ready, with how many people are partway through and how
  many got every email, or Not ready with the first thing to fix, such as
  "Email 2 needs a subject." Test runs are not counted.
- **Send myself a test**, at the footer's right, sends one email of the
  sequence to the signed-in admin's own address (Tyler, 17 Nov 2026: "Add a
  test email button here to test one of the email sequence"). With an email
  open, that email goes. On the list of emails, the button opens a list of
  them to pick from. It saves first, so the copy is what is on screen. The
  copy is built like a newsletter's test: "[TEST]" before the subject, "Test"
  as the first name, the email's own From name. Nobody is started on the
  sequence and nothing is counted. A good send shows nothing, the same as a
  system email's test; a failure says why. With no email set up in Settings →
  Email, nothing goes and it says so.
- **It saves** 700ms after the last change, the name and every email together.

## The Send sequence step

The step is in the Automations palette under Flow
(`src/lib/automations/nodes/send-sequence.ts`, run by `startSequenceForRun`
in `src/server/email/sequences.ts`). Its one setting is which sequence.

- **The person who reaches the step starts the sequence at email 1**, on a
  run of the sequence's own. The automation carries straight on to its next
  step and does not wait for the sequence to finish.
- **Only a run about one person can use it**, such as one started by Joined a
  segment or Member registered. A run about nobody in particular stops at the
  step and says so.
- **It stops, and says why, when the sequence has been deleted** or has an
  email that is not ready (the footer's Not ready).
- **A retried step cannot start the same person twice.** The sequence's run
  carries a key naming the automation's run and step, and the database
  accepts a key once.
- **A test with one person** starts a test of the sequence, whose emails go to
  the test address. A test does not wait, so every email arrives within
  seconds.
- **A dry run** says it would start the sequence and starts nothing.

## How the emails go

- **A wait counts from the email before it**, in hours or days, from 1 hour up
  to 60 days.
- **A click in an email does not stop the series.** The automations' Wait step
  can stop for anyone who clicked a link, and a sequence switches that off.
- **A sequence has no switch, so its waits never stop for one.** The Wait step
  stops runs of a switched-off automation; a sequence is always off, so the
  Wait leaves runs of a sequence alone (`flowSwitchedOff` in
  `src/server/automations/wait.ts`). Switching off the automation that sent
  it does not stop a sequence already started.
- **An edit reaches people who start after it.** Each person keeps the emails
  as they were when they started, so someone partway through finishes the old
  version.
- **Deleting a sequence** stops it for everyone partway through. Emails
  already sent stay sent.

## How it is stored

- **A sequence is an automation** of kind `sequence` (the `kind` column on
  `automations`, migration 0115). The automations engine does the sending and
  the waiting, with the same unsubscribe links and delivery records as any
  flow.
- **Its steps are a straight chain with no start step:** Send email, then a
  Wait and a Send email for each email after the first (`sequenceToGraph` and
  `sequenceFromGraph` in `src/lib/broadcasts/sequence-graph.ts`). Each email
  keeps its own id across saves, so the step names do not change under people
  partway through.
- **Saves go through the automations' own save**, so the server's compile is
  still the only thing that writes what the engine runs.
- **The Automations dashboard lists flows only,** and its save refuses a
  sequence. A sequence opened on the canvas by its address can be looked at,
  but it cannot be redrawn into a shape this tab cannot show. If stored steps
  ever stop being a chain, the right panel says so instead of guessing.
- **A name has to be different from the site's other sequences only.** A
  sequence and an automation may share one, because they are listed on
  different screens (migration 0116; Tyler, 16 Nov 2026, of a new sequence
  called "test" refused because an automation had that name).
