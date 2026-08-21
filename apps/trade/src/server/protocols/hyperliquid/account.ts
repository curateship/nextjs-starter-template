import type { NetworkId, WalletAccountFigures } from "@/lib/protocols/contracts"
import { num } from "@/lib/protocols/hyperliquid/translate"
import { infoClient } from "@/server/protocols/hyperliquid/client"

/**
 * How long one account read stands in for the next, in ms.
 *
 * **Because several things ask the same question.** The
 * account panel polls every fifteen seconds for every wallet, and the flow
 * runner and the wallet picker ask the same question on their own beats — so
 * without this each of them would pay separately for the same answer, on an
 * exchange that counts every request from one machine together. Running out is
 * what makes a wallet answer with nothing, which is exactly the "Can't reach
 * it" this cache exists to stop causing.
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

/** Every remembered answer forgotten. For tests, which must not share state. */
export function forgetHyperliquidAccounts(): void {
  accountCache.clear()
  modeCache.clear()
}

/**
 * How long the account's margin mode stands before it is asked for again.
 *
 * **Because it is the most expensive question on the cheapest subject.**
 * Hyperliquid charges 20 request-weight for `userAbstraction` and 2 for
 * everything else this read asks, so on the panel's own beat the margin mode
 * was ninety per cent of what reading a wallet's figures cost — for a setting
 * a person changes on Hyperliquid's own site perhaps once ever.
 *
 * A minute, not longer. Somebody who does switch their account into or out of
 * a unified mode while this app is open sees the figures read from the wrong
 * side of it until the minute is up, and a minute of that is a price worth
 * paying where five would not be.
 */
const MODE_CACHE_MS = 60_000

/** Whatever the exchange calls its margin modes, as the SDK types them. */
type MarginMode = Awaited<
  ReturnType<ReturnType<typeof infoClient>["userAbstraction"]>
>

const modeCache = new Map<string, { at: number; mode: Promise<MarginMode> }>()

/** Which margin mode this account is in, from the cache when it is warm. */
function marginModeOf(
  client: ReturnType<typeof infoClient>,
  key: string,
  user: `0x${string}`
): Promise<MarginMode> {
  const cached = modeCache.get(key)
  if (cached && Date.now() - cached.at < MODE_CACHE_MS) return cached.mode

  const at = Date.now()
  const mode = client.userAbstraction({ user })
  // A failed read is never remembered, exactly as everywhere else here.
  mode.catch(() => {
    if (modeCache.get(key)?.at === at) modeCache.delete(key)
  })
  modeCache.set(key, { at, mode })
  return mode
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
  const key = `${network}:${address.toLowerCase()}`

  // The mode first, because it decides whether the spot balances are worth
  // asking for at all. On a classic account they are read and thrown away,
  // and the exchange charges for them either way.
  const mode = await marginModeOf(client, key, user)
  const unified = mode === "unifiedAccount" || mode === "portfolioMargin"
  const [clearinghouse, spot] = await Promise.all([
    client.clearinghouseState({ user }),
    unified ? client.spotClearinghouseState({ user }) : null,
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

  if (spot) {
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
