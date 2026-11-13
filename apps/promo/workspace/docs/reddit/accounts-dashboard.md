# Accounts

Every account on every platform in one list, with its status, the project it
comments for, the browser profile or phone it runs on, and how that goes
online. Since 12 Nov 2026 it is the Accounts section of the
[Projects dashboard](../projects-dashboard.md)
(`/admin/projects?section=accounts`). Tyler: "We need to consolidate
projects, voices, accounts, archive and messages into one cohesive 3 panel
design."

Tyler, 15 Oct 2026: "I think accounts should be on its own dashboard with
platform filtering". It had been a window inside each project for a day, after
the Reddit accounts page left the left menu on 14 Oct 2026
([Networks as modules](../network-modules.md)).

- **Platform** is one of Filter's choices, "All platforms" or one network, and
  each row names its platform after the account ("u/name · Reddit",
  "@name · Instagram", "in/name · LinkedIn"). Reddit, Instagram, TikTok,
  Medium, X and LinkedIn accounts are listed.
- **A Medium account's row** says how long it has been on Medium and its
  followers, and has a key button that opens Medium's emailed sign-in link in
  its own browser, at the top of the account on the right ([Medium accounts and signing in](../medium/signing-in-and-accounts.md)).
  Add account offers each network the browser profiles with none of that
  network's accounts in them yet, never the reader and never a profile that
  searches X or LinkedIn.
- **An X account's row** says how long it has been on X, shows the daily
  look's guess whether X hides it, and has a key button that sends X's
  sign-in code when its authenticator secret is saved. Its right panel
  holds Paid, Follow the people it replies to, every Nth reply starting as Help
  only, and its followers and views week by week ([X accounts](../x/accounts.md)).
  Check now takes the daily look straight away.
- **A LinkedIn account's row** says when Promo first saw it signed in, shows
  the weekly look at whether its comments still show, Premium, and a line when
  LinkedIn wants its emailed code. Its right panel holds Premium, the box
  for the code, the comments look, and its followers, connections, profile
  views and impressions week by week ([LinkedIn accounts](../linkedin/accounts.md)).
  Check now takes the comments look straight away.
- **The filters live in the address** as `?platform=reddit`, `?status=`,
  `?importance=`, `?tag=` and, on Retired, `?reason=`, so a reload or a link
  always shows what the address says. **Manage accounts**, the last item in
  the **Comment as** dropdown above a project's comment box, comes here that
  way. A platform Promo does not offer is ignored.
- **The old addresses** `/admin/accounts` and `/admin/reddit-accounts`, which
  bell notices stored before 12 Nov 2026 use, open this section with the same
  `?platform=` and `?open=`; the second always filters to Reddit.
- **The Projects block** on the dashboard's left page narrows the list to one
  project's accounts.
- **Windows that stay:** Add account, from New account; Help-only posts, from
  the account's ⋮; and Retire, which asks why. One window at a time.
- **Each action speaks its account's network.** Add account asks for the
  network first, Check now takes Reddit's reading or Instagram's and TikTok's
  ([Instagram and TikTok accounts](../instagram/accounts-and-the-daily-reading.md)),
  and Help-only posts shows on Reddit rows only.

Tyler's words, 12 Oct 2026: "build a dashboard for reddit profiles with status
(like warming up, ready etc...) show what profile and proxy as currantly
attached to the account".

Built so far: several accounts, the list, and the status (parts 1, 2 and 5 of
`workspace/tasks/Reddit/reddit-accounts-dashboard.md`). Warnings on the row,
swapping the profile or proxy, Reddit's own totals, how each account's comments
did, and a page for each account are not built yet.

## Several accounts

