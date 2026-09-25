/**
 * Asks the member's browser wallet to sign Hyperliquid's builder-fee approval.
 *
 * Hyperliquid takes an app's fee on an order only after the account's MAIN
 * wallet approves it, and the key Trade holds is not that wallet. So the
 * approval is signed here, in the browser, by whichever wallet extension the
 * member uses, and the server only hands the signature on.
 *
 * The typed data is Hyperliquid's own "user-signed action": the chain id is
 * the one the wallet is on right now, which is what wallet extensions insist
 * on, and Hyperliquid reads it back from `signatureChainId`.
 */

type Eip1193 = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>
}

export type SignedBuilderApproval = {
  action: {
    type: "approveBuilderFee"
    signatureChainId: string
    hyperliquidChain: "Mainnet"
    maxFeeRate: string
    builder: string
    nonce: number
  }
  signature: { r: string; s: string; v: number }
}

export class BrowserWalletError extends Error {}

function browserWallet(): Eip1193 | null {
  const ethereum = (globalThis as { ethereum?: Eip1193 }).ethereum
  return ethereum && typeof ethereum.request === "function" ? ethereum : null
}

export async function signBuilderApproval(input: {
  /** The account's main address, which must be the wallet signing. */
  address: string
  builder: string
  /** "0.1%", exactly as the server will check it. */
  maxFeeRate: string
}): Promise<SignedBuilderApproval> {
  const ethereum = browserWallet()
  if (!ethereum) {
    throw new BrowserWalletError(
      "No browser wallet was found. Open this page in a browser with the wallet that owns this account, such as MetaMask or Rabby."
    )
  }
  const accounts = (await ethereum.request({
    method: "eth_requestAccounts",
  })) as string[]
  const address = input.address.toLowerCase()
  if (!accounts.some((one) => one.toLowerCase() === address)) {
    throw new BrowserWalletError(
      `The browser wallet is on another account. Switch it to ${input.address} and try again.`
    )
  }
  const chainId = String(await ethereum.request({ method: "eth_chainId" }))
  const nonce = Date.now()
  const message = {
    hyperliquidChain: "Mainnet" as const,
    maxFeeRate: input.maxFeeRate,
    builder: input.builder.toLowerCase(),
    nonce,
  }
  const typedData = {
    domain: {
      name: "HyperliquidSignTransaction",
      version: "1",
      chainId: Number.parseInt(chainId, 16),
      verifyingContract: "0x0000000000000000000000000000000000000000",
    },
    types: {
      EIP712Domain: [
        { name: "name", type: "string" },
        { name: "version", type: "string" },
        { name: "chainId", type: "uint256" },
        { name: "verifyingContract", type: "address" },
      ],
      "HyperliquidTransaction:ApproveBuilderFee": [
        { name: "hyperliquidChain", type: "string" },
        { name: "maxFeeRate", type: "string" },
        { name: "builder", type: "address" },
        { name: "nonce", type: "uint64" },
      ],
    },
    primaryType: "HyperliquidTransaction:ApproveBuilderFee",
    message,
  }
  const signature = String(
    await ethereum.request({
      method: "eth_signTypedData_v4",
      params: [address, JSON.stringify(typedData)],
    })
  )
  if (!/^0x[0-9a-f]{130}$/i.test(signature)) {
    throw new BrowserWalletError("The wallet did not return a signature.")
  }
  const v = Number.parseInt(signature.slice(130, 132), 16)
  return {
    action: {
      type: "approveBuilderFee",
      signatureChainId: chainId,
      ...message,
    },
    signature: {
      r: signature.slice(0, 66),
      s: `0x${signature.slice(66, 130)}`,
      v: v < 27 ? v + 27 : v,
    },
  }
}
