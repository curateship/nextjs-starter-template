import { lookup } from "node:dns/promises"
import { isIP } from "node:net"

import {
  isPrivateWebhookHostname,
  webhookUrlError,
} from "@/lib/automations/nodes/webhook"

export type PublicWebhookTarget = {
  url: URL
  address: string
  family: 4 | 6
}

type ResolveHostname = (
  hostname: string
) => Promise<Array<{ address: string; family: 4 | 6 }>>

const resolveHostname: ResolveHostname = async (hostname) =>
  lookup(hostname, { all: true }) as Promise<
    Array<{ address: string; family: 4 | 6 }>
  >

/**
 * Resolves once, rejects if any answer is internal, then hands the chosen IP to
 * the HTTPS sender. Pinning that answer prevents a second DNS lookup from
 * changing the destination between this check and the connection.
 */
export async function resolvePublicWebhookTarget(
  value: string,
  resolve: ResolveHostname = resolveHostname
): Promise<PublicWebhookTarget> {
  const error = webhookUrlError(value)
  if (error) throw new Error(error)

  const url = new URL(value)
  const hostname = url.hostname.replace(/^\[|\]$/g, "")
  const family = isIP(hostname)
  let addresses: Array<{ address: string; family: 4 | 6 }>
  if (family === 4 || family === 6) {
    addresses = [{ address: hostname, family }]
  } else {
    try {
      addresses = await resolve(hostname)
    } catch {
      throw new Error("The webhook address could not be found.")
    }
  }

  if (addresses.length === 0) {
    throw new Error("The webhook address could not be found.")
  }
  if (
    addresses.some(
      ({ address, family: addressFamily }) =>
        (addressFamily !== 4 && addressFamily !== 6) ||
        isIP(address) !== addressFamily ||
        isPrivateWebhookHostname(address)
    )
  ) {
    throw new Error(
      "Webhook addresses cannot point to a private or internal address."
    )
  }

  return { url, ...addresses[0] }
}
