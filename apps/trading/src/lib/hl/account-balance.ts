import type { InfoClient } from "@nktkas/hyperliquid"

type AccountMode = Awaited<ReturnType<InfoClient["userAbstraction"]>>
type TradingInfoClient = Pick<
  InfoClient,
  "clearinghouseState" | "spotClearinghouseState" | "userAbstraction"
>

export function resolveTradingBalance(
  accountMode: AccountMode,
  clearinghouseState: {
    marginSummary: { accountValue: string }
    withdrawable: string
  },
  spotState: {
    balances: Array<{
      coin: string
      total: string
      hold: string
      token?: number
    }>
    tokenToAvailableAfterMaintenance?: Array<[number, string]>
  }
) {
  if (accountMode !== "unifiedAccount" && accountMode !== "portfolioMargin") {
    return {
      equity: clearinghouseState.marginSummary.accountValue,
      withdrawable: clearinghouseState.withdrawable,
    }
  }

  // Unified accounts keep collateral in the spot state; individual perp
  // balance summaries are not meaningful in this mode.
  // Source: https://hyperliquid.gitbook.io/hyperliquid-docs/trading/account-abstraction-modes
  const usdc = spotState.balances.find((balance) => balance.coin === "USDC")
  if (!usdc || usdc.token === undefined) {
    return { equity: "0", withdrawable: "0" }
  }

  const available = spotState.tokenToAvailableAfterMaintenance?.find(
    ([token]) => token === usdc.token
  )?.[1]
  return {
    equity: usdc.total,
    withdrawable: available ?? "0",
  }
}

export async function loadTradingAccountState(
  client: TradingInfoClient,
  user: `0x${string}`
) {
  const [accountMode, clearinghouseState, spotState] = await Promise.all([
    client.userAbstraction({ user }),
    client.clearinghouseState({ user }),
    client.spotClearinghouseState({ user }),
  ])
  const balance = resolveTradingBalance(
    accountMode,
    clearinghouseState,
    spotState
  )

  return { accountMode, clearinghouseState, spotState, ...balance }
}
