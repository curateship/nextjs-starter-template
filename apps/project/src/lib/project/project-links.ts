import { z } from "zod"

/**
 * A project's links, under its description (Misc 5, Tyler, 2 Nov 2026: "Add
 * url fields for projects with custom label and put it under the discription
 * field. Also add a section divider label. Add draggable ability to arrange
 * the url fields and divider"). The list is kept whole on the project, in the
 * order it was dragged into, and saved whole.
 */
export type ProjectLink =
  | { id: string; kind: "link"; label: string; url: string }
  | { id: string; kind: "divider"; label: string }

export const PROJECT_LINK_LIMITS = { label: 60, url: 2048, count: 50 } as const

/** Only web addresses, so a link can never run a script when it is pressed. */
export function isWebAddress(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === "https:" || url.protocol === "http:"
  } catch {
    return false
  }
}

/**
 * What was typed in a link's address box, as the address to save: "acme.com"
 * gains "https://". Null when it still isn't a web address.
 */
export function readWebAddress(typed: string): string | null {
  const text = typed.trim()
  if (!text) return null
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`
  return isWebAddress(withScheme) ? withScheme : null
}

/** What a link shows: its label, or its address without "https://" when it has none. */
export function linkText(link: { label: string; url: string }) {
  return link.label || link.url.replace(/^https?:\/\//, "")
}

const linkId = z.string().min(1).max(36)
const label = z
  .string()
  .trim()
  .max(PROJECT_LINK_LIMITS.label, `A label can be at most ${PROJECT_LINK_LIMITS.label} characters.`)

export const projectLinksSchema = z
  .array(
    z.discriminatedUnion("kind", [
      z.object({
        id: linkId,
        kind: z.literal("link"),
        label,
        url: z
          .string()
          .trim()
          .max(PROJECT_LINK_LIMITS.url, `An address can be at most ${PROJECT_LINK_LIMITS.url} characters.`)
          .refine(isWebAddress, "Type a web address starting with https://."),
      }),
      z.object({ id: linkId, kind: z.literal("divider"), label: label.min(1, "Give the divider a label.") }),
    ])
  )
  .max(PROJECT_LINK_LIMITS.count, `A project can have at most ${PROJECT_LINK_LIMITS.count} links and dividers.`)
