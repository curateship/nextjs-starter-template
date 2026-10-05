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
 * Conditions are one flat list. The whole list can require every rule or any
 * one rule, but there are no nested groups or brackets.
 */

/** The five things a contact's status can be — the same list the table checks. */
export const CONTACT_SEGMENT_STATUSES = [
  "subscribed",
  "unsubscribed",
  "bounced",
  "complained",
  "cold",
] as const

export type ContactSegmentStatus = (typeof CONTACT_SEGMENT_STATUSES)[number]

export const SEGMENT_KINDS = ["rules", "static"] as const

export type SegmentKind = (typeof SEGMENT_KINDS)[number]

/** How long a name, a description and a tag may be. */
export const MAX_SEGMENT_NAME_LENGTH = 120
export const MAX_SEGMENT_DESCRIPTION_LENGTH = 500
const MAX_TAG_LENGTH = 100
/**
 * Ten years. Long enough for any real "joined before" or "not emailed in"
 * rule, and short enough that a mistyped number is refused rather than saved.
 */
export const MAX_RULE_DAYS = 3650

/**
 * The most recent emails an "opened any of the last N" rule can look back
 * over.
 *
 * Fifty, the same ceiling as the gone-quiet rule, because they ask the same
 * question of the same rows and two different limits would be two answers to
 * "how far back does recent go".
 */
export const MAX_RULE_EMAILS = 50

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
    days: z.number().int().min(1).max(MAX_RULE_DAYS),
  }),
  /**
   * When they were last sent something.
   *
   * `days` is carried even by "never", where it means nothing, so switching
   * the operator back and forth does not lose the number somebody typed. The
   * rule reads sends, not opens — a separate thing, and not to be merged with
   * this one.
   */
  z.object({
    type: z.literal("emailed"),
    operator: z.enum(["within", "before", "never"]),
    days: z.number().int().min(1).max(MAX_RULE_DAYS),
  }),
  /**
   * When they last opened or clicked anything you sent.
   *
   * Opens AND clicks, which is what makes it "engaged" rather than "opened".
   * An open is a hidden image, so a mail client that blocks pictures reports
   * nothing on a message somebody read and clicked a link in. A click cannot
   * happen by accident, so it is the stronger of the two, and a rule that
   * ignored it would call that person unengaged.
   *
   * Counted in days, like "when they joined". The rule below counts emails
   * instead, which is the real difference between the two.
   */
  z.object({
    type: z.literal("engaged"),
    operator: z.enum(["within", "before", "never"]),
    days: z.number().int().min(1).max(MAX_RULE_DAYS),
  }),
  /**
   * Whether they opened any of the last few things you sent them.
   *
   * No clock at all: "the last 5 emails" are the last 5 you sent that person,
   * whenever that was. Stop sending for six months and nobody falls out of this
   * rule, because the last five are still the same five. That is what makes it
   * the re-engagement rule rather than the one above — it follows your sending
   * instead of the calendar.
   *
   * Opens only. A click without an open does not count here, which is the
   * deliberate difference from `engaged`.
   */
  z.object({
    type: z.literal("opened"),
    operator: z.enum(["has", "hasnt"]),
    emails: z.number().int().min(1).max(MAX_RULE_EMAILS),
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
    type: z.literal("in"),
    segmentIds: z.array(z.string().min(1).max(36)).min(1).max(25),
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
  match: z.enum(["all", "any"]).optional(),
  conditions: z.array(segmentConditionSchema).max(MAX_SEGMENT_CONDITIONS),
})

export type SegmentRules = z.infer<typeof segmentRulesSchema>

/** Old rows have no mode field and keep their original all-rules meaning. */
export function segmentRulesMatch(rules: SegmentRules): "all" | "any" {
  return rules.match ?? "all"
}

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
  emailed: "When they were last emailed",
  engaged: "When they last opened or clicked",
  opened: "Opens in their last few emails",
  account: "Has an account",
  plan: "Plan",
  in: "In another segment",
  notIn: "Not in another segment",
}

/** What a contact's status is called on screen — the contacts page's words. */
export const segmentStatusLabels: Record<ContactSegmentStatus, string> = {
  subscribed: "On the list",
  unsubscribed: "Opted out",
  bounced: "Bouncing",
  complained: "Marked it spam",
  cold: "Gone quiet",
}

/**
 * How each status is drawn wherever one is shown as a badge.
 *
 * Gone quiet is `outline`, not `destructive`. Red says something went wrong, and
 * nothing did: they are still on the list and still being mailed. The three
 * that really are a problem keep the red.
 */
