import { createServerFn } from "@tanstack/react-start"

import type { JournalFill, JournalWallet } from "@/server/journal"

export type { JournalFill, JournalWallet }

export type JournalOverviewResponse = {
  wallets: JournalWallet[]
  /** Every stored fill across the user's mainnet wallets, oldest first. */
  fills: JournalFill[]
  /**
   * Why the top-up from Hyperliquid failed, if it did. The stored history is
   * still served — a sync outage never blanks the page.
   */
  syncError: string | null
}

const loadJournalOverviewFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<JournalOverviewResponse> => {
    const { findCurrentUser } = await import("@/server/security")
    const user = await findCurrentUser()
    if (!user) throw new Error("Missing Custom Shell session")

    const { listWalletFills, syncWalletFills } = await import("@/server/journal")

    // Top up first so the read below includes anything new, but never let a
    // sync failure cost the user the history already on disk.
    let syncError: string | null = null
    try {
      await syncWalletFills(user.id)
    } catch (error) {
      syncError =
        error instanceof Error
          ? error.message
          : "Could not reach Hyperliquid to check for new trades."
    }

    const { wallets, fills } = await listWalletFills(user.id)
    return { wallets, fills, syncError }
  }
)

export function loadJournalOverview() {
  return loadJournalOverviewFn()
}
