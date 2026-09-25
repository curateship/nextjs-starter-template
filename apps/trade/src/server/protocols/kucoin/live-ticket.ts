import { z } from "zod"

import type { NetworkId } from "@/lib/protocols/contracts"
import { kucoinPublicPost } from "@/server/protocols/kucoin/client"

/**
 * The ticket KuCoin's socket demands before it will accept a connection.
 *
 * One POST, no signing, no account — it is how the exchange paces anonymous
 * connections. The browser cannot make this call itself (KuCoin's HTTP host
 * refuses a request from a web page), which is the whole reason the registry
 * has a ticket slot at all.
 *
 * The exchange names the address to dial and how often it wants to be
 * greeted, so both are carried back rather than assumed here: a hardcoded
 * socket address would be one more thing to be wrong the day they move it.
 */

const bulletSchema = z.object({
  token: z.string(),
  instanceServers: z
    .array(
      z.object({
        endpoint: z.string(),
        pingInterval: z.number().optional(),
      })
    )
    .min(1),
})

export async function kucoinLiveTicket(network: NetworkId): Promise<{
  endpoint: string
  token: string
  pingIntervalMs: number
}> {
  const answer = bulletSchema.parse(
    await kucoinPublicPost(network, "/api/v1/bullet-public")
  )
  const server = answer.instanceServers[0]
  return {
    endpoint: server.endpoint,
    token: answer.token,
    pingIntervalMs: server.pingInterval ?? 18_000,
  }
}
