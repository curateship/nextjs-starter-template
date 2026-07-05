export type TradingNetwork = "testnet" | "mainnet"

export const TRADING_NETWORKS: readonly TradingNetwork[] = [
  "testnet",
  "mainnet",
]

export function isTradingNetwork(value: unknown): value is TradingNetwork {
  return value === "testnet" || value === "mainnet"
}

export function isEvmAddress(value: unknown): value is `0x${string}` {
  return typeof value === "string" && /^0x[0-9a-fA-F]{40}$/.test(value)
}

export function normalizeEvmAddress(value: string): `0x${string}` {
  if (!isEvmAddress(value)) {
    throw new Error("Invalid EVM address")
  }
  return value.toLowerCase() as `0x${string}`
}

export function isPrivateKeyHex(value: unknown): value is `0x${string}` {
  return typeof value === "string" && /^0x[0-9a-fA-F]{64}$/.test(value)
}

export function normalizePrivateKey(value: string): `0x${string}` {
  const withPrefix = value.startsWith("0x") ? value : `0x${value}`
  if (!isPrivateKeyHex(withPrefix)) {
    throw new Error("Private key must be 32 bytes of hex")
  }
  return withPrefix.toLowerCase() as `0x${string}`
}
