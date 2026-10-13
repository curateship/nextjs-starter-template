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

- **A name, a line under it, an owner and an invite link.** The line is
  optional, up to 120 characters, and shows on the group's card, on the
  invite page before Join, and on the team page.
- **The invite link's secret** is 43 url-safe characters, the same strength
  the streak badge's address uses, because the link is the only thing keeping
  strangers out.
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
  global one can never disagree. Tyler, 13 Oct 2026, about past weeks: they
  do not need storing. Two small tables remember only that a weekly notice or
  a milestone was sent, so nothing is said twice.

## One timezone, and weeks from Monday

- **Every group counts days in one timezone.** The owner picks it in the
  group's settings; until then it is the owner's own. Every member's board
  starts its week on the same day, so two members in different countries see
  the same board and the same winner. The board says which timezone under
  its tabs.
- **A group's This week runs from Monday to today**, not the last 7 days the
  global board uses, because the Monday winner, the weekly goal and Past
  weeks all count Monday to Sunday and the board has to agree with them.

## The board

- **Rank by Hours, Sessions or Days**, a switch above the board, kept in the
  address as `rank=sessions` or `rank=days`. Days counts the days in the
  window with at least one finished focus. The global board is always by
  hours and never sees this switch.
- **Focusing now.** A green dot and the word "Focusing" beside anybody on the
  board whose focus timer is running. The board is read again with the
  page, so it shows within a minute of a start.
- **Cheer from the board.** The party icon at the end of every row but your
  own sends one of the five canned cheers, under the same limit as a cheer
  on a public page: 3 a day to one person. Being in the same group stands in
  for following, and the cheer is sent by the person's membership row.
- **Who is in it** shows when each person joined, and links a name to their
  public page only while that page is switched on and not hidden.

## Keeping score

- **The group streak:** days in a row on which at least one person on the
  board finished a focus, alive through today. It is worked out from the
  sessions when it is read.
- **The weekly goal:** combined hours the owner sets, 1 to 1,000. A bar on the
  card reads "26 of 40 hours this week". The first focus that takes the
  group past it sends every member one notice for that week. Somebody with no
  display name is not on the board, so their hours do not count.
- **The Monday winner:** on the first worker pass after Monday starts in the
  group's timezone, every member hears "Sam topped Study Buddies last week
  with 14 hours." Everybody tied for first is named, in alphabetical order
  (Tyler, 13 Oct 2026). A week nobody focused sends nothing. A group made
  after that week ended waits for its first whole week. A member with a block
  either way between them and a winner gets no notice.
- **Past weeks:** the top three of each of the last 8 finished weeks. They are
  worked out from today's members each time, so somebody who leaves drops out
  of old weeks, and somebody who joins shows in weeks before they joined. The
  panel says so. A read is held five minutes, and a join or leave clears it.
  Tyler, 13 Oct 2026: "organize this better. I have no idea what im looking
  at" (`assets/pasted-image-1791913736785452000.png`). So the panel opens
  with one sentence saying what it is, each week with any focus is its own
  block headed "Oct 5 to Oct 11", each place is a row of 1st, 2nd or 3rd, the
  name and the time with the times lined up on the right, and the weeks
  nobody focused are one line at the end: "Nobody focused in the other 5
  weeks."
- **Milestones** at 10, 50, 100, 500 and 1,000 hours together. Each is sent
  once to the members in the group at that moment. Crossing two at once is
  one notice about the larger. A milestone reached stays reached, even if
  somebody with long hours leaves later.

## The Groups dashboard

Tyler's layout of 12 Oct 2026, drawn in `groups-page.tsx`.

- **Invites, at the top:** invites somebody sent you from the bell, each with
  Join and Decline. Nothing is drawn when none are waiting.
- **Your groups, on the left:** one row per group with its member count, the
  one in view marked, and Create a group and Join with a link under them. At
  the cap of five, a line says so instead of the two buttons.
- **The group in view, on the right:** one card holding its name, Edit group
  (owner only) and Invite people, the This week, This
  month and All time tabs at the top right, the line under the name, the
  streak and weekly goal, the Rank by switch and the board (Tyler's mark-up,
  `assets/pasted-image-1791818740774117000.png`). Then Past weeks and, for
  the owner, Activity, as panels on the page. The card does not say how many
  people are in the group (Tyler took "4 people" off on 13 Oct 2026,
  `assets/pasted-image-1791913699677074000.png`); the
  count is beside the group's name in Your groups.
