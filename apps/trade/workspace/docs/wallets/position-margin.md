# Changing leverage and margin on an open position

Every position row has a gauge button beside its cog. It opens a window with
two boxes: what leverage the position runs on, and how much of your own cash is
behind it.

## Both boxes are one figure seen from two sides

A $1,000 position with $200 behind it is running at 5×. Putting $200 more
behind it makes it 2.5×. Asking for 2.5× puts $200 more behind it. So the
window shows both, and each box says in dollars what the change comes to before
anything is pressed.

One button at the foot of the window sends whatever was typed, and it is
named after the change: "Put $200.00 behind it", "Take back $100.00", "Change
to 3×", or "Change to 3× and put $200.00 behind it". With nothing typed it
reads Done and only closes. Cancel beside it always just closes.

The two changes are still two separate commands to the exchange. Leverage goes
first, then margin, and a refusal on the first keeps the window open so the
second is not sent behind it. The window closes on its own once the exchange
has taken everything that was asked, and stays open with the refusal on screen
when it has not.

Until 2 September 2026 each box had its own small button and Done only closed
the window, so a margin typed and Done pressed did nothing. That is why the
foot button now does the work.

## The liquidation figure on the window is an estimate, and says so

The exchange will not say where liquidation _would_ move to until the money has
actually moved. So the window works it out with this app's own formula and
writes "about" in front of it, followed by "This app's estimate. The row shows
the exchange's own figure once it answers."

After the change, nothing here is written down. The row's leverage, margin and
liquidation price all come from the exchange's next portfolio read, so what
ends up on screen is the venue's answer rather than what was asked for. A venue
that quietly clamps a request shows its own number.

**The estimate sits at or inside the venue's own.** It is deliberately the
conservative direction, so a change this app allows is one the venue allows
too. Measured on a real Hyperliquid position at 1×: the app estimates
liquidation at about 5% of the entry price where Hyperliquid says a fraction of
a cent.

## Taking margin out is refused when it would bring liquidation inside the stop

A stop at $90 with liquidation moved to $92 means the exchange takes the trade
before the stop can fire. The stop stops being the worst case somebody agreed
to, and a bigger one takes its place quietly. So that change is refused, and
the refusal names both prices.

**"Would bring it inside" and "is already inside" are different, and only the
first is refused.** A position whose stop already sits past its liquidation
price is in that state whatever anybody does next; blocking a withdrawal there
would trap the cash and fix nothing.

Both sides of that comparison use this app's estimate. Measuring "after" with
our formula and "now" with the exchange's would compare two different
arithmetics, and the gap between them would read as a change the withdrawal had
caused.

## Two more refusals

- **Taking out everything behind the position** leaves it nothing to stand on
  and is refused with what it holds now.
- **Adding cash to a position already worth less than its margin** buys no more
  room, because leverage cannot go under 1× on any of these venues. The window
  says so and suggests taking some back instead.

## What each exchange allows

The button is hidden where a venue allows neither change, and the window says
the venue's own reason for the half it cannot do. That table lives beside each
exchange's module in `src/server/protocols/registry.ts`, never in a screen —
a screen comparing exchange names is what the protocol fence forbids.

| Exchange    | Change leverage                                                       | Add or take back margin                         |
| ----------- | --------------------------------------------------------------------- | ----------------------------------------------- |
| Hyperliquid | Yes                                                                   | Yes                                             |
| Aster       | Yes, but it will not lower isolated leverage while a position is open | Add or take back margin on an isolated position |
| Phemex      | Yes, on the matching long or short side                               | Add or take back margin on an isolated position |
| KuCoin      | Cross margin only                                                     | Add or take back margin on an isolated position |
| Lighter     | Yes, preserving cross or isolated mode                                | Add or take back margin on an isolated position |

**Aster's refusal is the venue's, not this app's.** It answers with its own
code, which `refusals.ts` already turns into "Aster will not lower isolated
leverage while this position is open. Close the position or keep its current
leverage." Raising it is allowed.

**Phemex keeps the current margin mode.** The sign of Phemex's leverage number
also says whether the position uses cross or isolated margin. A leverage change
keeps that sign. On a hedged account it changes only the long or short that the
position row represents and sends the other side back unchanged, because
Phemex requires both figures together. Trade reads both figures again before
the change, so a recent change made on Phemex is not overwritten. If Phemex
does not state the current leverage, Trade refuses instead of guessing whether
the position uses cross or isolated margin. Margin changes use the current
isolated margin plus or minus the dollars asked for. Phemex refuses a
position-level margin change on cross margin.

