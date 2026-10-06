# Notifications: the bell and the tray

When you are signed in, the product header has a bell just left of your photo.
A red number on it counts notices that arrived since you last opened it.
Clicking it opens the tray: your notices grouped under Today, Yesterday and
Earlier, with Unread, All and Social tabs. Visitors who are not signed in see
no bell.

## What it is

The bell and the tray are the shell's own `NotificationCenter`. This app puts it
in its header and tells it what Pomodoro's notices are. It does not edit it. The
starting number comes with the shell's page data (`unseenNotifications`), so
the bell needs no request of its own on the way in. After that, the live
connection updates it. A cheer sent from another tab reached an open bell in
341ms when measured.

- **Opening the bell clears the red number and leaves every notice unread.**
  That is the shell's rule, from 22 Sep 2026. A notice turns read when it is
  clicked, or when Mark all read is pressed.
- **The tray loads older notices as you scroll.** It starts with 20 and
  fetches the next 20 at the bottom. With 43 notices, scrolling to the end
  showed all 43, so there is no separate notices page.
- **Admins also get Settings and History** at the foot of the tray. Both are
  admin screens, so a member sees only Mark all read.

## How a Pomodoro notice is told apart

Every notice this app writes is the shell's `app_activity` type, because a
CHECK constraint on `notifications` refuses any other name. So the shell's row
cannot say what kind of notice it is. `pomodoro_notice_links` can, with one row
per notice, written in the same transaction:

- `kind` is what the notice is. The table below lists them.
- `room_id` is the room a room notice is about, and `group_id` the group a
  group notice is about. Both are cleared if the room or group is deleted.
- `fold_count` is how many events one unread notice stands for.
- `href` is the fixed page of this app the notice leads to, such as History.
  It is empty for a notice that leads to a person's page.

The bell draws a row in two steps:

1. **On the first paint, from the notice's own words.** `noticeKindFromWords`
   in `src/lib/pomodoro/notices.ts` recognises sentences this app wrote, so the
   tile and the tab are right before any server answers. A row that changed
   shape a moment later would read as a flash.
2. **Then the link, from the server.** `pomodoroNoticeDetailsFor` in
   `src/server/pomodoro/notices.ts` reads the saved kind and works out where
   the notice leads. It answers only about the reader's own notices.

**A link to a person's page is worked out when the tray is read, never
stored.** A cheer or a streak notice leads to that person's public page, but the
page can be switched off, hidden by an operator, renamed or blocked after the
notice arrived. Such a notice whose page would not open for this reader keeps
its words and opens nothing, the same rule the account menu uses for Your
profile. Every other notice leads to a fixed page of this app, and that is
saved with it.

## The kinds there are

| Kind | Who gets it | Tab | Clicking it opens |
| --- | --- | --- | --- |
| room_join | the room's host, while away | Rooms | the room |
| room_chat | each member, while away | Rooms | the room |
| room_mention | the member named with @ | Rooms | the room |
| room_reaction | the line's author, while away | Rooms | the room |
| room_invite | invitees with an account | Rooms | the room |
| room_open | the host and invitees with an account | Rooms | the room |
| room_removed | the person removed or banned | Rooms | nothing |
| followed_room | people who follow the host | Rooms | the room |
| cheer | the person cheered | Social | the sender's public page, while it opens |
| group_join | a group's owner | Social | `/leaderboard`, where the group boards are |
| group_removed | the person removed | Social | nothing |
| followed_streak | people who follow the streaker | Social | the streaker's public page, while it opens |
| badge | the person who earned it | Account | `/history`, where the badges panel is |
| media_ready | the owner of the file | Account | `/backgrounds` or `/sounds` |
| media_failed | the owner of the file | Account | `/backgrounds` or `/sounds` |
| credits_low | the person running low | Account | `/backgrounds` or `/sounds` |

Rooms is what happens in and around focus rooms. Social is other people outside
a room. Account is your own badges, files and credits. The tray shows them as
Unread, All, Rooms, Social and Account, which fits one row. The tiles use the
theme's colours: primary for good news, destructive for a file that will not
arrive, muted for news that is neither. A room notice leads to the room's own
address, which answers for every state the room can be in, closed included.

## Away, and why it matters

**Joins, chat and reactions are only sent to somebody who is away from the
room.** Somebody with the room on screen sees them happen, and a notice about
it afterwards is noise.

- **Away is decided by the room's live connection.** While the Rooms page is
  open on your room, its connection sets `room_memberships.watching_until`
  forty seconds ahead, and renews it every fifteen seconds. Closing the page,
  or leaving it, clears it. In the future means watching; null or past means
  away.
- **A tab that is not showing is away.** The Rooms page holds its live
  connection only while its tab is the visible one, so a room left open
  behind other tabs does not keep the bell quiet. Coming back reconnects, and
  the first message is a full snapshot, so the room on screen is never stale.
  This was a real case on 6 Oct 2026: Tyler's room was open in another browser
  pane, so the chat he was testing never reached his bell.
- **A mention always arrives**, watching or not, because it is addressed to
  you.

How each kind behaves:

