# Private focus groups

A group is an invite-only board among people you know. It sits under the global
ranking on `/leaderboard` and runs on the same figures, over whatever window the
page has selected.

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
  on its board, and the group's window says so rather than showing a blank row.

## What a group is

- **A name, an owner and an invite link.** The link's secret is 43 url-safe
  characters, the same strength the streak badge's address uses, because the
  link is the only thing keeping strangers out.
- **The owner is put in the group when it is made**, in one transaction, so a
  group can never exist with nobody in it.
- **Five groups per person**, their own included. Tyler's call on 29 Sep 2026.
  The cap is what keeps a group board worth looking at.
- **Fifty people per group.** Well past the point where everybody knows each
  other, and it bounds what one board reads.
- **No ranking is stored.** A group board is the leaderboard query filtered to
  that group's members, so a figure on a group board and the same figure on the
  global one can never disagree.

## Who may do what

| | Owner | Member |
| --- | --- | --- |
| Copy the invite link | yes | yes |
| Replace the link | yes | no |
| Remove somebody | yes | no |
| Leave | no | yes |
| Delete the group | yes | no |

The owner cannot leave. A group with no owner has nobody who can kill a leaked
link, so the owner deletes the group instead, which is a different button with a
different question attached.

Replacing the link is how a leaked one is killed: the old address stops pointing
at anything the moment the new one is written.

## The invite link

`/groups/join/<secret>` asks you to sign in first and nothing else. Joining needs
an account, and a page that named the group to anybody holding the address would
be a second, weaker door. Once signed in it names the group, says how many people
are in it, and joins on one button.

Following the same link twice leaves you in the group once, not twice on the
board.

## The bell

The owner hears in the bell when somebody joins through the invite link, and a
second join while that notice is unread folds into it: "Sam and 1 other joined
your group Study Buddies." A member the owner removes is told they were removed
from the group, and never by whom. Leaving on your own, and the owner joining
their own group, tell nobody. See [Notifications](notifications.md).

## What never leaves the server

- **No user ids, on any board.** Your own row is marked on the server and the id
  is dropped, the same rule the room snapshots follow.
- **A person is removed by their membership row's id**, never by a user id,
  because there is no user id in the browser to send back.
- **"Not your group" and "no such group" are one answer.** An owner check that
  said which was which would tell a stranger the group exists.

## Where the code is

- `src/server/pomodoro/leaderboard.ts` — the one ranking query, global and
  group, and the filter that is the difference between them.
- `src/server/pomodoro/groups.ts` — create, invite, join, leave, remove, delete
  and the board, each proving the caller's standing first.
- `src/lib/api/pomodoro/groups.ts` — the endpoints, every one signed-in only.
- `src/lib/pomodoro/groups.ts` — the caps and the words each refusal shows.
- `src/components/pomodoro/focus-groups-card.tsx` — the card, the group tabs and
  the three windows.
- `drizzle/0100_pomodoro_groups.sql` — `pomodoro_groups` and
  `pomodoro_group_members`.

Somebody in no group sees an invitation to make one and nothing else, so the
page is exactly as it was for everybody who does not want this.
