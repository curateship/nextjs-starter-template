import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import {
  KNOWN_PROTOCOLS,
  type NetworkId,
  type ProtocolId,
} from "@/lib/protocols/contracts"
import { userGet } from "@/server/guards"
import { getProtocol } from "@/server/protocols/registry"

/**
 * A one-connection ticket for an exchange whose live feed will not open
 * without one.
 *
 * Most exchanges publish an open socket the browser dials straight. KuCoin
 * does not: it hands out a token over HTTP first, and its HTTP host refuses a
 * request made from a web page. So the server — which has no such problem —
 * asks for the ticket and passes it on, and the browser connects with it.
 *
 * Public market data only. The ticket carries no account and signs nothing;
 * it is the exchange's way of pacing anonymous connections, and this endpoint
 * is guarded like every other because it spends the app's own allowance.
 *
 * An exchange with no ticket to give refuses by name rather than answering an
 * empty one — a screen that got a blank address would dial nowhere and look
 * like a broken feed.
 */
export type LiveTicket = {
  /** Where to dial, as the exchange itself names it. */
  endpoint: string
  token: string
  /** How often the exchange expects to be greeted, in milliseconds. */
  pingIntervalMs: number
}

const ticketSchema = z.object({
  protocol: z.enum(KNOWN_PROTOCOLS),
  network: z.enum(["mainnet", "testnet"]),
})

const liveTicketFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(ticketSchema)
  .handler(async ({ data }): Promise<LiveTicket> => {
    const protocol = getProtocol(data.protocol)
    if (!protocol.liveTicket) {
      throw new Error(`PROTOCOL_NO_TICKET:${data.protocol}`)
    }
    return protocol.liveTicket(data.network)
  })

export function loadLiveTicket(protocol: ProtocolId, network: NetworkId) {
  return liveTicketFn({ data: { protocol, network } })
}
