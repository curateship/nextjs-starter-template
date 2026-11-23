import { z } from "zod"
import type { NetworkId } from "@/lib/protocols/contracts"
import type { KeyPermission } from "@/lib/trade/wallets"
import { asterSigned, parseAsterCredential } from "./client"

const agentsSchema = z.array(
  z.object({
    agentAddress: z.string(),
    canWithdraw: z.boolean(),
    canPerpTrade: z.boolean().optional(),
  })
)

export async function readAsterKeyPermission(
  network: NetworkId,
  address: string,
  credential: () => string | null
): Promise<KeyPermission> {
  const blob = credential()
  if (!blob) return "unknown"
  const key = parseAsterCredential(blob)
  // Aster leaves the weight unspecified. Use its 30-unit account-settings weight.
  const answer = await asterSigned(
    network,
    address,
    key,
    "GET",
    "/fapi/v3/agent",
    30
  )
  const parsed = agentsSchema.safeParse(answer)
  if (!parsed.success) return "unknown"
  const agent = parsed.data.find(
    (row) => row.agentAddress.toLowerCase() === key.signer.toLowerCase()
  )
  if (!agent) return "unknown"
  if (agent.canWithdraw) return "can-withdraw"
  return agent.canPerpTrade ? "trade-only" : "unknown"
}
