# Notifications

Notifications are private, in-app messages for one user. They cover:

- Feedback activity.
- Changelog entries and announcements.
- AI allowance warnings.
- Account updates and system email failures.
- Automation approvals and failures.
- Activity an app records about the reader's own doing.

The last kind, `app_activity`, is how an app built on the shell puts a sentence
in one person's inbox: a trade that filled, a price that crossed a line. It
carries its own words in the notice's `message` and `detail`, belongs to one
account, and needs nothing else in the database behind it. An app with a notice
to send writes one of these rather than announcing something nobody announced.

## Seen and read are two different things

The bell carries a red number and opens the tray. The number is not the unread
count. It counts notices that have arrived **since the bell was last opened**,
which the `seen_at` column on each notice records.

**Opening the bell clears the red number and nothing else.** Tyler, 22 Sep
2026: it should only clear the bell number amount, and the tray items clear
either by clicking one or by clicking clear all. So the click stamps `seen_at`
on everything waiting, and every one of those notices stays unread, stays in
the Unread tab, and keeps its dot.

That is a change from 16 Sep 2026, when opening the bell marked everything read
and the tray held the rows in the Unread list for that one opening as a
consolation. Nothing does that any more.

Three details hold it together:

- **The stamp is written before the first page is asked for.** A page fetched
  beside the write answers with the count as it was a moment earlier, which put
  the red number straight back on a bell that had just cleared.
- **A notice that lands while the tray is open is stamped too.** It is on
  screen, so a number over an open tray would be telling somebody about
  something they are already reading.
- **A failed write says nothing out loud.** The number stands, and the next
  check says so again.

The footer's "Mark all as read" is now the only thing that reads the whole tray
at once. Clicking one notification opens its linked item when it has one and
saves the read state in the background. If that save fails, the unread dot
returns.

## Live updates

The signed-in shell listens to the notification event stream. The stream carries
a small update signal, then the browser loads the current list and unread count
through the normal guarded server function. A reconnect loads current state
rather than assuming no notifications arrived while the connection was away.

## Admin and personal settings

Every row shows its own second line: the person who set the notice off, or,
when the app wrote it, the notice's own second sentence.

The Notifications dashboard lets an admin:

- Search, filter, sort, and page through notifications.
- Delete selected records.
- Clear all records in the active workspace.

Platform settings control which notification types the product may create.
Account preferences control what an individual wants to receive where the type
allows a personal choice. An in-app notification does not prove that an email
was sent. Email delivery has its own record.
