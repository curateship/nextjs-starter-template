import { z } from "zod"

import { segmentRulesSchema } from "@/lib/contacts/contact-segments"

/**
 * How the contacts list describes who it is showing: the words in the search
 * box and the filter rules.
 *
 * One schema, checked in one place, for every server function that takes it —
 * reading the list, deleting everybody matching, and adding everybody matching
 * to a segment. They have to agree on what the filter means down to the letter,
 * because two of those three delete or move real people based on a list nobody
 * enumerated first. A second copy of these two lines is exactly how a delete
 * ends up meaning something slightly wider than the list on screen.
 *
 * `rules` is checked against the same schema a saved segment is, so nothing the
 * browser sends can describe a group the segment builder could not.
 */
export const contactFilterSchema = z.object({
  search: z.string().trim().max(200).optional(),
  rules: segmentRulesSchema.optional(),
})

export type ContactFilterInput = z.input<typeof contactFilterSchema>
