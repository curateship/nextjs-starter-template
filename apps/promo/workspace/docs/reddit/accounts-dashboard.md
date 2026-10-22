# The Accounts dashboard

Every account on every platform in one list, with its status, the project it
comments for, the browser profile or phone it runs on, and how that goes
online. It is at `/admin/accounts`, under **Projects** in the left menu, right
after Voices.

Tyler, 15 Oct 2026: "I think accounts should be on its own dashboard with
platform filtering". It had been a window inside each project for a day, after
the Reddit accounts page left the left menu on 14 Oct 2026
([Networks as modules](../network-modules.md)).

- **Platform** is a filter in the toolbar, "All platforms" or one network, and
  each row names its platform after the account ("u/name · Reddit",
  "@name · Instagram"). Reddit, Instagram, TikTok and Medium accounts are
  listed.
- **A Medium account's row** says how long it has been on Medium and its
  followers, and has a key button that opens Medium's emailed sign-in link in
  its own browser ([Medium accounts and signing in](../medium/signing-in-and-accounts.md)).
  Add account offers each network the browser profiles with none of that
  network's accounts in them yet.
- **The filter lives in the address** as `?platform=reddit`, so a reload, a
  link or the left menu's own link always shows what the address says.
  **Manage accounts**, the last item in the **Comment as** dropdown above a
  project's comment box, comes here that way. A platform Promo does not offer
  is ignored and the filter shows All platforms.
- **The old address** `/admin/reddit-accounts`, which the bell's suspended
  account notice used, sends here filtered to Reddit. New suspended notices
  open `/admin/accounts?platform=reddit` straight away.
- **An account's own windows** (its settings, Add account, help-only posts)
  open over this page, one window at a time.
- **The left menu link** is added by `drizzle/0119_promo_accounts_menu.sql`
  to every saved left menu with a Projects entry: after Voices, or last under
  Projects where Voices is not there.
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
[Phones dashboard](../phones/phones-dashboard.md); for Instagram and TikTok it
lists phones only, since they never run on a browser profile. One account of a
network per profile and per phone, so one already holding one, and the reader
browser from Settings → Behaviour, are not offered. A phone may hold a Reddit,
an Instagram and a TikTok account at once. The account is then signed in
there, and starts in no project.

An Instagram or TikTok account's settings window also has its **Profile**: the
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
- **Banned:** Reddit marks the account suspended. It is only shown, in red.
  Nothing is paused and no notice is sent.

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

Columns: the account (u/name, or "Not signed in"), its status, its project or
"No project", where it runs (a browser profile linking to the Browser profiles
dashboard, or "Phone:" and the phone's name linking to the Phones dashboard,
"Nowhere" in red when neither is set), the profile's proxy with its last test
or the phone's SIM carrier or Wi-Fi, its voice with a menu to swap it, its age, its karma and its
last comment. On an Instagram or TikTok row the age is its post count, Karma
or followers is its followers (following behind it), and the status carries
"Not shadowbanned" or "Shadowbanned" in red once the daily reading has read
the app's Account status page. Under 1536px wide the age, karma and last comment fold into a line
under the name, because the row was otherwise wider than a 1440px window and
its buttons went off the edge.

- **Filter** by status (All, Warming up, Ready, Working, Banned), by
  important or throwaway, and by the profile's or phone's tags. **Rows group** under their profile's or phone's
  folder, the folders both dashboards share, with "No folder" last; with no folders anywhere there are
  no headings. Nothing new is stored for either.
- **Tick many, then act.** Each is one request, and the message says how many
  changed, such as "3 accounts set to Ready."
  - Set status, or Let the app decide.
  - Check now: queues the same health reading as Settings → Reddit account, for
    each one. One already being checked, or retired, is skipped and counted.
  - Pause, and Resume.
  - Retire.
- **Each row** has Check now, Help-only posts, Pause or Resume, the settings
  button, and Retire. The settings button moves the account to another profile
  or phone, where sign-ins do not move with it, and saves its authenticator
  secret so its two-factor code shows there and beside its phone's screen
  ([the screen window](../phones/screen-window.md)). The test phone of the
  daily self-test is never on its list.
- **Important** shows under an important account's status, and **Moving to**
  a phone's name while a move from its browser profile is waiting on the phone.
- **The settings window** says whether the account is important or a
  throwaway. A throwaway on a phone has **Mark important**, after a
  confirmation and for good. A throwaway on a browser profile has **Move to a
  phone**, then **Check sign-in** and **Cancel move** while it waits
  ([Reddit on phones](reddit-on-phones.md)). An important account is offered
  phones only under Runs on.
- **Stopped by a ban screen** shows under an account's status when a phone
  found Reddit's suspended, locked or "confirm it's you" screen, with the
  screen's words on hover. Its jobs are refused until **Let it run again** in
  its settings window ([freezes and ban screens](../phones/freezes-and-ban-screens.md)).
- **The voice menu is 128px wide**, 32px narrower than it was, so a row with
  four buttons still fits a 1440px window (measured 13 Oct 2026: 1232px of
  columns against 1232px of room).

## Pausing

A paused account stays in the list and every picker, and does not post, warm
up or take a health reading until it is resumed. Its Status column says
**Paused**, or **Project paused** when its whole project is paused, which is
resumed from the project's own dashboard instead. Post says why it is off.
A comment pressed before the pause waits and can still be cancelled. Unlike
retiring, a pause is meant to end. A retired account cannot be paused.

## Help-only posts

The hand button on a row opens that account's help-only posts: the newest
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
list, with "Retired" and when under the name, and **Bring back** undoes it.

## What holds it up

`promo_accounts.status_override` holds a hand-set status and
`promo_accounts.retired_at` the retirement, both added by
`drizzle/0108_promo_projects.sql`. `promo_accounts.paused_at` is the pause,
added by `drizzle/0110_promo_new_features.sql`, with its rules in
`src/server/social/pause.ts`. The page is
`src/components/social/accounts/accounts-dashboard.tsx`, the endpoints
`src/lib/api/social/reddit-accounts.ts`, and the server
`src/server/social/account-list.ts`.