- **Edit group** (Tyler, 13 Oct 2026: the cog "should have a text 'Edit
  group'", and Who is in it and Public page "should be in the cog modal",
  `assets/pasted-image-1791912753026340000.png`) opens one window with four
  sections: the name and line, the board's timezone and weekly goal, Who is
  in it with the owner's tools, and the public page. Delete group is at the
  far left of its footer. The first two save together with Save changes,
  because a rename shows to every member and on the public page the moment it
  lands. Who is in it and the public page act at once, as before. Remove,
  Make owner, Delete and a new page address ask their question in the same
  window, which comes back on Cancel, because no window opens on top of a
  window.
- **Invite people** (`assets/pasted-image-1791912798999022000.png`) opens a
  dropdown holding the invite link card, for every member. The QR code, the
  invite window and New link's question open as their own windows, and the
  dropdown closes as they do.
- **A member** has no Edit group, so Who is in it, with Leave group at its
  foot, and the public page notice stay on the page for them.
- **Leave group sits at the foot of a member's Who is in it, and Delete
  group at the far left of Edit group's footer.** Tyler moved them out of
  the card's top row on 12 Oct 2026 to make room for the tabs.
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
| Copy the invite link, show its QR code | yes | yes |
| Invite people you follow | yes | yes |
| Start a group room | yes | yes |
| Rename, the line, timezone, weekly goal | yes | no |
| Pause the link, ask first, link lifetime | yes | no |
| Replace the link | yes | no |
| Let in or turn down a request | yes | no |
| Remove somebody, keep them out | yes | no |
| Hand the group to a member | yes | no |
| Book a weekly group room | yes | no |
| See the Activity panel | yes | no |
| Leave | no | yes |
| Delete the group | yes | no |

**Handing the group on.** The owner's menu beside a member has Make owner.
It asks first, says the new owner can remove people, replace the link and
delete the group, and, when it applies, that the public page stays up only
while the new owner is on Pro and that a weekly group room the old owner
booked stays theirs. The new owner hears it in the bell. The old owner
becomes an ordinary member and can leave. A hand-over to somebody who left a
moment ago is refused. There is still one owner at a time.

**Keeping somebody out.** The Remove window has a tick box, "Don't let them
back in with the link". Ticked, the link answers them the way a dead link
does, without saying why. The owner sees them under Kept out at the foot of
Who is in it, with Let back in.

**Removing somebody asks first.** Remove from the group, in the menu beside a
member in Edit group, asks "Remove Sam from Study Buddies?", which says they come off the
board straight away and can rejoin with the invite link, unless the keep-out
box is ticked. The red button says "Remove Sam" and shows it is
working while the removal runs. Cancel or Escape leaves them in. Deleting the
group always asked; removing a person, the more personal of the two, used to
happen on the first press.

The owner cannot leave. A group with no owner has nobody who can kill a leaked
link, so the owner hands the group to a member first, or deletes it, which is a
different button with a different question attached.

Replacing the link is how a leaked one is killed: the old address stops pointing
at anything the moment the new one is written. Because every invite already
sent dies with it, "New link" asks first, the same as Delete, Leave and Remove:
"Replace the invite link?" with a red "Replace link". Cancel leaves the old
link working. People already in the group stay in either way.

## Invite people: the invite link card

- **Every member** sees the link, Copy, QR code and Invite people you follow,
  and a line when the link is paused, has run out, or is counting down
  ("Works until Oct 20, 2026", "3 joins left on this link").
- **Let new people join**, the owner's switch, pauses the link without
  changing it. While it is off the invite page says the group isn't taking
  new people, and Join is gone. Switching it back on, the same link works.
