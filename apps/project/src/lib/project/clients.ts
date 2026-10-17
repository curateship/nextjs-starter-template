import { LIMITS } from "@/lib/project/rules"

/**
 * Narrowing work to one client (Features 16 Oct, part 9). A project's client
 * is a name typed by hand, so "Hart Dental" and "hart dental " are one
 * client: names are matched ignoring capitals and spaces at the ends. The
 * choice lives in the page's address, like the other filters.
 */

/** The address value for projects with no client. No client is named "-". */
export const NO_CLIENT_FILTER = "-"

export function clientKey(name: string) {
  return name.trim().toLowerCase()
}

/** True when a project's client is the one picked, or has none when "No client" is picked. */
export function matchesClient(projectClient: string | null | undefined, filter: string) {
  const name = projectClient?.trim() ?? ""
  if (filter === NO_CLIENT_FILTER) return name === ""
  return name !== "" && clientKey(name) === clientKey(filter)
}

/** One name per client, in the spelling seen first, A to Z. */
export function clientChoices(names: readonly (string | null | undefined)[]) {
  const byKey = new Map<string, string>()
  for (const name of names) {
    const shown = name?.trim()
    if (shown && !byKey.has(clientKey(shown))) byKey.set(clientKey(shown), shown)
  }
  return [...byKey.values()].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }))
}

/** The client picked in an address, or nothing for a value that can't be one. */
export function readClientFilter(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined
  const trimmed = value.trim()
  return trimmed && trimmed.length <= LIMITS.clientName ? trimmed : undefined
}

/** "Hart Dental", or "No client". */
export function clientFilterLabel(filter: string) {
  return filter === NO_CLIENT_FILTER ? "No client" : filter
}
