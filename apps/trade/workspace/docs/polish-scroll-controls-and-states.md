# Scroll, controls and state polish

The Trade app uses themed `ScrollArea` surfaces for narrow backtest and flow-run layouts, and exposes a horizontal scrollbar for the three wide bottom tables. Market-list headings remain opaque and pinned while rows move underneath.

Loading settings keep their titled card frames and show `LoadingRow`. Failed chart, trade, alert and market surfaces keep an in-place error message and retry action while preserving the error toast.

Busy actions keep their labels and show a spinner. Sound switches disable only the switch being saved. Grid limits and busy position actions explain their disabled reason. Saved layouts use a single radio choice, and chart visibility controls use the standard `Switch`.

Smart-order details open from a labelled button in a scrollable popover. The chart order menu focuses its first item and supports arrow, Home, End and Escape keyboard controls.

Account preference work remains partial: the existing daily volume filter already reads from `trade_prefs`, but adjustable market-list widths are not present in the current component, so no new width fields were added.