export const segmentStatusBadgeVariant: Record<
  ContactSegmentStatus,
  "secondary" | "destructive" | "outline"
> = {
  subscribed: "secondary",
  unsubscribed: "destructive",
  bounced: "destructive",
  complained: "destructive",
  cold: "outline",
}

/**
 * What to say after somebody's status was set by hand.
 *
 * A sentence each rather than "is now " plus the label, because the labels are
 * not written to finish that sentence: "is now marked it spam" is not English,
 * and a message an admin has to re-read is worse than no message.
 *
 * `%s` is the address, and callers substitute it with a function rather than a
 * string — a `$` in a local part is legal, and `String.replace` reads `$&` and
 * friends in a string replacement as instructions.
 */
export const segmentStatusSaidDone: Record<ContactSegmentStatus, string> = {
  subscribed: "%s is back on the list.",
  unsubscribed: "%s will not get any more.",
  bounced: "%s is marked as bouncing.",
  complained: "%s is marked as having reported spam.",
  cold: "%s is marked as gone quiet.",
}

/**
 * What each status means, for the dropdown that sets one by hand.
 *
 * The two the mail provider reports say so, because setting one of those
 * yourself does not make the mail arrive and somebody should be told that
 * before they pick it rather than after.
 */
export const segmentStatusHints: Record<ContactSegmentStatus, string> = {
  subscribed: "They get everything you send.",
  unsubscribed: "They asked to stop. They get nothing.",
  bounced: "Their mail server refused it. Reported by Resend.",
  complained: "They marked a message as spam. Reported by Resend.",
  cold: "They stopped opening. Still mailable, and one open puts them back.",
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
    case "emailed":
      // Ninety days, because the rule this exists for is the re-engagement
      // one — "we have not talked to these people in three months".
      return { type: "emailed", operator: "before", days: 90 }
    case "engaged":
      // Ninety days, to match "when they were last emailed" — the two get
      // written side by side, and a pair of rules with different numbers in
      // them reads as a decision somebody made rather than a default.
      return { type: "engaged", operator: "before", days: 90 }
    case "opened":
      // Seven, the same run the gone-quiet rule uses, so "opened none of the
      // last 7" and "has gone quiet" agree out of the box instead of being two
      // nearly-identical groups.
      return { type: "opened", operator: "hasnt", emails: 7 }
    case "account":
      return { type: "account", operator: "has" }
    case "plan":
      return { type: "plan", operator: "is", planSlug: "" }
    case "in":
      return { type: "in", segmentIds: [] }
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
    case "emailed":
      if (condition.operator === "never") return "never emailed"
      return condition.operator === "within"
        ? `emailed in the last ${condition.days} days`
        : `not emailed in the last ${condition.days} days`
    case "engaged":
      if (condition.operator === "never") return "never opened or clicked"
      return condition.operator === "within"
        ? `opened or clicked in the last ${condition.days} days`
        : `nothing opened or clicked in the last ${condition.days} days`
    case "opened":
      return condition.operator === "has"
        ? `opened one of their last ${condition.emails} emails`
        : `opened none of their last ${condition.emails} emails`
    case "account":
      return condition.operator === "has"
        ? "has an account"
        : "has no account"
    case "plan":
      return condition.operator === "is"
        ? `on the ${condition.planSlug} plan`
        : `not on the ${condition.planSlug} plan`
    case "in":
      return `in ${condition.segmentIds
        .map((id) => segmentNames[id] ?? "a deleted segment")
        .join(" or ")}`
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
  const description = rules.conditions
    .map((condition) => describeSegmentCondition(condition, segmentNames))
    .join(segmentRulesMatch(rules) === "any" ? ", or " : ", and ")
  return segmentRulesMatch(rules) === "any"
    ? `Any of: ${description}`
    : description
}

/**
 * Whether a condition is finished enough to save.
 *
 * The builder starts a tag, source, plan or segment-reference row empty, and
 * an empty one would either match nobody or — worse — quietly drop out and
 * widen the segment. Saying so before the save is the only place this can be
 * caught while the words are still on screen.
 */
export function segmentConditionIsComplete(condition: SegmentCondition) {
  switch (condition.type) {
    case "tag":
      return condition.tags.length > 0
    case "source":
      return condition.source.trim().length > 0
    case "plan":
      return condition.planSlug.trim().length > 0
    case "in":
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
    if (condition.type === "in" || condition.type === "notIn") {
      condition.segmentIds.forEach((id) => ids.add(id))
    }
  }
  return [...ids]
}
