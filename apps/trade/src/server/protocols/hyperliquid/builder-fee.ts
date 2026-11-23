import { HttpTransport } from "@nktkas/hyperliquid"

import type { NetworkId } from "@/lib/protocols/contracts"
import { infoClient } from "@/server/protocols/hyperliquid/client"
import { assertRealMoneyAllowed } from "@/server/protocols/real-money"

/**
 * Hyperliquid's builder fee: an app's own fee added to an order, which the
 * account's MAIN wallet must approve once, up to a highest rate.
 *
 * **Trade never signs this.** The key Trade holds is an agent key, and
 * Hyperliquid only accepts the approval from the main wallet. So the member's
 * browser wallet signs it, and this file only hands the signed approval on and
 * reads back what Hyperliquid now allows.
 */

/** The approval as the browser wallet signed it. */
export type BuilderFeeApproval = {
  action: {
    type: "approveBuilderFee"
    signatureChainId: string
    hyperliquidChain: "Mainnet" | "Testnet"
    maxFeeRate: string
    builder: string
    nonce: number
  }
  signature: { r: string; s: string; v: number }
}

export async function submitHyperliquidBuilderFeeApproval(
  network: NetworkId,
  approval: BuilderFeeApproval
): Promise<void> {
  await assertRealMoneyAllowed(network)
  const transport = new HttpTransport({
    isTestnet: network === "testnet",
    timeout: 15_000,
  })
  const answer = await transport.request<{
    status: string
    response?: unknown
  }>("exchange", {
    action: approval.action,
    nonce: approval.action.nonce,
    signature: approval.signature,
  })
  if (answer.status !== "ok") {
    const reason =
      typeof answer.response === "string"
        ? answer.response
        : "Hyperliquid refused the approval."
    throw new Error(`LIVE_EXCHANGE:${reason}`)
  }
}

/** The highest builder fee this account allows this builder, tenths of a basis point. */
export async function hyperliquidApprovedBuilderFee(
  network: NetworkId,
  user: string,
  builder: string
): Promise<number> {
  return await infoClient(network).maxBuilderFee({
    user: user as `0x${string}`,
    builder: builder as `0x${string}`,
  })
}
