# The bottom panel's one table

Positions, Open orders and the Journal use one table frame. Each tab supplies
its own columns, rows, words and row actions. The frame owns the pinned heading
row and the loading, failed and empty row beneath it.

Active Trades, Running bots and the Trades dashboard card use the same frame
in their own card wrapper. Their columns and row contents stay different, but
sorting, scrolling and the state row come from `trade-table.tsx`. The pinned
heading uses one opaque theme-token mix in light and dark mode, so values moving
under it cannot show through the labels.

The shared frame keeps three safety rules in one place. A first read that has
not landed cannot claim the account is empty. A failed read stays different
from an empty result and keeps its retry button. Closing the last row leaves the
headings in place, so the panel does not jump.

The practice and real-wallet reads finish separately. A refusal still counts
as a finished read. Once the other half finishes, the failed row replaces the
spinner instead of leaving the panel saying it is reading forever.

The rows still belong to their tabs. Mainnet rows never carry a "Real" chip.
Testnet rows keep their Testnet mark, and practice Journal rows keep their
Practice mark. Positions keep their close actions. Open orders keep the cancel
action for the exact order shown. The Journal alone keeps selection and removal
because finished trades do not disappear while a person is choosing them.

## Positions without a stop

Once the practice and real-wallet reads have both finished, a position with no
stop has a red "No stop" badge beside its market. Hovering the badge or reaching
it with the keyboard says, "This position has no stop." The words remain visible
without relying on the badge's color.

The Positions tab does not mention missing stops. The tab keeps its ordinary
position count, while the protection warning stays beside the affected market.

An ordinary position gets its stop from the latest position read. A running
grid also counts as protected when its matching grid plan holds the stop. That
exception covers a Lighter stop watched inside Trade and a paired grid's own
part-size stop. The warning reports the missing stop; it never places one.

The heading draws the single one-pixel line above the rows. The first row does
not add a second edge beneath it, while every later row keeps its normal divider.
