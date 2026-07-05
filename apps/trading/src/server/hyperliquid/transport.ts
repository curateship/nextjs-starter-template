import { HttpTransport, WebSocketTransport } from "@nktkas/hyperliquid"

import type { TradingNetwork } from "@/server/hyperliquid/types"

export function getDefaultNetwork(): TradingNetwork {
  return process.env.HL_NETWORK === "mainnet" ? "mainnet" : "testnet"
}

export function isMainnetEnabled() {
  return process.env.TRADING_ENABLE_MAINNET === "true"
}

export function assertNetworkEnabled(network: TradingNetwork) {
  if (network === "mainnet" && !isMainnetEnabled()) {
    throw new Error(
      "Mainnet trading is disabled. Set TRADING_ENABLE_MAINNET=true to enable it."
    )
  }
}

export function createHttpTransport(network: TradingNetwork) {
  assertNetworkEnabled(network)
  return new HttpTransport({ isTestnet: network === "testnet" })
}

export function createWebSocketTransport(network: TradingNetwork) {
  assertNetworkEnabled(network)
  return new WebSocketTransport({ isTestnet: network === "testnet" })
}

// Read-only variants skip the TRADING_ENABLE_MAINNET gate. The gate protects
// signing paths; the scanner only reads public mainnet market data.

export function createReadOnlyHttpTransport(network: TradingNetwork) {
  return new HttpTransport({ isTestnet: network === "testnet" })
}

export function createReadOnlyWebSocketTransport(network: TradingNetwork) {
  return new WebSocketTransport({ isTestnet: network === "testnet" })
}
