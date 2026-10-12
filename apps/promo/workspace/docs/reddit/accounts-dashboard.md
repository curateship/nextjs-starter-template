# The Reddit accounts dashboard

Every Reddit account in one list, with its status, the project it comments for,
the browser profile it signs in inside and the proxy that profile goes through.
It is at `/admin/reddit-accounts`, under **Projects** in the left menu.

Tyler's words, 12 Oct 2026: "build a dashboard for reddit profiles with status
(like warming up, ready etc...) show what profile and proxy as currantly
attached to the account".

Built so far: several accounts, the list, and the status (parts 1, 2 and 5 of
`workspace/tasks/Reddit/reddit-accounts-dashboard.md`). Warnings on the row,
swapping the profile or proxy, Reddit's own totals, how each account's comments
did, and a page for each account are not built yet.

## Several accounts

**Add account** asks for a browser profile and a voice, the two choices
Settings → Reddit account offers. One Reddit account per profile, so a profile
already holding one, and the reader browser from Settings → Behaviour, are not
offered. The account is then signed in to Reddit inside that profile's browser,
on the Browser profiles dashboard, and starts in no project.

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
"No project", its browser profile (linking to it on the Browser profiles
dashboard, "No profile" in red when it was deleted), the profile's proxy with
its last test, its voice with a menu to swap it, its age, its karma and its
last comment. Under 1536px wide the age, karma and last comment fold into a line
under the name, because the row was otherwise wider than a 1440px window and
its buttons went off the edge.

- **Filter** by status (All, Warming up, Ready, Working, Banned) and by the
  profile's tags. **Rows group** under their profile's folder from the Browser
  profiles dashboard, with "No folder" last; with no folders anywhere there are
  no headings. Nothing new is stored for either.
- **Tick many, then act.** Each is one request, and the message says how many
  changed, such as "3 accounts set to Ready."
  - Set status, or Let the app decide.
  - Check now: queues the same health reading as Settings → Reddit account, for
    each one. One already being checked, or retired, is skipped and counted.
  - Retire.
- **Each row** has Check now and Retire.

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
`drizzle/0108_promo_projects.sql`. The page is
`src/components/social/accounts/accounts-dashboard.tsx`, the endpoints
`src/lib/api/social/reddit-accounts.ts`, and the server
`src/server/social/account-list.ts`.
