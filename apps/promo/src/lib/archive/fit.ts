import { NETWORK_NAMES, type Network } from "@/lib/social/networks"

/**
 * The shape, length and size warnings a post writer shows for an archive
 * item (parts 37 and 38). They warn and never block: the network has the
 * last word.
 *
 * The limits are one list per network. The networks change them often and
 * per account, and the sources found on 4 Nov 2026 disagreed (Instagram
 * anywhere from 3 to 20 minutes), so these are the cautious figures for an
 * upload from the phone's gallery. Check them against each network's help
 * pages when one looks wrong, and change them here only.
 */
export const VIDEO_LIMITS: Partial<Record<Network, { seconds: number; bytes: number }>> = {
  instagram: { seconds: 15 * 60, bytes: 4 * 1024 ** 3 },
  tiktok: { seconds: 10 * 60, bytes: 4 * 1024 ** 3 },
  linkedin: { seconds: 15 * 60, bytes: 5 * 1024 ** 3 },
}

/** The networks whose videos are watched tall, full screen. */
const TALL_NETWORKS: ReadonlySet<Network> = new Set(["instagram", "tiktok"])

export type FitInput = { kind: "video" | "carousel" | "picture"; aspect: string; durationMs: number | null; fileSize: number }

export function fitWarnings(network: Network, item: FitInput): string[] {
  const name = NETWORK_NAMES[network]
  const warnings: string[] = []
  if (item.kind === "video" && TALL_NETWORKS.has(network) && item.aspect && item.aspect !== "9:16") {
    warnings.push(`${name} shows videos tall, at 9:16. This one is ${item.aspect}, so it shows small with bars around it.`)
  }
  const limit = VIDEO_LIMITS[network]
  if (item.kind === "video" && limit) {
    if (item.durationMs && item.durationMs > limit.seconds * 1000) {
      warnings.push(`${name} takes videos up to ${Math.round(limit.seconds / 60)} minutes. This one is ${Math.ceil(item.durationMs / 60_000)} minutes.`)
    }
    if (item.fileSize > limit.bytes) {
      warnings.push(`${name} takes files up to ${Math.round(limit.bytes / 1024 ** 3)} GB. This one is ${(item.fileSize / 1024 ** 3).toFixed(1)} GB.`)
    }
  }
  return warnings
}
