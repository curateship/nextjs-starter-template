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

- `kind` is what the notice is. Today that is only `cheer`.
- `room_id` is the room a room notice is about. It is empty for a cheer, and it
  is cleared if the room is deleted.

The bell draws a row in two steps:

1. **On the first paint, from the notice's own words.** `noticeKindFromWords`
   in `src/lib/pomodoro/notices.ts` recognises sentences this app wrote, so the
   tile and the tab are right before any server answers. A row that changed
   shape a moment later would read as a flash.
2. **Then the link, from the server.** `pomodoroNoticeDetailsFor` in
   `src/server/pomodoro/notices.ts` reads the saved kind and works out where
   the notice leads. It answers only about the reader's own notices.

**The link is worked out when the tray is read, never stored.** A cheer leads
to the sender's public page, but that page can be switched off, hidden by an
operator, renamed or blocked after the cheer arrived. A cheer whose page would
not open for this reader keeps its words and opens nothing, the same rule the
account menu uses for Your profile.

## The kinds there are

| Kind | Tab | Tile | Clicking it opens |
| --- | --- | --- | --- |
| cheer | Social | party popper | the sender's public page, while it opens |

A tab is added with the first kind filed under it, so the tray never offers a
tab that is always empty. Rooms and Account join with their first notices. The
tile takes the theme's primary colour, so it is the Pomoder orange in the
product and the workspace's own colour in the admin's bell.

## Opening a room clears its notices

When the Rooms page opens on your room, or you join a room, your unread notices
saved with that room turn read and shown. Notices about other rooms, and every
other notice, are left alone. If the marking fails, the failure is logged and
the room opens anyway. Room notices do not exist yet, so for now this has
nothing to clear.

## The rules every notice follows

Every part of this app that writes a notice keeps to these. The first notice,
the cheer in `src/server/pomodoro/following.ts`, is the worked example.

- **The type is always `app_activity`.** The database refuses anything else.
- **The notice row and its `pomodoro_notice_links` row go in the caller's own
  transaction.** Then `publishNotificationCreated(userId, tx)` runs on that
  same transaction, so the bell's nudge waits for the commit and is never sent
  for a notice that rolled back.
- **The sentence comes from a function in `src/lib/pomodoro/notices.ts`**, and
  `noticeKindFromWords` recognises it. The writer and the reader then cannot
  drift apart.
- **A blocked pair never notifies, in either direction.** Use
  `isBlockedBetween` from `src/server/pomodoro/blocks.ts`.
- **Nobody is notified about their own action.**
- **A burst of the same thing about the same object folds into one unread
  row**, such as "Sam and 3 others joined", never four rows. The writer updates
  the waiting unread row instead of adding another.
- **The link is an address inside this app.** The shell drops any other kind of
  address anyway.
- **A notice whose kind is switched off in Settings is never written.** Today
  only the cheer has a switch, on Settings → Profile. The card of per-kind
  switches waits until there are kinds to list on it.
