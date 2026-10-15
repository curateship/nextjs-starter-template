# How Reddit sees the account

Settings → Reddit account has a card called "How Reddit sees the account", for
the oldest account in use. Every account's readings also feed its status and
its age and karma on the [Accounts dashboard](accounts-dashboard.md). It
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
- **The stranger's view** is two jobs. The account's own browser asks Reddit
  for the profile's data as the account. Then a `profile_check` job asks for it
  again from the reader browser, signed in to nobody, with its own proxy, and
  only then is the whole reading written. Each runs in a tab of its own that
  closes afterwards, so a page a person is using is never moved. The card says
  it is checking until both are done.

- **On a phone** the account's half is read in the Reddit app: the account
  menu's "u/name", karma and "Reddit age", and the account opening its own
  profile. The app shows the age rounded ("2y", "5d"), so the day the account
  was made is counted down from it, and a more exact day a browser read before
  is kept for the same account. Another account signed in there takes its own
  day, so a young account never inherits an old one's age. The stranger's half still runs in the reader browser, never on
  another phone ([Reddit on phones](reddit-on-phones.md)).

Until 12 Oct 2026 the stranger's half was asked from inside the account's own
browser with the cookies left off. That sent no cookies, but it still came from
the account's browser and proxy, so it moved to the reader. With no reader
picked, the karma and age are still read and the check says to pick one in
Settings → Behaviour.

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
- **Check now on the Accounts dashboard** asks the same for each ticked
  account, or one row's, in one request, and says how many were queued. One
  already being checked, or retired, is skipped and counted.
- **Once a day on its own.** The ticker job `promo-account-health` asks for a
  reading of each Reddit account that runs on a browser profile or, since 14
  Oct 2026, a phone, was signed in when last seen, and is not retired. It counts a day from when the last check was asked for, so a
  check that keeps failing is tried once a day and not every fifteen seconds.
  If the profile's browser is closed, the check opens it, the same as any job.
- **Signed out, it is refused** with "The browser is not signed in to Reddit"
  (on a phone, "The Reddit app on the phone is not signed in"), shown on the
  card, and the last reading is kept.

Nothing acts on a bad reading. There is no pause, no warning sent and no
automatic change. The card says what it saw and the decision stays with a
person.

## Where it is kept

On `promo_accounts`, beside `karma`: `reddit_created_at`, `karma_read_at` and
`profile_check`, added by `drizzle/0099_promo_account_health.sql`. The routine
is `reddit.health` in `docker/browser/routines/reddit.py`, so the browser image
has to be rebuilt before it answers. An older image refuses the routine, and
the check fails with that refusal instead of a reading.
