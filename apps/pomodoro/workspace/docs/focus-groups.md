# Private focus groups

A group is an invite-only board among people you know. Groups have their own
dashboard at `/groups`, in the left menu after Leaderboard (Tyler, 12 Oct
2026), and a board runs on the same figures as the global ranking.

The global board is global, top 100, and useless to almost everybody on it.
Somebody who joins and lands at 340th never looks again. Four people who know
each other is where competing actually works.

## The two opt-ins are separate

Being in a group and being on the global board are two different switches, and
neither turns the other on. Tyler's call on 29 Sep 2026: a person should be able
to compete with four friends without being listed publicly.

- **The global board** needs "Show me on the leaderboard" in Settings **and** a
  public display name.
- **A group board** needs a public display name and membership of that group.
  Nothing else.
- A name inside a private group cannot reach the global board, because the
  global query still tests the opt-in column and nothing about a group touches
  it.
- Somebody with no display name can still be in a group. They are in it and not
  on its board, and the Who is in it panel says so rather than showing a blank
  row.

## What a group is

- **A name, an owner and an invite link.** The link's secret is 43 url-safe
  characters, the same strength the streak badge's address uses, because the
  link is the only thing keeping strangers out.
- **The owner is put in the group when it is made**, in one transaction, so a
  group can never exist with nobody in it.
- **Five groups per person**, their own included. Tyler's call on 29 Sep 2026.
  The cap is what keeps a group board worth looking at. On the Leaderboard
  each group is a tab; the row scrolls sideways when they do not fit, and a
  long name is cut with "…" at 160px, whole on its tooltip.
- **Fifty people per group.** Well past the point where everybody knows each
  other, and it bounds what one board reads.
- **No ranking is stored.** A group board is the leaderboard query filtered to
  that group's members, so a figure on a group board and the same figure on the
  global one can never disagree.

## The Groups dashboard

Tyler's layout of 12 Oct 2026, drawn in `groups-page.tsx`.

- **Your groups, on the left:** one row per group with its member count, the
  one in view marked, and Create a group and Join with a link under them. At
  the cap of five, a line says so instead of the two buttons.
- **The group in view, on the right:** one card holding its name, how many
  people, the This week, This month and All time tabs at the top right, and
  the board under them (Tyler's mark-up,
  `assets/pasted-image-1791818740774117000.png`). Then Who is in it, the
  invite link and the public page as panels on the page, never in a pop-up
  window.
- **Delete group and Leave group sit at the foot of Who is in it**, because
  that panel is about who belongs. The owner sees Delete group, everybody
  else Leave group. Tyler moved them out of the card's top row on 12 Oct
  2026 to make room for the tabs.
- **The address holds the choice:** `/groups?group=<id>&window=all`, so a
  reload or a link lands on the same group and window. No group in the
  address means the first one.
- **Somebody in no group** sees one panel inviting them to make a group or
  join one, and nothing else.
- **The Leaderboard** no longer shows groups. It keeps one line under the
  global ranking pointing at Groups.

## Where a group is made

- **On Groups**, with Create a group under the list, or in the middle of the
  page for somebody in no group.
- **From the account menu** (your photo, top right): Create a group opens
  Groups with the same window already open, at `/groups?create=group`. Tyler
  asked for the row on 12 Oct 2026. Closing the window takes `create` back
  out of the address, so a reload does not open it again.

## Who may do what

| | Owner | Member |
| --- | --- | --- |
| Copy the invite link | yes | yes |
| Replace the link | yes | no |
| Remove somebody | yes | no |
| Leave | no | yes |
| Delete the group | yes | no |

**Removing somebody asks first.** The bin beside a member opens "Remove Sam
from Study Buddies?", which says they come off the board straight away and can
rejoin with the invite link. The red button says "Remove Sam" and shows it is
working while the removal runs. Cancel or Escape leaves them in. Deleting the
group always asked; removing a person, the more personal of the two, used to
happen on the first press.

The owner cannot leave. A group with no owner has nobody who can kill a leaked
link, so the owner deletes the group instead, which is a different button with a
different question attached.

Replacing the link is how a leaked one is killed: the old address stops pointing
at anything the moment the new one is written.

## The invite link

`/groups/join/<secret>` asks you to sign in first and nothing else. Joining needs
an account, and a page that named the group to anybody holding the address would
be a second, weaker door. Once signed in it names the group, says how many people
are in it, and joins on one button. Joining says "You are in the group.", the
same words as the Join window on Groups, and lands on Groups with that group
open (`/groups?group=<id>`), not on whichever group comes first.

Following the same link twice leaves you in the group once, not twice on the
board.

## The bell

The owner hears in the bell when somebody joins through the invite link, and a
second join while that notice is unread folds into it: "Sam and 1 other joined
your group Study Buddies." A member the owner removes is told they were removed
from the group, and never by whom. Leaving on your own, and the owner joining
their own group, tell nobody. See [Notifications](notifications.md).

## When an admin deletes a group

An admin can delete any group from `/admin/pomodoro-groups` (admin task 06,
8 Oct 2026). Everybody who was in it, the owner included, gets "The Pomoder
team deleted the group Study Buddies." in the bell, and the notice leads to
Groups. It never names the admin. The group, its members and its invite
link go at once, so the old link stops working. Nobody's focus time or place on
the global board changes, because a group board is only a filter over the same
figures. The admin side is in [Members in the admin](admin-members.md).

## What never leaves the server

- **No user ids, on any board.** Your own row is marked on the server and the id
  is dropped, the same rule the room snapshots follow.
- **A person is removed by their membership row's id**, never by a user id,
  because there is no user id in the browser to send back.
- **"Not your group" and "no such group" are one answer.** An owner check that
  said which was which would tell a stranger the group exists.

## When a load fails

The list of your groups and the board of the group in view each say so inside
its own panel, with Try again, which runs that one load again. A failed list is
never drawn as an empty one, because "you are in no groups" invites somebody
to make a group they already have. Neither asks you to reload the page.

## Where the code is

- `src/server/pomodoro/leaderboard.ts` — the one ranking query, global and
  group, and the filter that is the difference between them.
- `src/server/pomodoro/groups.ts` — create, invite, join, leave, remove, delete
  and the board, each proving the caller's standing first.
- `src/lib/api/pomodoro/groups.ts` — the endpoints, every one signed-in only.
- `src/lib/pomodoro/groups.ts` — the caps and the words each refusal shows.
- `src/routes/_pomodoro/groups.tsx` and
  `src/components/pomodoro/groups-page.tsx` — the Groups dashboard, its
  panels and the Create and Join windows.
- `drizzle/0100_pomodoro_groups.sql` — `pomodoro_groups` and
  `pomodoro_group_members`.

## A group's public page

An owner on Pro can give the group a public page at `/team/<handle>` from the
Public page panel on Groups. Being in a group still publishes nothing by itself: the page
shows each member only as their own public profile already shows them. The
rules are in [Team pages](team-pages.md).
