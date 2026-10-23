/**
 * The social networks a project can use, each one a module on the project's
 * dashboard: a row in its left column that fills the middle and right columns
 * with that network's panels. Tyler, 14 Oct 2026: "social networks are
 * modules so that means we don't have reddit on its own route that sit in the
 * sidebar".
 *
 * Only networks Promo has built are listed, so "+ Add network" never offers
 * one that does nothing. Instagram and TikTok joined with phone farm file 06
 * (`workspace/tasks/Phone farm/06-instagram-and-tiktok.md`), and Medium with
 * `workspace/tasks/Medium/01-medium-features.md`, and X with
 * `workspace/tasks/X/01-x-features.md`, and LinkedIn with
 * `workspace/tasks/LinkedIn/01-linkedin-features.md`. The server reads this
 * same list to refuse anything else.
 */
export const NETWORKS = ["reddit", "instagram", "tiktok", "medium", "x", "linkedin"] as const

export type Network = (typeof NETWORKS)[number]

export const NETWORK_NAMES: Record<Network, string> = {
  reddit: "Reddit",
  instagram: "Instagram",
  tiktok: "TikTok",
  medium: "Medium",
  x: "X",
  linkedin: "LinkedIn",
}

export function isNetwork(value: unknown): value is Network {
  return typeof value === "string" && (NETWORKS as readonly string[]).includes(value)
}

/**
 * The networks whose accounts run on a phone only, in the real app. Both are
 * built for the phone, and a desktop browser stands out there; setting one of
 * their accounts onto a browser profile is refused.
 */
export const PHONE_ONLY_NETWORKS = ["instagram", "tiktok"] as const

export type PhoneAppNetwork = (typeof PHONE_ONLY_NETWORKS)[number]

export function isPhoneAppNetwork(value: unknown): value is PhoneAppNetwork {
  return typeof value === "string" && (PHONE_ONLY_NETWORKS as readonly string[]).includes(value)
}

/**
 * An account's name as its network writes it: u/name on Reddit, in/name on
 * LinkedIn (the end of the member's own address), @name elsewhere.
 */
export function handleWords(platform: string, handle: string): string {
  if (!handle) return ""
  if (platform === "reddit") return `u/${handle}`
  if (platform === "linkedin") return `in/${handle}`
  return `@${handle}`
}

/**
 * "a Reddit", "an Instagram", "a TikTok", "an X": the network's name with its
 * article, for a sentence, with a capital when it starts one.
 */
export function aNetwork(network: Network, atStart = false): string {
  // X is said "ex", so it takes "an" too.
  const article = network === "instagram" || network === "x" ? "an" : "a"
  return `${atStart ? article.charAt(0).toUpperCase() + article.slice(1) : article} ${NETWORK_NAMES[network]}`
}
