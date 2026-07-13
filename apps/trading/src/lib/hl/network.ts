/** Browser-safe network type; mirrors the server's TradingNetwork. */
export type TradingNetwork = "testnet" | "mainnet"

export function resolveTradingNetwork(
  defaultNetwork: TradingNetwork,
  walletNetwork: TradingNetwork | null | undefined
): TradingNetwork {
  return walletNetwork ?? defaultNetwork
}
