import { z } from "zod"

/**
 * What a saved segment's rules look like, and how a stored one is read back.
 *
 * Browser safe on purpose: the modal that writes the rules and the server that
 * turns them into a query both read this file, so there is one description of a
 * rule rather than two that drift.
 *
 * Two shapes of segment:
 *
 * - **rules** — conditions saved, people never saved. Worked out fresh every
 *   time anything asks, so somebody who unsubscribes this morning is out of it
 *   this afternoon and nobody had to remember.
 * - **hand-picked** — the people themselves, in `contact_segment_members`, for
 *   the one-off list no rule describes.
 *
 * Conditions are a flat list and **all of them have to be true**. No "or", no
 * brackets. A builder with grouping is a query tool nobody can read back.
 */

/** The four things a contact's status can be — the same list the table checks. */
export const CONTACT_SEGMENT_STATUSES = [
  "subscribed",
  "unsubscribed",
  "bounced",
  "complained",
] as const

export type ContactSegmentStatus = (typeof CONTACT_SEGMENT_STATUSES)[number]

export const SEGMENT_KINDS = ["rules", "static"] as const

export type SegmentKind = (typeof SEGMENT_KINDS)[number]

/** How long a name, a description and a tag may be. */
export const MAX_SEGMENT_NAME_LENGTH = 120
export const MAX_SEGMENT_DESCRIPTION_LENGTH = 500
const MAX_TAG_LENGTH = 100
/** Ten years. Long enough for any real "joined before" rule. */
const MAX_JOINED_DAYS = 3650

const segmentConditionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("tag"),
    operator: z.enum(["includes", "excludes"]),
    tags: z.array(z.string().trim().min(1).max(MAX_TAG_LENGTH)).min(1).max(25),
  }),
  z.object({
    type: z.literal("status"),
    operator: z.enum(["is", "isnt"]),
    status: z.enum(CONTACT_SEGMENT_STATUSES),
  }),
  z.object({
    type: z.literal("source"),
    operator: z.enum(["is", "isnt"]),
    source: z.string().trim().min(1).max(255),
  }),
  z.object({
    type: z.literal("joined"),
    operator: z.enum(["within", "before"]),
    days: z.number().int().min(1).max(MAX_JOINED_DAYS),
  }),
  z.object({
    type: z.literal("account"),
    operator: z.enum(["has", "hasnt"]),
  }),
  z.object({
    type: z.literal("plan"),
    operator: z.enum(["is", "isnt"]),
    planSlug: z.string().trim().min(1).max(50),
  }),
  z.object({
    type: z.literal("notIn"),
    segmentIds: z.array(z.string().min(1).max(36)).min(1).max(25),
  }),
])

export type SegmentCondition = z.infer<typeof segmentConditionSchema>

export type SegmentConditionType = SegmentCondition["type"]

/**
 * More than this and the list stops being something anybody can read back,
 * which is the whole reason there is no "or" either.
 */
export const MAX_SEGMENT_CONDITIONS = 20

export const segmentRulesSchema = z.object({
  conditions: z.array(segmentConditionSchema).max(MAX_SEGMENT_CONDITIONS),
})

export type SegmentRules = z.infer<typeof segmentRulesSchema>

/**
 * The rules of a segment whose saved conditions could not be read at all.
 *
 * A contact's status is one thing at a time, so "on the list and also opted
 * out" is true of nobody. That is deliberate: it matches nobody without needing
 * a second flag every caller would have to remember to check.
 */
function rulesUnreadable(): SegmentRules {
  return {
    conditions: [
      { type: "status", operator: "is", status: "subscribed" },
      { type: "status", operator: "is", status: "unsubscribed" },
    ],
  }
}

/**
 * Reads the stored `rules` column, dropping any condition that no longer
 * validates.
 *
 * Dropping rather than refusing is the same call `parseAudienceFilter` makes,
 * with one difference that matters: a dropped condition makes a segment
 * **wider**, and "wider" is the one direction a mailing list must never move on
 * its own. So a segment that had conditions and now has none matches nobody
 * instead of everybody — see `rulesUnreadable`.
 */
export function parseSegmentRules(value: unknown): SegmentRules {
  const parsed = segmentRulesSchema.safeParse(value)
  if (parsed.success) return parsed.data

  // The whole column is unreadable — not even a list. Everything is dropped,
  // and the marker below is what stops that reading as "everybody".
  if (!value || typeof value !== "object" || !("conditions" in value)) {
    return rulesUnreadable()
  }

  const raw = (value as { conditions?: unknown }).conditions
  if (!Array.isArray(raw)) return rulesUnreadable()

  const conditions: SegmentCondition[] = []
  for (const entry of raw) {
    const condition = segmentConditionSchema.safeParse(entry)
    if (condition.success) conditions.push(condition.data)
  }

  // Every condition was thrown away. Saying "no conditions" here would hand
  // back the whole contact list, so say "nobody" instead.
  if (raw.length > 0 && conditions.length === 0) return rulesUnreadable()

  return { conditions: conditions.slice(0, MAX_SEGMENT_CONDITIONS) }
}

/**
 * The real things a rule may name, so the builder can only ever offer tags,
 * sources, plans and segments that exist.
 *
 * Both screens that build rules — the segment window and the contacts list's
 * filters — are handed this same shape by their loader.
 */
export type SegmentRuleOptions = {
  tags: string[]
  sources: string[]
  plans: { slug: string; name: string }[]
  segments: { id: string; name: string }[]
}

