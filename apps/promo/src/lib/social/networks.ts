/**
 * The social networks a project can use, each one a module on the project's
 * dashboard: a row in its left column that fills the middle and right columns
 * with that network's panels. Tyler, 14 Oct 2026: "social networks are
 * modules so that means we don't have reddit on its own route that sit in the
 * sidebar".
 *
 * Only networks Promo has built are listed, so "+ Add network" never offers
 * one that does nothing. Instagram joins when it is built
 * (`workspace/tasks/Phone farm/06-instagram-and-tiktok.md`). The server reads
 * this same list to refuse anything else.
 */
export const NETWORKS = ["reddit"] as const

export type Network = (typeof NETWORKS)[number]

export const NETWORK_NAMES: Record<Network, string> = {
  reddit: "Reddit",
}

export function isNetwork(value: unknown): value is Network {
  return typeof value === "string" && (NETWORKS as readonly string[]).includes(value)
}