**KuCoin's limit comes from its Futures API.** Cross leverage is an account
setting for that market, so Trade changes that setting before it reports the
ask complete. An isolated position keeps the leverage it opened with, and the
API has no command to change it while it is open. The API has separate calls to
add cash to an isolated position and take cash back out. KuCoin checks whether
the position can spare the requested amount and sends its refusal back in plain
words when it cannot.

**Aster changes isolated margin directly.** A positive amount adds cash and a
negative amount takes cash back. Aster refuses the change on a cross position,
when there is not enough free cash, or when taking cash back would leave too
little behind the position. Its named refusal is the text the window shows.

After every accepted change, Trade clears any held account answer and reads the
position again. The row always shows the exchange's leverage, margin and
liquidation price. It never fills those figures from the number that was asked
for.

## Hyperliquid asks for isolated every time

Every position this app opens on Hyperliquid is opened isolated, because a
trade's stake being all it can lose is the promise the screens make. A
hand-changed leverage asks for isolated too, so it stays on the same footing as
the one placement sets. On a position opened isolated — which is every one of
ours — the mode does not change. On one opened cross somewhere else,
Hyperliquid switches it to isolated, and the row's next read shows that.
Nothing here leaves a position on a mode the app cannot describe.

## Practice wallets are refused rather than faked

The practice engine has no lender to renegotiate with. A practice position's
leverage decided how big the order was at the moment it was placed, and there
is nothing behind it to move afterwards. The window says that instead of
offering boxes that would pretend otherwise.

## Every ask is journalled

The leverage or margin asked for lands in the Journal before the answer
travels, and so does every refusal, in the venue's own words. That is the same
rule every other real-money action here follows.


## Lighter position controls

The gauge button opens the existing position window for Lighter.

- **Leverage:** The change keeps the position's current margin mode. The
  setting belongs to that market in that account and also applies to later
  orders on the same market. The dialog checks the catalogue's maximum.
- **Margin:** Only isolated positions accept a separate cash adjustment.
  Cross positions share account collateral and show an explanation instead.
- **Amounts:** The dialog checks six decimal places and Lighter's reported
  available balance. The server reads the account again before signing.
  Missing margin mode or unavailable cash causes a refusal rather than a guess.
- **Final limits:** Existing checks still prevent withdrawing all margin or
  moving estimated liquidation inside the stop. Lighter can still refuse a
  request after prices, pending orders or available collateral change.
  The app does not claim to know Lighter's exact withdrawable amount.
- **Readback:** The next portfolio response supplies the displayed figures.
  A successful send alone does not prove that the exchange applied the change.

## Testing Lighter changes

- **Local checks:** Run the focused orders, account, client, budget and registry
  tests, plus the position-margin-dialog component test. Signed payload tests
  use the real local signer and do not submit transactions to Lighter.
- **Open the control:** In Lighter, open the gauge beside an existing position.
  A cross position offers leverage and explains why separate margin is unavailable.
  An isolated position offers both controls.
- **Check refusals:** Enter leverage above the displayed market limit, then
  an amount above available cash or with seven decimal places. The window
  should explain the problem before calling the server.
- **Authorize a live check:** Use a separately approved tiny isolated position
  with the Journal open. Record its leverage, allocated margin and liquidation
  price before each change. This app only connects Lighter to mainnet.
- **Change leverage:** Submit one permitted change. Confirm one signed send
  unless Lighter refuses the nonce. Confirm the exchange's next account response
  reports the requested leverage and preserves the margin mode.
- **Add and remove cash:** Add a small amount, then read the allocated margin
  and liquidation price from Lighter. Verify adding moves liquidation farther
  away. Remove a permitted amount and verify the returned margin decreases.
  Keep amounts small enough to pass the existing stop protection checks.
- **Budget refusal:** The automated test exhausts the local request allowance
  and runs both commands through the real send function. Both must refuse
  without a network send or a retry. Do not flood mainnet to repeat this test.

Local signed-payload and component tests pass. A real change and its exchange
readback have not been tested. The signed-in local Lighter page timed out during
browser validation, so opening its actual gauge is also still unproven.


The local commit audit covers wallet ownership checks, guarded server actions,
margin direction, mode preservation, numeric validation and request budgets.
All 120 focused tests pass. The shared-margin component regression also fails
against the previous dialog, proving the test detects the missing restriction.
The invalid-amount tests press the action button and confirm no command runs.
Component validation satisfies the local UI fallback. Live exchange acceptance
remains a separate release check, so the task stays in progress after commit.