- **Ask me before people join**, the owner's switch, turns every join into a
  request. The owner hears it in the bell, folded like joins ("Sam and 1 other
  asked to join Study Buddies."), and sees Waiting to join in Who is in it,
  with Let in and Turn down. A request counts toward neither cap until let
  in; both are checked again then, and a cap that stops it tells the person
  why. Turn down tells them, never by whom. **Switching this off lets everybody
  waiting in, in the order they asked** (Tyler, 13 Oct 2026).
- **The link stops working:** Never, After 7 days or After 10 joins. Each
  counts from when it is picked, and New link starts the same count again. A
  join counts down in its own transaction, so two at once cannot both take
  the last place. A link that has run out reads like a replaced one.
- **QR code** opens the link as a code, black on white whatever the theme,
  because phone cameras read dark on light. It is drawn in the browser.
- **Invite people you follow** lists the people you follow who are not in the
  group, not kept out of it, not holding an invite to it and not across a
  block, without saying which of those hid anybody. Each ticked person gets
  "Sam invited you to the group Study Buddies." in the bell and the invite on
  Groups. Join runs the same rules as the link (the pause, keep-out, asking
  first, both caps), except that an invite does not count down a 10-join
  link. Decline takes it off Groups and out of the bell. 20 invites a day per
  sender.

## The invite page

`/groups/join/<secret>` asks you to sign in first and nothing else. Joining needs
an account, and a page that named the group to anybody holding the address would
be a second, weaker door. Once signed in it names the group, shows its line, says how many people
are in it, and joins on one button.

- **No display name yet:** a box above Join asks for one, saying it shows on
  this group's board and on any board you are on. It saves with every other
  profile setting as it was, so it never switches on the global board.
  Joining without one still works.
- **The owner asks first:** the button reads Ask to join, and afterwards the
  page says the request is waiting for the owner by name.
- **Paused**, **already in it** and **waiting** each say so instead of Join.
- **Report this group** sits at the foot. See Reporting a group below. Joining says "You are in the group.", the
same words as the Join window on Groups, and lands on Groups with that group
open (`/groups?group=<id>`), not on whichever group comes first.

Following the same link twice leaves you in the group once, not twice on the
board.

## The bell

The owner hears in the bell when somebody joins through the invite link, and a
second join while that notice is unread folds into it: "Sam and 1 other joined
your group Study Buddies." A member the owner removes is told they were removed
from the group, and never by whom. Leaving on your own, and the owner joining
their own group, tell nobody. The rest of the group notices (a request and
its answer, an invite, a hand-over, a group room, the Monday winner, the
goal and milestones) are listed in [Notifications](notifications.md).

## The owner's Activity panel

The owner sees the last 50 things that happened: joined, left, removed,
removed and kept out, let back in, renamed, a new link, paused and unpaused,
handed over. Each line keeps the name as it was then. Members never see it.

## Group rooms

A group room belongs to one group and only that group's members can join it,
even somebody else holding its link (Tyler, 13 Oct 2026). It is started from
the Group room card on Rooms or by picking the group under "For a group" in
Host a room, and a weekly one is booked only by the owner. The rules are in
"Group rooms" in [Rooms](rooms.md).

## Reporting a group

The invite page and the team page both have Report. The reasons are a fixed
list about what a stranger can see: the name or line, pretending to be
somebody, spam, something else. Nothing is picked to start with. The report
joins the queue at `/admin/pomodoro-reports` as "Group: <name>", with the
line quoted and Open in Groups, which is where an admin deletes a group.
Every report answers the same way and is limited to 6 an hour per address.
The owner's own report changes nothing.

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
- `src/server/pomodoro/groups.ts` — create, settings, the link's switches,
  join (by link or invite), requests, leave, remove, keep out, hand over,
  delete and the activity, each proving the caller's standing first.
- `src/server/pomodoro/group-scores.ts` — the board, focusing now, the
  streak, the weekly goal, past weeks, milestones and the Monday winner.
- `src/server/pomodoro/group-rooms.ts` — group rooms. `group-reports.ts` —
  reporting a group.
- `src/lib/api/pomodoro/groups.ts` — the endpoints, every one signed-in only.
- `src/lib/pomodoro/groups.ts` — the caps and the words each refusal shows.
- `src/routes/_pomodoro/groups.tsx` and
  `src/components/pomodoro/groups-page.tsx` — the Groups dashboard, the board,
  invites waiting for you and the Create and Join windows. The panels are in
  `group-edit-dialog.tsx` (Edit group), `group-members-card.tsx`,
  `group-invite-people.tsx` (Invite people), `group-score-panels.tsx` and
  `group-window-question.tsx` (a question asked inside an open window).
- `drizzle/0100_pomodoro_groups.sql` — `pomodoro_groups` and
  `pomodoro_group_members`. `drizzle/0157_pomodoro_group_features.sql` —
  everything groups task 01 added.
- Tests: `group-features.test.ts` and `group-rooms.test.ts`.

## A group's public page

An owner on Pro can give the group a public page at `/team/<handle>` from the
Public page panel on Groups. Being in a group still publishes nothing by itself: the page
shows each member only as their own public profile already shows them. The
rules are in [Team pages](team-pages.md).
