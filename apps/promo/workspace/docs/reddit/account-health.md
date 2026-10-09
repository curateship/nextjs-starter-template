# How Reddit sees the account

Settings → Reddit account has a card called "How Reddit sees the account". It
shows four readings: who the browser is signed in as, the karma, how old the
account is, and whether the profile loads for somebody who is not signed in.
Each one says when it was read. A reading nobody has taken says "Not read yet"
or "Not checked yet", never a blank or a 0, because no karma and unknown karma
are different answers.

## Why the stranger's view matters

A shadowbanned account posts comments that look fine to its owner and do not
exist for anybody else. Reddit sends no notice and no email. The only way to
see it is to look at the profile signed out, which is what this reading does.

## How each reading is taken

- **Karma and age** come from Reddit's own "who am I" answer, which the browser
  already reads after every job to see who is signed in. So they are brought up
  to date after every search, every reply read and every comment, at no extra
  cost. Signed out, the last reading stays with its own date.
- **The stranger's view** asks Reddit for the profile's own data twice, once
  with the browser's cookies and once with them left off. It runs in a tab of
  its own that closes afterwards, so a page a person is using is never moved.

The task asked for a fresh browser with no cookies. That cannot be opened
inside a profile's browser: its cookies live in one saved session, and Reddit
offers no second, empty one beside it. Loading the profile page signed out in a
tab would also write a signed-out visitor's cookies over the signed-in ones. A
request with its cookies left off sends none and keeps none, so that is what
is used. It still comes from the same browser and the same proxy.

## What the words say

The stored reading is only what was seen: what each request answered, whether
it carried a profile, and whether Reddit marked it suspended. The words are
worked out when the card is drawn (`profileCheckWords` in
`src/lib/social/wording.ts`).

- **Seen by a stranger.** "A signed-out visitor can see u/name."
- **Loads for you, not for a stranger.** It says exactly that, adds that this is
  what a shadowbanned account looks like from outside, and that Reddit never
  confirms one. It suggests opening the profile in a private window to see it
  first-hand. It never says the account is shadowbanned.
- **Not found either way.** It says Reddit answered "not found" both signed in
  and signed out.
- **Suspended.** It says Reddit marks the account suspended.
- **Refused or no answer.** It says the reading says nothing either way, with
  the status Reddit gave. A refusal is Reddit refusing the browser, not proof
  about the profile.

A reading taken for a different handle than the one signed in now says which
one it was.

## When it runs

- **Check now** on the card asks the browser program for a reading at once. The
  card shows "Checking" and asks again every three seconds until it is done.
  One check waits at a time, so a second press adds nothing.
- **Once a day on its own.** The ticker job `promo-account-health` asks for a
  reading of each Reddit account that has a browser profile and was signed in
  when last seen. It counts a day from when the last check was asked for, so a
  check that keeps failing is tried once a day and not every fifteen seconds.
  If the profile's browser is closed, the check opens it, the same as any job.
- **Signed out, it is refused** with "The browser is not signed in to Reddit",
  shown on the card, and the last reading is kept.

Nothing acts on a bad reading. There is no pause, no warning sent and no
automatic change. The card says what it saw and the decision stays with a
person.

## Where it is kept

On `promo_accounts`, beside `karma`: `reddit_created_at`, `karma_read_at` and
`profile_check`, added by `drizzle/0099_promo_account_health.sql`. The routine
is `reddit.health` in `docker/browser/routines/reddit.py`, so the browser image
has to be rebuilt before it answers. An older image refuses the routine, and
the check fails with that refusal instead of a reading.
