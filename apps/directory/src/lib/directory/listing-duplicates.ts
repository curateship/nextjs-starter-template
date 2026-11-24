import {
  duplicateNameKey,
  duplicatePhoneKey,
  duplicateWebsiteKey,
  namesAreClose,
} from "@/lib/directory/submission-duplicates"

/**
 * Whether two listings the site already has are the same place, for the
 * Duplicates row of the Listings dashboard (Tyler's pick, 24 Nov 2026: "Merge
 * duplicate listings").
 *
 * The rule is stricter than the "already listed" warning on a submission,
 * because that one compares one newcomer with the site, and this one compares
 * every listing with every other. On the 3,333 Eat Drink Toronto listings the
 * submission's rule paired about 470: chains at different addresses (Burrito
 * Boyz in five places) and food-hall counters sharing one phone. Tyler picked
 * the stricter rule on 24 Nov 2026 ("Same address + close name"):
 *
 * - **A close name is always needed**, by the same test the submission warning
 *   uses (`namesAreClose`).
 * - **Then the same street address.** Two branches of a chain have different
 *   addresses, so they never pair.
 * - **A listing with no address** pairs on a close name plus the same phone
 *   number or website, since there is no address to tell them apart.
 *
 * The server's query narrows the site down with the same keys written in SQL,
 * and this file decides each pair, so there is one rule and not two.
 */

/** What can match between two listings, strongest first. */
export type ListingPairMatchKind = "address" | "phone" | "website" | "name"

/**
 * The street part of an address, the part before its first comma, in lower
 * case with everything but letters and digits removed. "575 College St,
 * Toronto, ON" and "575 college st." are one key. The city and postcode are
 * left out because they are written in more ways than the street is.
 */
export function duplicateAddressKey(address: string): string {
  return (address.split(",", 1)[0] ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "")
}

/** What one listing is compared by. */
export type ListingPairKeys = {
  name: string
  address: string
  phones: Set<string>
  websites: Set<string>
}

/** The keys of one listing, from its title, its address and its contact links. */
export function listingPairKeys(listing: {
  title: string
  address: string
  menuLinks: { type: string; value: string }[]
}): ListingPairKeys {
  const keys = (type: string, key: (value: string) => string) =>
    new Set(
      listing.menuLinks
        .filter((link) => link.type === type)
        .map((link) => key(link.value))
        .filter(Boolean)
    )
  return {
    name: duplicateNameKey(listing.title),
    address: duplicateAddressKey(listing.address),
    phones: keys("phone", duplicatePhoneKey),
    websites: keys("website", duplicateWebsiteKey),
  }
}

const shares = (a: Set<string>, b: Set<string>) => [...a].some((key) => b.has(key))

/** What matched between two listings, or nothing when they are not a pair. */
export function listingPairMatch(a: ListingPairKeys, b: ListingPairKeys): ListingPairMatchKind[] {
  if (!namesAreClose(a.name, b.name)) return []
  const sameAddress = Boolean(a.address) && a.address === b.address
  const phone = shares(a.phones, b.phones)
  const website = shares(a.websites, b.websites)
  const addressMissing = !a.address || !b.address
  if (!sameAddress && !(addressMissing && (phone || website))) return []
  const kinds: ListingPairMatchKind[] = []
  if (sameAddress) kinds.push("address")
  if (phone) kinds.push("phone")
  if (website) kinds.push("website")
  kinds.push("name")
  return kinds
}

const MATCH_WORDS: Record<Exclude<ListingPairMatchKind, "name">, string> = {
  address: "street address",
  phone: "phone number",
  website: "website",
}

/** "Same street address and phone number, and a very close name." */
export function describeListingPairMatch(kinds: ListingPairMatchKind[]): string {
  const exact = kinds.flatMap((kind) => (kind === "name" ? [] : [MATCH_WORDS[kind]]))
  if (!exact.length) return "A very close name."
  const listed = exact.length === 1 ? exact[0] : `${exact.slice(0, -1).join(", ")} and ${exact.at(-1)}`
  return `Same ${listed}, and a very close name.`
}

/** A pair's two ids in the order the database keeps them: the smaller first. */
export function orderedPair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a]
}

/** What the merge refuses with, word for word, so the browser can show it. */
export const MERGE_ERRORS = {
  same: "Pick two different listings to merge.",
  missing: "One of these listings has been deleted already. Read the list again.",
  owners: "Both listings have an owner, and they are different people. Turn one of the two claims down first, then merge.",
  paying: "Somebody is paying for a featured spot on one of these listings right now. Merge them once that payment is done.",
} as const