- **Joins fold per room** into "Sam and 2 others joined your room Deep Work."
  while the host's notice is unread. Somebody already in the room pressing
  Join again is not a join.
- **Chat folds per room.** One line names who wrote it, with the words
  underneath; more become "3 new messages in Deep Work." with the latest line
  and its writer underneath.
- **Mentions are matched against the room's members' handles**, so text that
  only looks like `@someone` names nobody. A mentioned member gets the mention
  and not the folded chat notice for the same line. When the host deletes a
  line, its mention and reaction notices are deleted too.
- **Reactions are counted in people, per line**, recounted on every press, so
  pressing two emoji is still one person. Taking the last reaction back takes
  the notice away. A taken-back reaction only corrects a waiting notice; it
  never writes one or moves one to the top. Reacting to your own line tells
  nobody.
- **A booked room's invitees with an account hear in the bell as well as by
  email.** Only a verified address matches an account, and the host is never
  told which addresses did. The time is in the reader's own timezone.
  Cancelling the booking takes unread invitations away. When the room opens,
  the host and the invitees get "Deep Work is open now." and the unread
  invitation is replaced by it.
- **Removed or banned says so once**, naming the room and never the host. A
  second ban of the same person says nothing.
- **Somebody you follow opening a public room tells you**, never an unlisted
  one. At most three a day per follower, and at most three of a host's rooms a
  day are announced at all. The host's limit is counted from the rooms table,
  because closing a room deletes its unread notices, and without it opening
  and closing a room over and over would ping every follower each time. When
  the room closes, unread "opened", "open now" and invitation notices about it
  are deleted.

The kinds outside rooms:

- **Group joins fold.** A second join while the owner's notice is unread turns
  "Sam joined your group Study Buddies." into "Sam and 1 other joined your
  group Study Buddies.", moves it back to the top and back into the red number.
  Once that notice is read, the next join starts a new one. The owner joining
  their own group, or a join across a block, tells nobody.
- **A removal names the group and never the owner.** It goes in the same
  transaction as the removal.
- **Streaks go to followers at 7, 30, 100 and 365 days.** The moment is the
  day's first finished focus, because that is the focus that adds the day to
  the streak; the second focus of a 30-day day tells nobody again. Only
  somebody whose public page opens and has "Hours and streaks" switched on is
  announced, nobody across a block hears about it, and nobody gets more than
  five of these in any seven days.
- **Badges are one notice per finished focus.** "You earned the First focus
  badge." for one, "You earned 3 badges." with the names underneath for
  several. A badge is recorded once, so its notice is written once.
- **AI files say ready, or that the credit is back.** The notice is written in
  the same transaction as the credit being counted or refunded, so the bell
  and the ledger always agree. A retry is not an ending and says nothing.
- **Uploads say ready with the file's name, or the reason they failed.** An
  upload the member deleted before it was converted says nothing, because
  they already know.
- **Credits warn at one left and at none left, once each per month and
  kind.** The none-left notice says the day they come back, such as "1
  November", counted in UTC like the credits themselves. The month's row
  remembers both warnings, so a refund that lifts the count back up does not
  send the same warning twice.

## Opening a room clears its notices

When the Rooms page opens on your room, or you join a room, your unread notices
saved with that room turn read and shown. Notices about other rooms, and every
other notice, are left alone. If the marking fails, the failure is logged and
the room opens anyway. This is what clears the join, chat, mention and reaction
notices for a room once you are back in it.

## The rules every notice follows

Every part of this app that writes a notice keeps to these. The cheer in
`src/server/pomodoro/following.ts` is the shortest worked example, and the
group join in `src/server/pomodoro/groups.ts` the one that folds.

- **The type is always `app_activity`.** The database refuses anything else.
- **Every notice is written by `writeNotices`** in
  `src/server/pomodoro/notices.ts`, inside the caller's own transaction. It
  writes the notice, its `pomodoro_notice_links` row and the bell's nudge on
  that transaction, so the nudge waits for the commit and is never sent for a
  notice that rolled back.
- **Read anything else before the transaction, not inside it.** A block check
  or a profile read on the shared database handle, made from inside a
  transaction, waits on a second connection. In the tests, with one
  connection, it never returns.
- **The sentence comes from a function in `src/lib/pomodoro/notices.ts`**, and
  `noticeKindFromWords` recognises it. The writer and the reader then cannot
  drift apart.
- **A blocked pair never notifies, in either direction.** Use
  `isBlockedBetween` from `src/server/pomodoro/blocks.ts`.
- **Nobody is notified about their own action.**
- **A burst of the same thing about the same object folds into one unread
  row**, such as "Sam and 3 others joined", never four rows. The writer updates
  the waiting unread row instead of adding another; `noteGroupJoin` is the
  pattern. A burst that cannot fold, such as streaks from many people, is
  capped instead.
- **The link is an address inside this app.** The shell drops any other kind of
  address anyway.
- **A notice whose kind is switched off in Settings is never written.** Today
  only the cheer has a switch, on Settings → Profile. The card of per-kind
  switches is task 02 part 5 and is not built yet.
