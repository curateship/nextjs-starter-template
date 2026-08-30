# Stopping a flow's ladders

Stop owns every active smart-order row stamped with a run ID from the same
flow. The current run's saved coin list is not ownership. A crash can happen
after a ladder row lands and before that coin reaches the saved list. A ladder
left by an older run still belongs to the flow and a later Stop finds it. A
hand-placed ladder has no run stamp, so Stop leaves it alone even when the flow
watches the same coin.

The confirmation closes as soon as Stop is pressed, and the canvas says
Stopping from the run it already has on screen. The server then takes the
wallet's database lock and saves that state. A refused save restores the old
state and says why. The engine calls off three waiting ladders on each
one-second worker pass. The slower coin hunt still runs every 30 seconds and
cannot hold Stop up. Explicit Stop cleanup also keeps running while normal
ladder work is paused or switched off. Those controls stop trading, but they do
not block a request to remove waiting orders. The canvas and run dashboard show
how many remain across every run of that flow, including an older ladder being
cleaned up. The run becomes Stopped after the count reaches zero. A restart does
not lose the work because the Stopping run and its unfinished ladder rows are
the saved list for the next pass.

Ladder and signal placement take the same wallet lock and check the run before
they write. A placement that already holds the lock finishes first and the
later engine pass finds its row. A placement that arrives after Stop sees
Stopping and sends nothing. Another flow cannot start on that wallet until the
cancel finishes.

An unbought practice ladder goes through the practice cancel path. An unbought
real ladder goes through the live path, which asks the exchange to cancel each
resting order before changing the ladder's own record. These Stop-specific
paths do not settle or advance the ladder first: a watched rung whose price has
just been reached is called off, not bought on the way to being cancelled.
Stop never cancels a ladder that has bought anything. The position, stop and
target remain as they were.

A signal buy that is still chasing is called off by the same explicit Stop
pass, rather than waiting for normal wallet work to resume. Practice removes
its waiting order under the wallet lock. Live checks the exchange and cancels
only order IDs recorded for that signal. A newly placed live order may be absent
from one lagging open-orders read, so Stop keeps the signal pending for the same
15-second proof window used by the trading engine before it decides the order
is gone. A position that appeared in the meantime is kept.

A Grid step follows the same ownership rule. Stop cancels every waiting level
on a grid carrying the flow's run ID. A grid placed by hand stays untouched. If
one or more levels hold coin, Stop leaves the grid running after its waiting
levels come off so its emergency stop still protects the position. Grid
placement checks the run under the wallet lock, so a placement that arrives
after Stop sends nothing.

The permanent flow-order record repairs an older bad state. Old stop code could
erase an order ID from a ladder while leaving the real order open. The live
cancel reads the exchange's open orders and cancels only IDs that both the
exchange and that ladder's permanent record name. Matching only by coin or
price would risk cancelling somebody's hand order.

An exchange refusal or a missing wallet leaves the run Stopping and the engine
tries that ladder again on its next pass. The first failure sends one critical
bell notice naming the coin and tells the owner to check the exchange's open
orders. The refused ladder moves behind the others so one coin cannot keep
later cancels waiting.

The results page says "Rungs placed" only when that exact run owns a DCA ladder
with at least one waiting rung. An order placed by hand, an older run's ladder,
a grid on the same coin, or a row whose rungs are all cancelled never supplies
that label. The chart reads the same exact rows, so the label cannot claim more
ladders than the chart can draw.
