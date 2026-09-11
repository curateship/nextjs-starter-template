# Pinned markets

Header pins keep up to five markets visible while an account moves between pages.
Migration `0168_trade_pinned_markets.sql` is applied to the remote database used
by the local Trade server. The column stores JSON lists, rejects null values
and defaults to an empty list.

## A fixed link for every member

An admin can add a child under Home in Settings → Members → Sidebar, give the
child a market name and a chart URL such as
`/protocols/hyper-liquid?market=hyperliquid%3Amainnet%3ABTC`, and save the
sidebar. The sticky header draws those children when Home is the active sidebar
section. The link is the same for every member, has no price, and is not a
personal pin. The destination must be accessible to members, which the exchange
screens now are — see `who-can-open-a-protocol-screen.md`. A chart URL still
written the old way, under `/admin`, redirects to the same screen and works,
but a member is refused any other `/admin` address.

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

## The figure on a chip, and links

**Pins are drawn beside the section's own navigation links, never instead of
them.** They used to replace those links, so pinning a market took the way to
the other exchanges out of the header. The links keep their own overflow menu
and their own limit; the chips follow them and scroll on their own when the
row runs out of room.

**The chips sit at the far right of the header**, against the equity figure
and the bell, on their own light ground. Tyler's rule, 10 September 2026. The
links then start at the same place on every screen and the chips end at the
same place, so neither moves when the other changes length: pinning a market,
or opening a section with more links, no longer slides everything else along
the row. The ground is the same shape as the chart's timeframe picker — a tray
the height of a navigation link, holding chips one step smaller — which is what
makes the pins read as one thing rather than as more links further along.

**Each chip shows its symbol and the change over the last day, and nothing
else.** No price, and no tooltip. The price was the longest thing on the chip
and the least looked at, and the tooltip that replaced it named the exchange,
the network and the price while covering the row under the header every time
the pointer crossed a pin. The chart the chip opens says all of that. The
change uses Trade's shared number formatting, the shared money colours, and
keeps its sign.

The chip's `aria-label` still carries the full description, so a screen reader
is told the market, the exchange and the network. The unpin cross keeps its own
tooltip, which is also where a save in progress is named.

**A chip is one hovered surface, filling the tray it sits in.** The market and
the unpin cross used to be two buttons that each shaded only themselves, so
hovering the name lit a short pill that stopped before the cross. The whole
chip now takes the shading, cross included, and neither control paints a
background of its own. Its hover is a step darker than the tray, so a chip
under the pointer is still visible against it.

**A refresh leaves the figure on screen while it waits.** It used to be blanked
the moment a read started, so every fifteen seconds each chip lost its
percentage, shrank to the width of a dash and grew back when the answer landed:
the row jumped on a clock. The number is at most fifteen seconds old either
way, and a reader cannot tell a blank from a dead market, so the old figure
stays until a new one replaces it.

The percentage sits directly after the symbol, sized to what it says. It had a
fixed-width column for a while, which right-aligned a short figure and left a
visible hole between the two. What holds the row steady is `tabular-nums`:
every digit is the same width, so a figure ticking from -2.15% to -2.17% moves
nothing beside it.

The header refreshes every 15 seconds while the tab is visible. Receiving a
saved pin list does not restart the timer or cause a second immediate read. The server
reuses the shared market price reads, grouped by exchange and network, and the
shared market catalogue. The previous day's reference price comes from the
catalogue; today's change is recalculated against the current price.

A read that FAILS still blanks the figure to a dash, because that is the case
where the age of the number is genuinely unknown. Hiding the tab clears the
figures and stops price requests, for the same reason. Returning to the tab
starts a fresh read. The next read also picks up pin changes made in another
browser.

Clicking a chip opens the market's exchange chart and preserves its network in
the market key. Below 1280 pixels, chips show symbols and remove buttons only.
When a phone has too little room for all five, the shared horizontal scroll area
keeps the pins inside the header. With no pins, the original sidebar navigation
returns. The same links remain visible while the header component loads.

Trade supplies pinned markets through the shell's `header.leftContent` option.
The component receives `AppHeaderLeftContentProps`, including the normal links
as `fallback`. The left option needs only the component and allowed roles;
the separate active-trades action retains its label and icon on the right.

## Member access

The header option allows member and admin roles. The exchange screens sit
outside `/admin`, at `/protocols/…`, so a member reaches a chart and can pin
from it. The pins are personal: each account saves its own list against its own
row, so two members pin different markets and neither sees the other's.

The screens a member is still refused, and why, are in
`who-can-open-a-protocol-screen.md`.

## Checking the feature

Run the focused normaliser, server persistence and header component tests, then
the app type check. The server tests use an isolated database and exercise the
new migration, account separation, ordered saves, the five-pin limit, removal
and a market that is no longer listed.

Check the actual saved workflow in the existing server on port 3014:

1. Open a BTC chart, press Pin to header, then open Settings. BTC should remain
   at the far right of the header, just left of the equity figure. Wait through
   a 15-second refresh: the percentage must stay on screen the whole time and
   the chip must not change width. Compare the new figure with a fresh exchange
   price.
2. Pin four more markets. Attempt a sixth and check that the refusal names all
   five. Remove a header chip and confirm the chart's pin button also clears.
3. Reload, then sign into a second browser as the same account. Check the saved
   order and confirm that a pin changed in either browser reaches the other
   within the next visible refresh. A different account should have its own list.
4. Check at 1600, 1100 and 390 pixels. Price and change appear only at 1280 pixels
   or wider; the phone header must not widen the page. Use the buttons by keyboard.
5. Hide the tab and check that refresh calls stop. Return to the tab, then
   simulate a failed price read. A failed read must show a dash. A failed save
   must restore the list and show an error.
6. Remove every pin and confirm the original sidebar links return. Repeat the
   workflow signed in as a member, whose chart access is no longer blocked.

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
`net::ERR_ABORTED`; no pin request failed in the completed check. That check
was made as an admin; the member workflow it could not reach at the time is now
reachable and has not been checked in a browser.
