# Team pages

A team page is a focus group's public page, at `/team/<handle>`. A design
studio points `pomoder.com/team/northfold` at its eleven people and their
combined hours this week, this month and all time.

## Tyler's three calls, 12 Oct 2026

- **A team is a focus group with its page switched on.** It is not a new kind
  of thing. The group keeps its one owner, its invite link and its cap of
  fifty people.
- **Only an owner on Pro can switch the page on.** Nobody is billed for a
  team, and there are no seats. The perk is `teamPage` in
  [Pro perks](pro-perks.md), so a plan can switch it off or gift it.
- **The page shows only what a member already publishes.** No exception, the
  owner included. This is the line that keeps a team page from being a way
  for a manager to watch staff.

## What a member looks like on the page

Each member's own public profile switches decide, and nothing the owner does
changes them.

| The member has | On the team page |
| --- | --- |
| A public page with "Hours and streaks" on | Ranked by name, with hours and sessions |
| A public page with "Hours and streaks" off | Named under "Also in the team", "Keeps their hours private" |
| No public page | Counted in "N more members have no public page", never named |

- **Naming somebody with no public page would publish a name they never
  chose to publish**, so they are counted, not named. The task file asked for
  a member who publishes nothing to appear by name. That held where "nothing"
  means no figures, and gave way where it means no page at all.
- **The combined hours are the sum of the ranked rows**, so they never
  include anybody whose hours are private.
- **An admin's leaderboard hide** (admin task 06) takes a member's hours off
  the team page too. They then show under "Also in the team".
- **The owner sees exactly the page a stranger sees**, plus an Edit page
  button (it opens the group on Groups) and the "You" mark on their own row. `teams.test.ts` checks the two
  answers are equal.
- **A reader who blocked a member, or was blocked by one, does not see that
  member**, the same as on every board.
- **Days are counted in UTC.** The page is one copy for every reader, so it
  cannot use each reader's own timezone the way the leaderboard does. The
  page says so under the ranking.

## Switching it on

The owner picks the group on the Groups dashboard (`/groups`). Its Public
page panel has two controls, and each saves itself.

- **Page address.** The profile handle's rules: 3 to 30 lowercase letters,
  digits, hyphens and underscores, and none of the words the app keeps for
  itself. It saves when the box is left or Enter is pressed. A team address
  and a person's handle are separate, so `/team/sam` and `/u/sam` can both
  exist.
- **Show this group on a public page.** Saves the moment it moves. Switching
  it on with no address, or a bad one, says why and stays off.
- **A free owner** sees the Pro sentence and a See plans button instead of
  the two controls. They can still switch an old page off.
- **An owner whose Pro lapses** keeps the address and the switch, and the
  page answers 404 until they are on Pro again. The card says so.
- **Every member** sees a Public page panel on Groups with the address and the
  rule above, so nobody is in a public team without knowing it.
- **The invite page** says the group has a public page before anybody presses
  Join.

## When the page answers 404

A handle that is not handle-shaped, one no group holds, a page switched off,
and an owner no longer on Pro all answer the same 404. A deleted group's page
goes with it.

## How fresh it is

- **The page is held for 30 seconds** and is the same copy for everybody.
- **Joining, leaving, being removed, deleting the group, changing the page's
  settings, and any member saving their own public page** clear every held
  team page, so those show on the next load. Switching your hours off takes
  you off every team page at once.
- **A page being built at the moment of a change is never held.** It read the
  members before the change, so it goes to the one reader who asked and the
  next reader gets a fresh build.
- **An admin hiding a profile or taking somebody off the boards** shows
  within the 30 seconds rather than at once.

## What it costs

A fresh build is 10 database queries, however many people are in the group:
the group, five for the owner's plan, the roster, and one ranking per window.
A held page costs none, and a signed-in reader adds one for their blocks.
`teams.test.ts` measures this with eleven members.

## Not built

Billing a team, seats, more than one owner, a cap above fifty, a domain, a
Report button on the team page, streaks per member, and anything that lets an
owner see more than a stranger. The task file's answers above rule the first
four out; the rest were not asked for.

## Where the code is

- `src/server/pomodoro/teams.ts` — the page, its 30-second hold, and the
  owner's settings.
- `src/server/pomodoro/leaderboard.ts` — `teamPageRule`, the team filter on
  the one ranking query.
- `src/lib/api/pomodoro/teams.ts` — the open read and the owner's two
  endpoints. The open read is listed in `src/app/open-endpoints.ts`.
- `src/routes/_pomodoro/team.$handle.tsx` and
  `src/components/pomodoro/team-page.tsx` — the page.
- `src/components/pomodoro/team-page-settings.tsx` — the owner's panel and the
  members' notice on the Groups dashboard.
- `drizzle/0155_pomodoro_team_pages.sql` — `handle` and `page_public` on
  `pomodoro_groups`.
