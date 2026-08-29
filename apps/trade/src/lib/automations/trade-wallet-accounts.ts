import { loadWalletAccounts } from "@/lib/api/trade/wallets"
import type { TradeWallet, WalletAccountSummary } from "@/lib/trade/wallets"

/**
 * The wallet figures shared by the Wallet and DCA steps.
 *
 * Both panels need the same exchange read. Keeping its last answer here means
 * opening the DCA step after the Wallet step does not ask every exchange all
 * over again, and two panels opened during one slow read wait for that same
 * request.
 */
export type AutomationWalletAccounts = {
  at: number
  wallets: TradeWallet[]
  summaries: WalletAccountSummary[]
}

const CACHE_MS = 60_000
let cached: AutomationWalletAccounts | null = null
let inFlight: Promise<AutomationWalletAccounts> | null = null

/** The last wallet answer already in memory, without starting a request. */
export function readAutomationWalletAccounts(): AutomationWalletAccounts | null {
  return cached
}

/**
 * Read every wallet once, or reuse the answer from the last minute.
 *
 * `fresh` is the Wallet step's Try again action. It skips a saved answer but
 * still joins a request already on its way, because a retry must not double a
 * slow exchange read.
 */
export function loadAutomationWalletAccounts(
  fresh = false
): Promise<AutomationWalletAccounts> {
  if (!fresh && cached && Date.now() - cached.at < CACHE_MS) {
    return Promise.resolve(cached)
  }
  if (inFlight) return inFlight

  inFlight = loadWalletAccounts()
    .then((answer) => {
      cached = {
        at: Date.now(),
        wallets: answer.wallets,
        summaries: answer.summaries,
      }
      return cached
    })
    .finally(() => {
      inFlight = null
    })
  return inFlight
}
