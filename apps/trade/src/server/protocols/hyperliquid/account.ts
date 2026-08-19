import type { NetworkId, WalletAccountFigures } from "@/lib/protocols/contracts"
import { num } from "@/lib/protocols/hyperliquid/translate"
import { infoClient } from "@/server/protocols/hyperliquid/client"

/**
 * How long one account read stands in for the next, in ms.
 *
 * **Because this is three requests per wallet, and several things ask.** The
 * account panel polls every fifteen seconds for every wallet, and the flow
 * runner and the wallet picker ask the same question on their own beats — so
 * five wallets could cost forty-five requests a minute from the panel alone,
 * on an exchange that counts every request from one machine together. Running
 * out is what makes a wallet answer with nothing, which is exactly the
 * "Can't reach it" this cache exists to stop causing.
 *
 * Five seconds: shorter than the panel's own poll, so nothing on screen is
 * staler than it has always been, and long enough that everything asking at
 * once shares a single answer. A failed read is never remembered — one
 * refusal must not be repeated to every caller for the next five seconds.
 */
const ACCOUNT_CACHE_MS = 5_000

const accountCache = new Map<
  string,
  { at: number; answer: Promise<WalletAccountFigures> }
>()

/** One account's figures, from the cache when a read is already in flight. */
export function fetchHyperliquidAccount(
  network: NetworkId,
  address: string
): Promise<WalletAccountFigures> {
  const key = `${network}:${address.toLowerCase()}`
  const cached = accountCache.get(key)
  if (cached && Date.now() - cached.at < ACCOUNT_CACHE_MS) return cached.answer

  const at = Date.now()
  const answer = readHyperliquidAccount(network, address)
  answer.catch(() => {
    if (accountCache.get(key)?.at === at) accountCache.delete(key)
  })
  accountCache.set(key, { at, answer })
  return answer
}

/**
 * What one Hyperliquid account holds and is worth, translated to the app's
 * figures. Read-only — the address is public data and this asks nothing that
 * needs a key.
 *
 * Two subtleties carried over from the old app, both real:
 *
 * - An account can run in a "unified" mode where collateral lives in the spot
 *   balances and the perp summary's own totals stop being meaningful. The
 *   account says which mode it is in; in the unified modes, worth and free
 *   cash are read from the spot side instead.
 * - Every figure arrives as a string. `num` refuses the unreadable ones, and
 *   an unreadable core figure fails the whole read — a wallet that cannot be
 *   valued honestly says so rather than showing a zero.
 */
async function readHyperliquidAccount(
  network: NetworkId,
  address: string
): Promise<WalletAccountFigures> {
  const client = infoClient(network)
  const user = address as `0x${string}`

  const [mode, clearinghouse, spot] = await Promise.all([
    client.userAbstraction({ user }),
    client.clearinghouseState({ user }),
    client.spotClearinghouseState({ user }),
  ])

  // A position whose profit cannot be read fails the whole account rather
  // than counting as zero: open profit is subtracted from the journey to get
  // the settled figure, so one silent zero would put a wrong number in two
  // rows and still look like an answer.
  let openProfit = 0
  for (const { position } of clearinghouse.assetPositions) {
    const positionProfit = num(position.unrealizedPnl)
    if (positionProfit === null) {
      throw new Error("Hyperliquid answered with figures that could not be read")
    }
    openProfit += positionProfit
  }

  const inTrades = num(clearinghouse.marginSummary.totalMarginUsed)
  let equity = num(clearinghouse.marginSummary.accountValue)
  let free = num(clearinghouse.withdrawable)

  if (mode === "unifiedAccount" || mode === "portfolioMargin") {
    // Collateral is token 0 (USDC) on the spot side in these modes.
    // https://hyperliquid.gitbook.io/hyperliquid-docs/trading/account-abstraction-modes
    const collateral = spot.balances.find(
      (balance) => "token" in balance && balance.token === 0
    )
    equity = num(collateral?.total ?? "0")
    const available = spot.tokenToAvailableAfterMaintenance?.find(
      ([token]) => token === 0
    )?.[1]
    free = num(available ?? "0")
  }

  if (equity === null || free === null || inTrades === null) {
    throw new Error("Hyperliquid answered with figures that could not be read")
  }

  return { equity, free, inTrades, openProfit }
}
