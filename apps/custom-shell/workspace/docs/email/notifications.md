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

The notification button in the shell shows the unread count and opens the tray.
A person can mark all notifications read. Clicking one notification opens its
linked item when it has one and saves the read state in the background. If that
save fails, the unread dot returns.

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