/**
 * Reads a rule list off a page's address, and gives back nothing at all when it
 * does not read cleanly.
 *
 * Deliberately *not* `parseSegmentRules`. That one is for a saved segment, where
 * a half-read rule must never widen who gets an email, so it falls back to
 * "nobody". This is a list filter — nothing is sent from it — and there the
 * honest fallback for a hand-mangled address is "no filter at all" rather than
 * an empty page nobody can explain.
 */
export function readSegmentRulesParam(value: unknown): SegmentRules | undefined {
  if (value === undefined || value === null) return undefined
  const parsed = segmentRulesSchema.safeParse(value)
  if (!parsed.success || parsed.data.conditions.length === 0) return undefined
  return parsed.data
}

/** What each kind of condition is called in the "Add a rule" menu. */
export const segmentConditionLabels: Record<SegmentConditionType, string> = {
  tag: "Tag",
  status: "Status",
  source: "Where they came from",
  joined: "When they joined",
  account: "Has an account",
  plan: "Plan",
  notIn: "Not in another segment",
}

/** What a contact's status is called on screen — the contacts page's words. */
export const segmentStatusLabels: Record<ContactSegmentStatus, string> = {
  subscribed: "On the list",
  unsubscribed: "Opted out",
  bounced: "Bouncing",
  complained: "Marked it spam",
}

/** A fresh condition of each kind, for the moment one is added to the list. */
export function newSegmentCondition(
  type: SegmentConditionType
): SegmentCondition {
  switch (type) {
    case "tag":
      return { type: "tag", operator: "includes", tags: [] }
    case "status":
      return { type: "status", operator: "is", status: "subscribed" }
    case "source":
      return { type: "source", operator: "is", source: "" }
    case "joined":
      return { type: "joined", operator: "within", days: 30 }
    case "account":
      return { type: "account", operator: "has" }
    case "plan":
      return { type: "plan", operator: "is", planSlug: "" }
    case "notIn":
      return { type: "notIn", segmentIds: [] }
  }
}

/**
 * The conditions a brand-new rules segment starts with.
 *
 * One rule, and it is the one somebody almost always means: people who are
 * still on the list. It is a visible row they can delete, not a hidden extra —
 * a segment counts exactly what its rules say and nothing more, so the number
 * on the page is one anybody can check by hand on the contacts list.
 */
export function defaultSegmentRules(): SegmentRules {
  return {
    conditions: [{ type: "status", operator: "is", status: "subscribed" }],
  }
}

/** One condition in plain words, for the row summary and the list page. */
export function describeSegmentCondition(
  condition: SegmentCondition,
  segmentNames: Record<string, string> = {}
): string {
  switch (condition.type) {
    case "tag":
      return condition.operator === "includes"
        ? `tagged ${condition.tags.join(" or ")}`
        : `not tagged ${condition.tags.join(" or ")}`
    case "status":
      return condition.operator === "is"
        ? segmentStatusLabels[condition.status].toLowerCase()
        : `not ${segmentStatusLabels[condition.status].toLowerCase()}`
    case "source":
      return condition.operator === "is"
        ? `came from ${condition.source}`
        : `did not come from ${condition.source}`
    case "joined":
      return condition.operator === "within"
        ? `joined in the last ${condition.days} days`
        : `joined more than ${condition.days} days ago`
    case "account":
      return condition.operator === "has"
        ? "has an account"
        : "has no account"
    case "plan":
      return condition.operator === "is"
        ? `on the ${condition.planSlug} plan`
        : `not on the ${condition.planSlug} plan`
    case "notIn":
      return `not in ${condition.segmentIds
        .map((id) => segmentNames[id] ?? "a deleted segment")
        .join(" or ")}`
  }
}

/** A whole segment in one line, for the list page's second row of text. */
export function describeSegmentRules(
  rules: SegmentRules,
  segmentNames: Record<string, string> = {}
): string {
  // No rules is not "nobody" — it is every contact in the workspace, opted-out
  // people included. Saying so out loud is the point.
  if (rules.conditions.length === 0) return "Every contact, with no rules"
  return rules.conditions
    .map((condition) => describeSegmentCondition(condition, segmentNames))
    .join(", and ")
}

/**
 * Whether a condition is finished enough to save.
 *
 * The builder starts a tag, source, plan or "not in" row empty, and an empty
 * one would either match nobody or — worse — quietly drop out and widen the
 * segment. Saying so before the save is the only place this can be caught while
 * the words are still on screen.
 */
export function segmentConditionIsComplete(condition: SegmentCondition) {
  switch (condition.type) {
    case "tag":
      return condition.tags.length > 0
    case "source":
      return condition.source.trim().length > 0
    case "plan":
      return condition.planSlug.trim().length > 0
    case "notIn":
      return condition.segmentIds.length > 0
    default:
      return true
  }
}

/**
 * Whether a draft reaches enough of the whole list to deserve a gentle nudge.
 *
 * Four in five matches the existing automation-audience warning. Nobody is
 * not nearly everyone, and neither is any share of an empty contact list.
 */
export function segmentCountIsNearlyEveryone(
  matching: number,
  everyone: number
): boolean {
  return everyone > 0 && matching > 0 && matching >= everyone * 0.8
}

/** Every segment a set of rules points at, so a loop can be looked for. */
export function segmentReferences(rules: SegmentRules): string[] {
  const ids = new Set<string>()
  for (const condition of rules.conditions) {
    if (condition.type === "notIn") {
      condition.segmentIds.forEach((id) => ids.add(id))
    }
  }
  return [...ids]
}
