# Home and dashboards

Home depends on the signed-in role. A member sees:

- Their current plan.
- Recent feedback.
- Notifications.

The cards read the same records as Account, the feedback window, and the
notification tray, so Home does not keep a second version of those systems.

An admin is sent to the saved admin home route or Overview by default. A member
may also have a saved home route. These forwarding routes replace the browser
history entry, so Back does not land on a page that immediately sends the person
forward again.

## Admin Overview

Overview combines:

- Membership figures and plan distribution.
- Feedback activity and recent notifications.
- People and scheduled cancellations.
- Automation status and traffic.

Cards that use sample data label the figures as samples. A sample must not look
like a live business number.

Settings decides which registered widgets appear and whether they sit in the
top, left, or right area. Removing every widget is allowed. The empty dashboard
links back to widget settings instead of looking broken.

Wide layouts give dashboard panels their saved share of the available space.
Narrow layouts stack the cards. Long card content scrolls inside its panel so a
single feed does not make the whole signed-in shell grow without limit.

## Refresh behavior

Member Home reloads when feedback changes through the shell's feedback window.
Notification actions use the shared notification records and unread count.
Dashboard cards link to the full admin page for work that needs more than a
summary.

See [Dashboard controls](dashboard-controls.md) for dashboard tabs and sortable
headings. See [App shell and navigation](app-shell-and-navigation.md) for the
frame around these pages.
