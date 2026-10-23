/**
 * Whether a submission looks like a listing the site already has.
 *
 * Three things count, and any one of them is enough to warn: the same website,
 * the same phone number, or a name that is very nearly the same. The admin
 * decides what to do about it. Nothing here rejects or merges anything.
 *
 * Each rule is a "key": the part of what somebody typed that survives the ways
 * two people write the same thing differently. Two keys that are equal are a
 * match. The server's query narrows the site's listings down with the same
 * rules written in SQL, then these functions decide the pairs, so a match is
 * always decided by this one file.
 *
 * Browser-safe, so the queue and the window can name what matched.
 */

export const DUPLICATE_MATCH_KINDS = ["phone", "website", "name"] as const

export type DuplicateMatchKind = (typeof DUPLICATE_MATCH_KINDS)[number]

/** One existing listing a submission looks like, and why. */
export type DuplicateMatch = {
  listingId: string
  title: string
  slug: string
  /** A draft still counts: it is the same business, only not live yet. */
  status: string
  /** Strongest first: a phone number is rarely shared, a name often is. */
  matched: DuplicateMatchKind[]
}

/** How many existing listings one submission names at most. */
export const MAX_DUPLICATES_PER_SUBMISSION = 3

/**
 * A name shorter than this only matches a name that is the same. Longer, and
 * one name sitting inside the other counts too: "Luigi's Pizza" and "Luigi's
 * Pizza & Pasta". Below eight letters that rule matched everything, because
 * "Pizza" sits inside half the city.
 */
export const MIN_CONTAINED_NAME_LENGTH = 8

/**
 * Lower case, "&" read as "and", a leading "The" dropped, and everything but
 * letters and digits removed. "The Luigi's Pizza & Pasta" and "luigis pizza
 * and pasta" are one key.
 *
 * Letters outside a to z are removed rather than unaccented, because the
 * database writes the same rule and has no unaccent without an extension. The
 * two must agree or a match would depend on which side read the name.
 */
export function duplicateNameKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/^\s*the\s+/, "")
    .replace(/[^a-z0-9]+/g, "")
}

/** The two names count as very close. */
export function namesAreClose(a: string, b: string): boolean {
  if (!a || !b) return false
  if (a === b) return true
  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a]
  return shorter.length >= MIN_CONTAINED_NAME_LENGTH && longer.includes(shorter)
}

/**
 * The digits, and only the last ten of them, so "+1 (416) 555-0100" and
 * "416 555 0100" are one number. Fewer than seven digits is not a phone number
 * worth comparing and has no key.
 */
export function duplicatePhoneKey(phone: string): string {
  const digits = phone.replace(/\D/g, "")
  return digits.length >= 7 ? digits.slice(-10) : ""
}

/**
 * Sites a business uses for a page of its own on somebody else's host. The
 * host alone says nothing on these, since every Facebook page shares it, so
 * the first part of the path is kept with it: `facebook.com/luigispizza`.
 */
export const SHARED_WEBSITE_HOSTS = new Set([
  "facebook.com",
  "m.facebook.com",
  "fb.com",
  "instagram.com",
  "linktr.ee",
  "x.com",
  "twitter.com",
  "tiktok.com",
  "youtube.com",
  "linkedin.com",
  "yelp.com",
  "yelp.ca",
  "google.com",
  "maps.google.com",
  "g.page",
  "goo.gl",
  "maps.app.goo.gl",
  "business.site",
  "ubereats.com",
  "doordash.com",
  "skipthedishes.com",
  "opentable.com",
  "opentable.ca",
  "resy.com",
  "tripadvisor.com",
  "tripadvisor.ca",
])

/**
 * The website's host in lower case, without its scheme or a leading "www.".
 * "https://www.Luigis.com/menu" and "luigis.com" are one key. A host with no
 * dot in it is not a website and has no key, and nor does a bare shared host.
 */
export function duplicateWebsiteKey(website: string): string {
  const typed = website
    .trim()
    .toLowerCase()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//, "")
  const parts = /^(?:www\.)?([^/?#:\s]+)(?::\d+)?(?:\/([^/?#\s]*))?/.exec(typed)
  const host = parts?.[1] ?? ""
  if (!host.includes(".")) return ""
  if (!SHARED_WEBSITE_HOSTS.has(host)) return host
  const page = parts?.[2] ?? ""
  return page ? `${host}/${page}` : ""
}

/** The three keys one submission is compared by. */
export type DuplicateKeys = {
  name: string
  phone: string
  website: string
}

export function submissionDuplicateKeys(submission: {
  businessName: string
  phone: string
  website: string
}): DuplicateKeys {
  return {
    name: duplicateNameKey(submission.businessName),
    phone: duplicatePhoneKey(submission.phone),
    website: duplicateWebsiteKey(submission.website),
  }
}

/** What one listing is compared by: its name, and every phone and website on it. */
export type ListingDuplicateKeys = {
  name: string
  phones: Set<string>
  websites: Set<string>
}

/** What matched between one submission and one listing, strongest first. */
export function duplicateMatchKinds(
  submission: DuplicateKeys,
  listing: ListingDuplicateKeys
): DuplicateMatchKind[] {
  const kinds: DuplicateMatchKind[] = []
  if (submission.phone && listing.phones.has(submission.phone)) {
    kinds.push("phone")
  }
  if (submission.website && listing.websites.has(submission.website)) {
    kinds.push("website")
  }
  if (namesAreClose(submission.name, listing.name)) kinds.push("name")
  return kinds
}

const MATCH_WORDS: Record<DuplicateMatchKind, string> = {
  phone: "phone number",
  website: "website",
  name: "name",
}

/**
 * "Same phone number and website." A name match alone says "Very close name",
 * because it is the weakest of the three and the one a chain shares.
 */
export function describeDuplicateMatch(kinds: DuplicateMatchKind[]): string {
  const exact = kinds.filter((kind) => kind !== "name").map((kind) => MATCH_WORDS[kind])
  if (!exact.length) return "Very close name."
  const listed =
    exact.length === 1 ? exact[0] : `${exact.slice(0, -1).join(", ")} and ${exact.at(-1)}`
  return kinds.includes("name")
    ? `Same ${listed}, and a very close name.`
    : `Same ${listed}.`
}
