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
Every scrolling card uses the themed `ScrollArea`. The Plans view in the People
card follows the same rule, including when many plans exceed the card height.

## Headline figures

The row across the top of Overview is one card with five figures: People,
Joined this month, Paying, Revenue a month, and Feedback this week. Every admin
dashboard's top row uses the same card, `StatStrip` in
`src/components/shared/dashboard/stat-strip.tsx`.

Each figure reads top to bottom:

- **Name and number.** The number is large and bold.
- **Change.** How far the number moved against last month, or last week for
  feedback, such as "+33.3%" in green or "−100.0%" in red. A figure that did
  not move shows a grey "0.0%" with no sign.
- **Small line.** The last 30 days, one point a day, in the top right corner.
  The line is green, red or grey to match the change. It only appears once the
  figure is at least 240px wide, so it never cuts the name short.
- **Facts.** Under a dashed line, a few small facts sit side by side, such as
  "25 members  3 admins  2 suspended". Unanswered feedback turns orange while
  there is any, because it is the one thing on the row waiting on the admin.

Only three figures have a history the app can count back to. People and Joined
are counted from each account's joining date. Feedback is counted from when it
was left. A deleted account is missing from every day, not just the day it
went.

Paying and Revenue have no history, so they say "No history kept" where the
change would be and draw no line. A subscription row is overwritten on every
change, so what somebody paid last month is not written down anywhere. Showing
a change there would mean making one up.

When there is nothing last month to compare against, the figure says so in
words, such as "None last month", rather than showing 0%.

## Refresh behavior

Member Home reloads when feedback changes through the shell's feedback window.
Notification actions use the shared notification records and unread count.
Dashboard cards link to the full admin page for work that needs more than a
summary.

See [Dashboard controls](dashboard-controls.md) for dashboard tabs and sortable
headings. See [App shell and navigation](app-shell-and-navigation.md) for the
frame around these pages.
