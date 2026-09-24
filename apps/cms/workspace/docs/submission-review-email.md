# The email to the sender after a submission is reviewed

Suggested events follow every rule here too, with "The event is saved as a
draft" where a listing says "The listing is live". `events.md` covers them.

When an admin approves or rejects a listing submission, two things happen. The
decision is written down, and the sender is emailed about it. They are separate,
because the email can fail on its own.

## The decision never waits for the email

Approving creates the listing straight away. Rejecting records the rejection
straight away. Neither is undone if the email to the sender fails, so a mail
server having a bad afternoon cannot lose an admin's decision.

`src/lib/api/directory/submissions.ts` does this by catching the send failure
rather than letting it throw.

## The screen says which of the two happened

The decision comes back with `emailed`, which is whether the sender was actually
told. It is false in two cases:

- The email provider refused the message. A mistyped address, an unverified
  sending domain, a test-mode key.
- The site has no Resend key saved under Settings → Email. Outside production
  the message is logged to the server console instead of sent, which is not a
  send.

The toast is worded from that, in
`src/lib/directory/submission-decision-message.ts`:

| What happened | What the admin sees | Colour |
| --- | --- | --- |
| Approved, emailed | Approved. The listing is live and the sender has been emailed. | green |
| Approved, not emailed | Approved. The listing is live, but the email to the sender could not be sent. | amber |
| Rejected, emailed | Rejected. The sender has been emailed. | green |
| Rejected, not emailed | Rejected, but the email to the sender could not be sent. | amber |

Every one of them names the decision in the first word, so a failed email is
never read as a refused decision. Amber rather than red, because nothing went
wrong with the decision. It is only unfinished: the admin has to reach the
sender another way.

## Checking it locally

A local site normally has no Resend key, so every decision shows the amber
wording. That is the truth, not a bug. To see the green wording without sending
real email, make the no-key branch in `src/server/directory/mail.ts` return
`{ delivered: true }` for the length of the check, then put it back.
