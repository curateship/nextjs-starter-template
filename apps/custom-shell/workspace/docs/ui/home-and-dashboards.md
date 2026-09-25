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

**A widget header is its icon, its title, and its tabs or button. Nothing
else.** Activity, Visitors over time, People joining and Automations each used
to carry a grey caption beside the title — "daily totals, 7 days", "2 last
month", "2 in all" — and those came off on 25 Sep 2026 at Tyler's ask. The
caption only ever showed above 1536px, so on most screens it was a line that
appeared and disappeared with the window width. `CardHeaderRow` still takes a
`meta`, and other screens still pass one; no widget does.

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
- **Joined this month compares equal stretches.** On the 5th it compares the
  1st to the 5th of this month with the 1st to the 5th of last month, and says
  "vs same days last month". Against all of last month, every month would
  start red. A date last month did not have counts nobody, so on 30 or 31
  March the comparison is all of February. The People card's Joining tab shows
  the same change through the same helper, `joinedChange` in
  `src/lib/billing/membership-figures.ts`.
- **Small line.** The last 30 days, one point a day, in the top right corner.
  The line is green, red or grey to match the change. It only appears once the
  figure is at least 240px wide, so it never cuts the name short.
On Overview each figure stops there. The small facts that used to sit under a
dashed line — the member and admin split, the share of accounts paying, the
average each, the count with no reply — came off on 25 Sep 2026 at Tyler's ask.
`StatStrip` still draws them, and the Traffic, Referrals and AI usage dashboards
still use them; the Overview's figures simply no longer carry any.

Only three figures have a history the app can count back to. People and Joined
are counted from each account's joining date. Feedback is counted from when it
was left. A deleted account is missing from every day, not just the day it
went.

Paying and Revenue have no history, so they say "No history kept" where the
change would be and draw no line. A subscription row is overwritten on every
change, so what somebody paid last month is not written down anywhere. Showing
a change there would mean making one up.

When there is nothing last month to compare against, the figure says so in
words, such as "None last month" or "None in the same days last month", rather
than showing 0%.

## Refresh behavior

Member Home reloads when feedback changes through the shell's feedback window.
Notification actions use the shared notification records and unread count.
Dashboard cards link to the full admin page for work that needs more than a
summary.

See [Dashboard controls](dashboard-controls.md) for dashboard tabs and sortable
headings. See [App shell and navigation](app-shell-and-navigation.md) for the
frame around these pages.
