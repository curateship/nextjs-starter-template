# Flip a trade

The up-and-down arrow icon sits immediately before Add in each position row.
The flip, gauge and plus buttons show "Flip trade", "Add margin" and "Add to position" tooltips on hover or keyboard focus.

- **Direction:** A long becomes a short, and a short becomes a long. The confirmation names the new direction.
- **Size:** Trade requests the same number of coins and the existing leverage at current market prices. Fees apply to the close and the new entry.
- **Protection:** The old stop and targets are removed before closing. The new position starts without a stop or targets.
- **Real trades:** The server locks the wallet, checks ownership and checks that the signed position size still matches the clicked row. An active smart order on the same market blocks the flip until its remaining orders are stopped.
- **Sequence:** Trade requests a full close, requires a full reported fill and checks that the position is absent. Only then does Trade send the opposite market entry. The two orders are separate exchange requests.
- **Incomplete close:** Trade sends no opposite entry. The message asks the user to inspect any remaining position and reset its protection.
- **Incomplete entry:** The original position has closed. A partial fill or uncertain answer produces a persistent error message instead of success. Trade does not retry an uncertain entry, because the first request may have reached the exchange.
- **Practice:** The existing practice action reverses the simulated position at its current price.
- **Spot holdings:** Coins owned outright have no flip icon because the wallet cannot open a short.
- **Feedback:** Confirmation starts the existing busy state immediately. Trade refreshes the positions after success or failure.

## Verification

The focused server tests use controlled exchange responses. They cover both directions, protection removal, stale positions, active smart orders, partial closes and uncertain entries. Component tests exercise the live-row icon, direction labels, busy state and confirmation.

Local component checks also verify all three tooltips through keyboard focus and the up-and-down arrow icon. Browser sign-in succeeded, but the automated session kept the Positions viewport at zero height, so pointer interaction remains unverified there. The component tests exercise the controls and confirmation instead.

The app-wide type check reports six existing errors in older test fixtures. The changed logic has no reported type errors.

Real-money orders are not placed during local validation. No database migration is needed. The website needs deployment before the new action is available in production.
