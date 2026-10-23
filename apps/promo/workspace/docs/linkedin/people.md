# People on LinkedIn

The People tab holds the connections side of LinkedIn: requests the accounts
send, requests waiting on them, and who looked at their profiles. Every one
of these is the account acting on LinkedIn, so each waits for the account's
workday and is refused in its warm-up.

## Connection requests

**Connect** on a sent comment, or on a profile viewer, sends that person a
connection request from the same account.

- **The note.** Tyler, 22 Oct 2026: the AI writes a short note and he can edit
  it before Send. The note names the post the account commented on, never
  the product, and never carries a link. At most 200 characters.
- **The number.** Tyler, 22 Oct 2026: "You set it, start at 20" a week, in
  Settings → Behaviour, counted over the last 7 days. LinkedIn restricts
  accounts that send too many.
- **Refused** to the account itself, to someone it asked before, between an
  important and a throwaway account in either direction, and to someone an
  account of the other group already asked.

The Comments tab shows each comment's request: waiting, sent or failed.

## Requests waiting on the accounts

Read once a workday in each account's own browser or phone, and on Read now.
People whose job title matches one of the project's "Who we sell to" titles
come first, with a "Sells to" badge.

Tyler, 22 Oct 2026: nothing is accepted without a press, and an account in its
warm-up accepts nothing. Mass select shows
the tick boxes; Accept goes through the ticked ones one at a time, a minute or
two apart, and says how many went and why any did not. A request accepted or
turned down on LinkedIn itself leaves the list the next time it is read.

## Who viewed your profile

Read once a workday in each account's own browser. Someone who looked at the
profile after a comment is the warmest person to reach, so each has Connect
beside them, and people the project sells to come first.

A free account sees only the last few viewers; LinkedIn hides the rest behind
Premium, and the tab says so in one line. A viewer LinkedIn names only as
"someone at a company" is left out, since there is nobody to connect with.
Marking the account Premium on the Accounts dashboard is how Promo knows it
sees them all.

## The code

`src/server/social/linkedin/people.ts`.
