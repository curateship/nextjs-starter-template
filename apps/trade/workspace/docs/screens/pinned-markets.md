# Pinned markets

Header pins keep up to five markets visible while an account moves between pages.
Migration `0168_trade_pinned_markets.sql` is applied to the remote database used
by the local Trade server. The column stores JSON lists, rejects null values
and defaults to an empty list.

## A fixed link for every member

An admin can add a child under Home in Settings → Members → Sidebar, give the
child a market name and a chart URL such as
`/admin/hyper-liquid?market=hyperliquid%3Amainnet%3ABTC`, and save the sidebar.
The sticky header draws those children when Home is the active sidebar section.
The link is the same for every member, has no price, and is not a personal pin.
The destination must be accessible to members. Trade's current exchange chart
URLs are under `/admin`, so those URLs redirect a member back to Home today.

## Saved pins

The pin button beside the chart's Fav star adds or removes that market from the
header. The button fills while the market is pinned. Fav folders and header
pins are separate choices. Each account saves its ordered market keys in
`trade_prefs.pinned_markets`; workspaces do not have separate lists.

A sixth pin is refused with a sentence naming the five already pinned. Removing
one makes room for another, which appears at the end. Unpinning also works from
the chip's × button. Each write changes one market under a database row lock,
so another browser cannot overwrite the rest of the list with an older copy.
The server checks the signed-in account and confirms a newly pinned market is
still in the exchange catalogue. Malformed keys, unknown exchanges, unsupported
chart destinations and duplicate keys are removed when reading saved values.

A click updates the chart button and header immediately. A failed save restores
the previous list and explains the failure in an error toast. A failed initial
read leaves the usual navigation visible with a Retry header pins button. The
pin control waits until the saved list has loaded.

## Prices and links

Each chip shows its symbol, current price and change over the last day. Price
and change use Trade's shared number formatting. Rising and falling figures
use the shared money colours and retain their signs. Hovering a chip identifies
the exchange and network, including a practice network when applicable.

The header refreshes every 15 seconds while the tab is visible. Receiving a
saved pin list does not restart the timer or cause a second immediate read. The server
reuses the shared market price reads, grouped by exchange and network, and the
shared market catalogue. The previous day's reference price comes from the
catalogue; today's change is recalculated against the current price.

A refresh clears the old quote while waiting. A missing or failed quote shows a
dash instead of presenting the last number as live. Hiding the tab clears quotes
and stops price requests. Returning to the tab starts a fresh read. The next
read also picks up pin changes made in another browser.

Clicking a chip opens the market's exchange chart and preserves its network in
the market key. Below 1280 pixels, chips show symbols and remove buttons only.
When a phone has too little room for all five, the shared horizontal scroll area
keeps the pins inside the header. With no pins, the original sidebar navigation
returns. The same links remain visible while the header component loads.

Trade supplies pinned markets through the shell's `header.leftContent` option.
The component receives `AppHeaderLeftContentProps`, including the normal links
as `fallback`. The left option needs only the component and allowed roles;
the separate active-trades action retains its label and icon on the right.

## Member access is unresolved

The header option currently allows member and admin roles, as requested in the
task. Exchange charts currently live under `/admin`, whose existing layout sends
members to Home. Members therefore cannot perform the requested pin-from-chart
workflow. The task needs a choice between an admin-only first version and adding
member-accessible exchange charts. No access rules have been changed.

## Checking the feature

Run the focused normaliser, server persistence and header component tests, then
the app type check. The server tests use an isolated database and exercise the
new migration, account separation, ordered saves, the five-pin limit, removal
and a market that is no longer listed.

After the member-access decision, check the actual saved
workflow in the existing server on port 3014:

1. Open a BTC chart, press Pin to header, then open Settings. BTC should remain
   at the top left. Wait through a 15-second refresh and compare the quote with
   a fresh exchange price.
2. Pin four more markets. Attempt a sixth and check that the refusal names all
   five. Remove a header chip and confirm the chart's pin button also clears.
3. Reload, then sign into a second browser as the same account. Check the saved
   order and confirm that a pin changed in either browser reaches the other
   within the next visible refresh. A different account should have its own list.
4. Check at 1600, 1100 and 390 pixels. Price and change appear only at 1280 pixels
   or wider; the phone header must not widen the page. Use the buttons by keyboard.
5. Hide the tab and check that refresh calls stop. Return to the tab, then
   simulate a failed price read. A failed price must show a dash. A failed save
   must restore the list and show an error.
6. Remove every pin and confirm the original sidebar links return. Repeat the
   workflow as a member only after member chart access has been resolved.

Browser layout checks used intercepted pin responses while the remote migration
was pending. Those checks proved responsive display and chip removal with no
page errors; they did not prove persistence or live exchange refreshes against
the remote database. The migration has since been applied and its database
record verified. No code deployment has been performed.

After the migration, the audit checked the actual admin workflow without
intercepting responses. Pinning BTC from its chart persisted on Settings and in
a second browser context using the same account. A scheduled price response
arrived after 15.4 seconds. Removing the header chip persisted, and the test
restored the account's original empty list. There were no page or console
errors. Background requests cancelled during page navigation reported
`net::ERR_ABORTED`; no pin request failed in the completed check. The member
workflow remains blocked by the existing admin-only chart routes.
