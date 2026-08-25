# The bottom panel's one table

Positions, Open orders and the Journal use one table frame. Each tab supplies
its own columns, rows, words and row actions. The frame owns the pinned heading
row and the loading, failed and empty row beneath it.

The shared frame keeps three safety rules in one place. A first read that has
not landed cannot claim the account is empty. A failed read stays different
from an empty result and keeps its retry button. Closing the last row leaves the
headings in place, so the panel does not jump.

The rows still belong to their tabs. Positions keep their Real or Testnet mark
and their close actions. Open orders keep the cancel action for the exact order
shown. The Journal alone keeps selection and removal because finished trades do
not disappear while a person is choosing them.

The heading draws the single one-pixel line above the rows. The first row does
not add a second edge beneath it, while every later row keeps its normal divider.
