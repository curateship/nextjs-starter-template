# Search accounts

Every read of X goes through a search account: a browser profile signed in
to a throwaway X account that only ever reads (parts 3, 4 and 5 of
`workspace/tasks/X/01-x-features.md`).

## Why X needs one

Tyler's rule is that the account a network sees posting never searches. On
Reddit and Medium a reader browser signed in to nobody searches instead
([Behaving like a person](../accounts/behaving-like-a-person.md#the-reader-browser)).
X shows no search results and no replies to a visitor who is not signed in, so
a signed-out reader cannot read X at all. Tyler accepted the search account on
21 Oct 2026, knowing it breaks "a reader must stay signed out" for X only.

## The rules

- **Set up under X in Settings → Behaviour.** Add a browser profile, sign it
  in to a throwaway X account in its browser window on the Browser profiles
  dashboard, and it starts reading.
- **A search account never posts.** A profile holding an account of any
  network can't be added, a profile that searches X is never offered for a new
  account, and the reader can't search X or be one.
- **Looked at before and after every read.** Signed out, signed in as one of
  your accounts that posts, locked, or held up by X, it is stopped for the
  rest of the day with the reason, the bell rings once ("X search account
  stopped:"), and the read is refused.
- **No search account, no X read.** A search pressed with none is refused at
  once with one sentence. It is never run in an account that posts.

## Views

X caps how many posts an account may see in a day. X doesn't publish the
number; free accounts have been held to about 1,000.

- **Each read counts** the posts it put in front of the account, adverts and
  pinned posts included, because those count against X's cap too.
- **The day's number** is in Settings → Behaviour under X, 500 to begin with.
  At the number, the search account reads nothing more until midnight UTC.
- **X's rate limit screen**, if it shows anyway, stops the account for the day
  the same way, and rings "X search account stopped:" once. Whatever that read returned is thrown away, because X answers
  with nothing then, and nothing must ever be read as a post gone. The read is
  tried again 15 minutes later on another search account. With no other
  search account that has views left, a search you pressed fails and says so,
  and the timed searches start again on their own once a search account is
  reading.
- **Several search accounts take turns** (part 4): each read goes to the one
  with the fewest views used, counting each read already waiting in its queue
  as 20, then the one used longest ago, so a batch of searches spreads over
  all of them. One that is resting
  is skipped until the next day, and the others carry on.

Each search account shows its views today, such as "312 of 500 views today",
in Settings → Behaviour and on the X module.

## What a day's reading costs

- A search reads up to 40 posts.
- A watched account reads up to 5, every 15 minutes in waking hours. One
  account watched for 15 waking hours is about 60 reads, or 300 views.
- Reading a post again with its top replies, a sent reply's daily check, a
  mention read and the daily look at an account each cost a handful.
- Looking up an account costs about 20, because its page loads its recent
  posts too.

So one search account at 500 a day covers a project with a few keywords and
one watched account. More watched accounts need more search accounts, each
with its own profile and proxy.

## Where it is

- `src/server/social/x/searchers.ts`: picking, counting and stopping.
- `runXRead` and `lookAtSearcher` in `src/server/social/runner.ts`: the look
  before and after.
- `promo_x_searchers` and `promo_x_settings`, from `drizzle/0125_promo_x.sql`.