**Add account** asks for the network (Reddit, Instagram or TikTok, starting
on the one the Platform filter shows), where the account runs, and which voice
it drafts with. "Runs on" is one list of browser profiles and phones from the
[Anti Detect dashboard's Phones](../phones/racks-dashboard.md); for Instagram and TikTok it
lists phones only, since they never run on a browser profile. One account of a
network per profile and per phone, so one already holding one, and the reader
browser from Settings → Behaviour, are not offered. A phone may hold a Reddit,
an Instagram and a TikTok account at once. The account is then signed in
there, and starts in no project.

An Instagram or TikTok account's right panel also has its **Profile**: the
name, bio, link and picture the phone types into the app
([an account's profile](../instagram/profile.md)).

An account runs on a profile or a phone, never both. An account on a phone has
its jobs run on the phone ([Jobs on phones](../phones/phone-jobs.md)).

Every account is important or a throwaway, and starts as a throwaway
([important and throwaway accounts](../accounts/important-and-throwaway.md)).
A phone that is not ready for an account is listed with why, such as "needs
wiping", and picking it is refused with what to do
([making each phone look like one person's](../phones/looking-like-a-real-person.md)).

Settings → Reddit account still edits one account: the oldest one in use.
Which account a comment goes out from is picked per comment on the
[Projects dashboard](../projects-dashboard.md).

## The status

Tyler's answers, 12 Oct 2026, replacing the 30-day warm-up and the Aged status
of 11 Oct:

- **Warming up** lasts as long as the warm-up setting in Settings → Behaviour,
  3 days, counted from the day Reddit made the account.
- **Working:** past the warm-up, and Promo sent a comment from it in the last 7
  days.
- **Ready:** past the warm-up, with no Promo comment in the last 7 days.
- **Banned:** Reddit marks the account suspended, or a ban screen or page
  stopped it. Since 3 Nov 2026 a suspended reading stops the account: its
  jobs are refused, the ban is recorded and the bell rings once
  ([Bans](../bans.md), part 8). Before that date it was only shown.
- **At risk** (added 3 Nov 2026): shadowbanned, its reach read hidden, a
  locked or "confirm it's you" screen in the last 7 days, or an account on
  its phone, proxy or SIM banned in the last 2 days. The line under it names
  the sign.

And from 11 Oct, still standing: the app works the status out, and a person can
set it by hand.

- **The app works it out every time the list is read** (`accountStatus` in
  `src/lib/social/account-status.ts`). The warm-up uses the same
  `warmUpEndsAt` that Post uses, so the dashboard and Post never disagree about
  whether an account is warming up.
- **Age never read** shows "Not read yet" in place of a status, since nobody can
  tell.
- **A profile that only fails to load for a stranger is not Banned.** It shows
  as an amber line under the status, in the words the health card uses, and the
  app never calls a shadowban certain.
- **Set by hand** shows under the badge until "Let the app decide" clears it.
  The hand-set status is a label and nothing more. Post and the warm-up still go
  by the account's age, so setting a warming account to Ready does not let it
  comment early.
- **Separate from profile labels.** The warm-up moves a profile's label from
  Warming to Ready; the account's status never reads or writes that label.

## The list

The middle header has **In use** and **Retired** as tabs (a dropdown when the
middle is narrow), then search, Select, Filter and **New account**. Columns:
the account (u/name, or "Not signed in") with its platform and "Paused", its
status, its project or "No project", where it runs ("Phone:" and the phone's
name, or "Nowhere" in red), and its last comment or post. Columns drop out as
the middle narrows, the last first.

- **No counts strip.** The cards of counts per app that sat above the list
  (Bans task, part 17) went on 12 Nov 2026, so the middle keeps one header.
  The same counts are Filter's Status and Platform choices and Overview's
  Accounts by status widget.
- **Filter** by platform, status (Warming up, Ready, Working, At risk,
  Banned), important or throwaway, the profile's or phone's tag, and on
  Retired why it was retired. **Rows group** under their profile's or phone's
  folder, with "No folder" last; with no folders anywhere there are no
  headings. Nothing new is stored for either.
- **Select, tick many, then act** from the "N selected" menu. Each is one
  request.
  - Check now: the same health reading as Settings → Reddit account, for each
    one. One already being checked, or retired, is skipped.
  - Set status, or Let the app decide.
  - Pause, and Resume.
  - Retire, which asks why in its window. On Retired, Bring back.
- **A row's right-click menu** has Mass select, Check now, Pause or Resume,
  and Retire, or Bring back on a retired one.

## The account on the right

Pressing a row opens the account on the right with `?open=<id>`, which is
where a phone's Accounts card, a phone's History tab and the Anti Detect dashboard's Bans
lead. A link to a retired account opens the Retired tab on it. It replaced the
settings window on 12 Nov 2026.

- **The header** has its name and platform, its project (or when and why it
  was retired), Medium's sign-in key on a Medium account, and the ⋮.
- **The ⋮'s General tab** has Project, Voice, Runs on and Status as rows that
  save on a pick, then Check now, Send X's sign-in code (an X account in a
  browser with its secret saved), Help-only posts (Reddit), Pause or Resume,
  and Retire in red, or Bring back. Runs on moves the account to another
  profile or phone, where sign-ins do not move with it; an important account,
  and an Instagram or TikTok one, is offered phones only, and the test phone of
  the daily self-test never.
- **The body** has its status with every line it adds (set by hand, paused
  and why, half pace, important, moving to a phone, stopped by a ban,
  shadowbanned or not, X's reach and Paid, LinkedIn's comments look, Premium
  and the emailed code, and the status's own warning), then Last read: its
  age or joined date, karma or followers, last comment or post, where it runs
  and how that goes online.
- **Then the cards the window held:** a ban's card with its words, picture,
  appeal, **Let it run again** and **Clean up** ([Bans](../bans.md)); an app's
  Profile; X's and LinkedIn's own; important or throwaway, with **Mark
  important** for a throwaway on a phone and **Move to a phone**, **Check
  sign-in** and **Cancel move** for one on a browser profile
  ([Reddit on phones](reddit-on-phones.md)); the two-factor code; and **Where
  it came from**: made or bought, the seller and the price, saved as they
  change. Its **History** is last: added, moved, banned, appealed, let run
  again, retired and cleaned up, newest first.
- **The footer** has its status and Check now, or Bring back.
- **Half pace** shows in amber under the status while the account goes at
  half its limits: shadowbanned, for 7 days after Let it run again, or for 2
  days after a ban on its phone, proxy or SIM.

The section is `src/components/social/projects-dashboard/accounts-section.tsx`
and the account `src/components/social/accounts/account-record.tsx`.

## Pausing

A paused account stays in the list and every picker, and does not post, warm
up or take a health reading until it is resumed. Its Status column says
**Paused**, or **Project paused** when its whole project is paused, which is
resumed from the project's own dashboard instead. Post says why it is off.
A comment pressed before the pause waits and can still be cancelled. Unlike
retiring, a pause is meant to end. A retired account cannot be paused.

## Help-only posts

Help-only posts, in a Reddit account's ⋮, opens that account's help-only posts: the newest
posts in the subreddits it has joined, to answer with help and never a word
about what you make. Tyler, 12 Oct 2026: it lives here, on the Reddit accounts
dashboard. The window shows the subreddits the account has joined with **Read
new posts**, then the posts to help with. Pressing a post opens it in the
comment box, and **Done** shuts the window. [Behaving like a
person](../accounts/behaving-like-a-person.md) has why and how.

## Retiring

A retired account leaves the list, the Projects dashboard, every picker and
Settings → Reddit account. It never posts and never warms up, and the daily
health reading skips it. Its comments stay, on the Comments dashboard and
counted against it. A comment already waiting when it was retired is refused
when its time comes. **Show retired** brings retired accounts back into the
list, with "Retired", when, and why under the name, and **Bring back** undoes it.

Retire asks why in its window (Bans task, part 15): Banned, Sold, Given up,
or Other with a short note. Clean up after a ban fills in Banned. Accounts
retired before 3 Nov 2026 read "Not recorded". With Show retired on, a filter
splits them by reason. Bringing one back clears the reason.

## What holds it up

`promo_accounts.status_override` holds a hand-set status and
`promo_accounts.retired_at` the retirement, both added by
`drizzle/0108_promo_projects.sql`. `promo_accounts.paused_at` is the pause,
added by `drizzle/0110_promo_new_features.sql`, with its rules in
`src/server/social/pause.ts`. The page is
`src/components/social/accounts/accounts-dashboard.tsx`, the endpoints
`src/lib/api/social/reddit-accounts.ts`, and the server
`src/server/social/account-list.ts`.
