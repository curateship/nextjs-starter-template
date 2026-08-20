/**
 * One question, asked the same way by every smart order: **is the order we
 * placed still out there?**
 *
 * The obvious answer — "it is not in the open-orders read, so it is gone" — is
 * the most expensive mistake this app has made. An exchange's list of open
 * orders is not a photograph of the account: it is a report, and a report can
 * be a second or two behind the order that was just placed. Read it too soon
 * and a live resting order is missing from it.
 *
 * A smart order that believes that absence throws its order id away, sees no
 * order next pass, and places another one. The money is spent twice. On
 * 20 Aug 2026 one KuCoin watch worth $50 placed six orders in eighteen
 * seconds; three of them filled together when the price arrived, and the
 * account held triple what anybody asked for.
 *
 * So absence is never proof on its own. Three answers, and only one of them
 * lets a smart order act:
 *
 * - **`resting`** — the exchange listed it. Carry on.
 * - **`unproven`** — it is not listed, and nothing else says what became of
 *   it. Do nothing at all: do not chase, do not replace, do not finish. Wait.
 * - **`gone`** — the account itself shows what became of it, or it has been
 *   missing long enough that the list cannot still be catching up. Now it is
 *   safe to let go of the id.
 *
 * **What the account showing it means depends on the order**, so the caller
 * decides that and passes the answer in. An order that was buying is proven
 * by a position APPEARING; an order that was selling out of one is proven by
 * that position GOING. Asking for "is there a position" here instead would
 * make one of those two wrong, and a sell that has completed would sit
 * waiting on a fill that already happened.
 *
 * The waiting costs a few seconds on an order that really was cancelled by
 * hand. Getting it wrong costs however much the order was for, again.
 */

/**
 * How long an order may be missing before absence becomes proof.
 *
 * Long enough to outlast any exchange's list catching up — those lag a second
 * or two at worst — and short enough that an order cancelled on the exchange's
 * own website is noticed while somebody is still looking at the screen.
 */
export const ORDER_GONE_AFTER_MS = 15_000

export type OrderPresence = "resting" | "unproven" | "gone"

/**
 * What became of an order, given what this pass can see.
 *
 * `missingSince` comes back so the caller can write it onto its plan — that
 * timestamp is the whole memory this rule needs, and a plan that forgets to
 * save it simply waits the full window again rather than doing anything rash.
 */
export function judgeOrder(input: {
  /** The exchange's open-orders read listed this order. */
  seenOnTheBook: boolean
  /**
   * The account read itself shows this order is finished — a position where
   * a buy was working, or no position where a sell was closing one. The
   * caller works this out, because only the caller knows which it placed.
   */
  accountShowsItDone: boolean
  /** When it first went missing, or 0 if it has not. */
  missingSince: number
  now: number
}): { presence: OrderPresence; missingSince: number } {
  if (input.seenOnTheBook) return { presence: "resting", missingSince: 0 }

  // The account is the fill made visible, and it is the one piece of evidence
  // that beats a lagging list. Waiting past it would only delay the stop and
  // target this order was placed to earn.
  if (input.accountShowsItDone) return { presence: "gone", missingSince: 0 }

  const since = input.missingSince > 0 ? input.missingSince : input.now
  if (input.now - since >= ORDER_GONE_AFTER_MS) {
    return { presence: "gone", missingSince: 0 }
  }
  return { presence: "unproven", missingSince: since }
}
