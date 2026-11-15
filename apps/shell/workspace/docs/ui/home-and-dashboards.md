# Home and dashboards

Home depends on the signed-in role. A member sees:

- Their current plan.
- Recent feedback.
- Notifications.

The cards read the same records as Account, the feedback window, and the
notification tray, so Home does not keep a second version of those systems.

An admin is sent to the saved admin home route, or to Admin by default. A member
may also have a saved home route. These forwarding routes replace the browser
history entry, so Back does not land on a page that immediately sends the person
forward again.

## Refresh behavior

Member Home reloads when feedback changes through the shell's feedback window.
Notification actions use the shared notification records and unread count.

See [Dashboard controls](dashboard-controls.md) for dashboard tabs and sortable
headings. See [App shell and navigation](app-shell-and-navigation.md) for the
frame around these pages.
