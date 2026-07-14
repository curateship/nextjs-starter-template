/**
 * Client-only helpers for the injected browser wallet (MetaMask, Rabby, any
 * EIP-1193 provider). The connect flow needs exactly three operations:
 * request accounts, read the chain id, and sign EIP-712 typed data. The
 * master account's key never exists in this app — only signatures cross.
 */

import type { ApproveAgentTypedData } from "@/lib/api/agent-onboarding"

type Eip1193Provider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>
}

type TypedData = {
  domain: {
    name: string
    version: string
    chainId: number
    verifyingContract: `0x${string}`
  }
  types: Record<string, readonly { name: string; type: string }[]>
  primaryType: string
  message: Record<string, unknown>
}

function getInjectedProvider(): Eip1193Provider | null {
  if (typeof window === "undefined") return null
  const provider = (window as { ethereum?: Eip1193Provider }).ethereum
  return provider && typeof provider.request === "function" ? provider : null
}

export function hasInjectedWallet(): boolean {
  return getInjectedProvider() !== null
}

export type ConnectedWallet = {
  address: string
  chainId: string
}

export async function connectWallet(): Promise<ConnectedWallet> {
  const provider = getInjectedProvider()
  if (!provider) {
    throw new Error(
      "No browser wallet found. Install MetaMask (or another wallet extension) to connect."
    )
  }
  const accounts = (await provider.request({
    method: "eth_requestAccounts",
  })) as string[]
  const address = accounts?.[0]
  if (!address) {
    throw new Error("The wallet did not return an account.")
  }
  const chainId = (await provider.request({ method: "eth_chainId" })) as string
  return { address, chainId }
}

/**
 * Asks the wallet to sign the approveAgent typed data via
 * eth_signTypedData_v4 (which requires the EIP712Domain type spelled out).
 */
export async function signApproveAgentTypedData(
  address: string,
  typedData: ApproveAgentTypedData
): Promise<`0x${string}`> {
  const provider = getInjectedProvider()
  if (!provider) {
    throw new Error("No browser wallet found.")
  }
  return requestTypedDataSignature(provider, address, typedData)
}

export function createInjectedWalletSigner(expectedAddress: `0x${string}`) {
  const provider = getInjectedProvider()
  if (!provider) throw new Error("No browser wallet found.")

  return {
    getAddresses: async () => {
      const address = await readExpectedAddress(provider, expectedAddress)
      return [address.toLowerCase() as `0x${string}`]
    },
    getChainId: async () => {
      const chainId = (await provider.request({ method: "eth_chainId" })) as string
      return Number.parseInt(chainId, 16)
    },
    signTypedData: async (typedData: TypedData) => {
      const address = await readExpectedAddress(provider, expectedAddress)
      return requestTypedDataSignature(provider, address, typedData)
    },
  }
}

async function readExpectedAddress(
  provider: Eip1193Provider,
  expectedAddress: string
) {
  const accounts = (await provider.request({ method: "eth_accounts" })) as string[]
  const address = accounts?.[0]
  if (!address || address.toLowerCase() !== expectedAddress.toLowerCase()) {
    throw new Error(
      "The connected wallet account changed. Reconnect the original account and try again."
    )
  }
  return address
}

async function requestTypedDataSignature(
  provider: Eip1193Provider,
  address: string,
  typedData: TypedData
) {
  const payload = {
    domain: typedData.domain,
    primaryType: typedData.primaryType,
    types: {
      EIP712Domain: [
        { name: "name", type: "string" },
        { name: "version", type: "string" },
        { name: "chainId", type: "uint256" },
        { name: "verifyingContract", type: "address" },
      ],
      ...typedData.types,
    },
    message: typedData.message,
  }
  const signature = (await provider.request({
    method: "eth_signTypedData_v4",
    params: [address, JSON.stringify(payload)],
  })) as `0x${string}`
  if (!/^0x[0-9a-fA-F]{130}$/.test(signature)) {
    throw new Error("The wallet returned an unexpected signature format.")
  }
  return signature
}
