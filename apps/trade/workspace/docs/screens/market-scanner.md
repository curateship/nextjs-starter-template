# Market scanner

The chart dashboard's left panel finds unusual trading volume and price movement.

- The header shows a radar icon beside "Market scanner". It uses the workspace's
  standard dashboard heading font, height and spacing. Result rows use the same
  36px height, 12px side gutter and ticker font as other workspace market rows.
  Its right-hand cog opens account settings.
  Save changes persists the settings. Closing untouched settings needs no confirmation. Older saved settings receive defaults for new fields before changes are compared. Cancel offers to discard only actual unsaved edits.
- Rows show ticker, time since qualifying, and signed candle price change.
  Gains use the chart's green; losses use its red. The percentage is captured at detection and remains unchanged. Zero is neutral and missing
  candle measurements show a dash. Panel rows and the cog have no hover tooltips. Screen-reader labels retain measurement details.
  Positive and negative percentages use the same soft colored background as other market-list change values.
- Selecting a market opens its exact exchange and market. Markets on the current
  exchange update the active chart. Another exchange opens its protocol dashboard.
- Saved folders remain in the chart header's folder menu and manager.

## Measurements

Volume uses Discovery's shared live history. Estimated dollars traded in the
last minute are the increase in rolling daily volume. Usual minute volume is
the current daily volume divided by 1,440. Rolling totals can lose old trades,
so this estimate is not exact traded volume.

The selected timeframe controls the candle measurements and row price change.
Price change compares the forming candle's latest close with its opening price.
Range is high minus low. Average true range is the simple average of the last
N completed candles' true ranges, including gaps from the preceding close.
The forming candle never enters this baseline. Movement multiple is current
range divided by preceding average true range. Range and ATR also show as a
share of the latest price. Bollinger width uses 20 closes, a simple mean and
two population standard deviations on each side. The forming close is included.

Choose Price increase, volume only, volatility only, or both volume and volatility.
The selected condition controls which fields are shown. Price increase shows only its percentage and rolling window, plus the shared enable and exchange controls. Volume and volatility settings remain saved and return when another condition is selected. The added Price increase fields
set the required percentage and rolling time window. The preset "Use 5% rise in
1 minute" chooses that rule while preserving volume and volatility settings.

The price rule compares the latest fresh price with the price one or five minutes
earlier. A $100 market reaching $105 qualifies at 5%. This is a rolling window,
independent of candle boundaries, volume and ATR. It needs a full window of price
history before qualifying. Price mode uses the existing exchange-wide figures
feed and opens no candle subscriptions, so the 20-market candle limit does not apply.

Matches are captured once per market and remain until manually deleted. Price
reversals, missing feeds, reconnects, changes to settings and pausing do not remove
them. The captured percentage and detection time explain the original match.
Volume results capture the preceding minute's price change; volatility results
capture the selected candle's change. New detections appear first.

Right-click a result and choose Delete. There is no inline trash button.
Keyboard users can focus the result and press Shift+F10 or the menu key.
Deleting removes only the scanner result and does not open its chart.
The same ongoing
match is suppressed until fresh data shows the condition is no longer met. A later
qualifying event may then appear again. Missing data never counts as a reset.

Results and deletion state persist under the account ID in this browser's local
storage. Reloading or changing protocol dashboards retains results. Results do not
sync between browsers or devices. Storage failures produce a message rather than
claiming that results were saved. Scanner settings remain in account preferences.

## Coverage and lifetime

Volume scans all selected markets with an exchange-wide live feed, subject to
the account's minimum daily-volume restriction. Unsupported venues are marked
unavailable. KuCoin has no exchange-wide figures feed and cannot participate.

Candle measurements follow the 20 busiest supported markets across selected
exchanges, chosen when scanning starts. The panel and timeframe help disclose
this limit. Volume matches outside that group have unavailable candle details.
The scanner uses the shared protocol candle subscriptions. Initial history
requests run one at a time with two seconds between requests. The scanner
does not fetch older history or open a stream for every listed market.

Missing candles, gaps, zero ATR, invalid prices and updates older than 30 seconds
cannot qualify for volatility. Reconnects discard candle baselines and request
fresh history. A one-second evaluation checks for new matches. Stale data cannot create a new match; existing detections stay visible.
Disabling or leaving the dashboard releases scanner-owned watches and timers.
The scanner does not place orders or run as a background server service.

Settings occupy the account's `trade_prefs.market_scanner` column, added by
migration `0177_trade_market_scanner.sql`. Discovery preferences are independent.

## Testing the dashboard

1. Open a protocol chart. The left panel should say "Market scanner".
2. Open the cog with the mouse and keyboard. Change thresholds and save, then
   reload. Settings should persist. Cancel and discard should retain saved values.
3. Select a supported exchange and wait for volume history to warm up.
   Lower the volume multiple and dollar minimum to make matches easier to see.
4. Compare a row's details with its chosen candle timeframe. Follow a row and
   confirm the market and exchange. Watch elapsed time continue across updates.
5. Switch to volatility only, then both conditions. Only markets with current
   candle coverage can qualify. Higher thresholds affect new detections. Existing results should remain.
6. Right-click a result and choose Delete. The ongoing match should not immediately return.
7. Reload and confirm undeleted results remain. Disable scanning and confirm the paused message. Check narrow layouts,
   both themes, keyboard focus and the chart header's saved folders.

## Verification

The focused scanner, Discovery, folder-menu and workspace checks pass 33 tests
across 10 files. Scanner files pass lint. The app-wide type check reports errors
in unrelated order code and tests, with no scanner-file errors.

A Playwright run rendered the real components with controlled data. Keyboard
opening, saving and reopening settings, and selecting the exact market passed.
No page errors occurred. The modal measured 768px wide on a 1440px viewport and
390px wide on a 390px viewport, with no horizontal overflow in either theme.
Component tests additionally verify invalid values, cancel/discard, save failures,
focus return, row signs and unavailable values. The real sign-in attempt failed,
so the authenticated dashboard and live exchanges were not verified end to end.

The added price rule and retained-result behavior have focused tests for the 5%
boundary, negative moves, no candle requests, reload persistence, account isolation,
deleting an ongoing match and allowing a later new event. Component tests confirm
the preset preserves existing controls and deletion does not open the chart.
