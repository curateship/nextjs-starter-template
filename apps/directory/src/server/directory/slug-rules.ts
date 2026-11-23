import { slugProblem } from "@/lib/directory/slugs"

/**
 * The two rules every addressable thing here shares: a hand-picked address is
 * refused when it is taken, and a derived one is numbered until it is free.
 *
 * Only the lookup differs between listings and categories — different table,
 * same question — so that is the part each caller passes in. Written this way
 * rather than as one clever helper over both tables: "is this slug taken"
 * is three lines of drizzle that read better next to the table they ask about
 * than behind a generic wrapper.
 */

type Noun = { one: string; many: string }

/** Refuses a taken or malformed address, in words the admin can act on. */
export async function requireFreeSlug(
  slug: string,
  isTaken: (candidate: string) => Promise<boolean>,
  noun: Noun
): Promise<void> {
  const problem = slugProblem(slug)
  if (problem) throw new Error(problem)
  if (await isTaken(slug)) {
    throw new Error(`Another ${noun.one} already uses the address ${slug}.`)
  }
}

/**
 * The wanted address if it is free, and otherwise the first numbered variant
 * that is. Used where nobody picked the address by hand — creating from a
 * title, copying a listing — so a name clash costs nothing.
 */
export async function firstFreeSlug(
  wanted: string,
  isTaken: (candidate: string) => Promise<boolean>,
  noun: Noun
): Promise<string> {
  if (!(await isTaken(wanted))) return wanted

  for (let attempt = 2; attempt <= 50; attempt += 1) {
    // Trimmed before the suffix so the result still fits the column.
    const candidate = `${wanted.slice(0, 150)}-${attempt}`
    if (!(await isTaken(candidate))) return candidate
  }

  // Fifty variants taken is not a numbering problem any more.
  throw new Error(`Too many ${noun.many} already use the address ${wanted}.`)
}
