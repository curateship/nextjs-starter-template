import { UsersIcon } from "lucide-react"
import { z } from "zod"

import {
  MEMBER_TAG_MAX_LENGTH,
  MEMBER_TAG_SEPARATOR,
  normalizeMemberTag,
} from "@/lib/member-tags"

import { defineNode } from "../node-descriptor"

/**
 * Who a flow touches.
 *
 * The choice is stored; the people never are. The step works out who matches
 * the moment it runs, so somebody who cancelled since the last run is simply
 * not there this time, and nobody has to keep a list up to date by hand.
 */
export const AUDIENCE_KINDS = [
  "everyone",
  "segment",
  "accounts",
  "registered",
  "paying",
  "plan",
  "tag",
] as const

export type AutomationAudienceKind = (typeof AUDIENCE_KINDS)[number]

/**
 * The two lists an audience reads, which never mix (Tyler, 9 Nov 2026:
 * "users and subscribers are also seperate"). Subscribers are the mailing
 * list, people added by hand or imported; accounts are everyone who signed
 * up, emailed at their own address.
 */
export type AudienceList = "subscribers" | "accounts"

export const AUDIENCE_LIST: Record<AutomationAudienceKind, AudienceList> = {
  everyone: "subscribers",
  segment: "subscribers",
  accounts: "accounts",
  registered: "accounts",
  paying: "accounts",
  plan: "accounts",
  tag: "accounts",
}

/** The dropdown's words, and the words the run history uses. */
export const AUDIENCE_LABELS: Record<AutomationAudienceKind, string> = {
  everyone: "Every subscriber",
  segment: "The subscribers in a segment",
  accounts: "Every account",
  registered: "Accounts that confirmed their email",
  paying: "Accounts paying for any plan",
  plan: "Accounts on one plan",
  tag: "Accounts with a member tag",
}

export const AUDIENCE_HINTS: Record<AutomationAudienceKind, string> = {
  everyone:
    "Everyone on the mailing list who has not opted out: people added by hand or imported. Accounts are not on it.",
  segment: "Whoever is in the segment you pick, at the moment the flow runs.",
  accounts:
    "Everyone who signed up, emailed at their own address, unless they turned automated mail off.",
  registered:
    "Only accounts that have clicked the link in their sign-up email.",
  paying: "Accounts whose paid plan is running right now, on any plan.",
  plan: "Accounts paying for the one plan you pick below.",
  tag: "Accounts carrying the exact member tag you enter below.",
}

/**
 * The one sentence fragment that names an audience, used by the node card, the
 * inspector heading and every line the run history writes — so the canvas and
 * the history can never describe the same choice two different ways.
 */
export function audienceWording(
  kind: AutomationAudienceKind,
  planSlug: string,
  segmentName = "",
  tag = ""
): string {
  if (kind === "plan") {
    return planSlug
      ? `accounts paying for the "${planSlug}" plan`
      : "a plan nobody has picked yet"
  }
  if (kind === "segment") {
    return segmentName
      ? `the subscribers in the "${segmentName}" segment`
      : "a segment nobody has picked yet"
  }
  if (kind === "tag") {
    return tag
      ? `accounts with the “${tag}” tag`
      : "a tag nobody has entered yet"
  }
  return AUDIENCE_LABELS[kind].toLowerCase()
}

/**
 * How much of the whole contact list a choice has to cover before the panel
 * says so out loud.
 *
 * A nudge, not a rule — nothing is blocked. It exists for the "oops, that's
 * everyone" moment, which is only worth catching while the flow is still a
 * draft. Four in five is high enough that a real, narrower audience does not
 * keep tripping it.
 */
const MOST_OF_THE_LIST = 0.8

/**
 * Whether a count is so close to the whole list that it is worth saying.
 *
 * The widest choice is deliberately not asked about: "everyone" reaching
 * everyone is not news.
 */
export function audienceIsMostOfTheList(
  kind: AutomationAudienceKind,
  total: number,
  everyone: number
): boolean {
  // The widest choice of each list is not compared with itself.
  if (kind === "everyone" || kind === "accounts") return false
  return everyone > 0 && total > 0 && total >= everyone * MOST_OF_THE_LIST
}

export function isAudienceKind(
  value: unknown
): value is AutomationAudienceKind {
  return (
    typeof value === "string" &&
    (AUDIENCE_KINDS as readonly string[]).includes(value)
  )
}

/**
 * The plan is held by its short id rather than its row id, because that is what
 * survives: a plan re-seeded on another database keeps its `pro`, and the flow
 * still means the same thing. The step fails out loud if no plan answers to it
 * rather than quietly matching nobody.
 */
export const audienceNode = defineNode({
  kind: "audience",
  palette: {
    key: "flow-audience",
    group: "Flow",
    description: "Decide who the rest of the flow is about",
  },
  createSettings: () => ({
    audience: "everyone",
    planSlug: "",
    segmentId: "",
    segmentName: "",
    tag: "",
  }),
  settingsSchema: z
    .object({
      audience: z.enum(AUDIENCE_KINDS),
      // Bounded to the plans column's width, and no format rule beyond that:
      // the value comes from a dropdown of real plans, and a graph hand-edited
      // to name something else already gets a far better answer from the run
      // itself ("No plan with the id … exists any more") than a complaint about
      // its shape would give.
      planSlug: z.string().trim().max(50).default(""),
      // The segment's row id — the one thing the run looks up, same reasoning
      // as the plan slug above.
      segmentId: z.string().trim().max(36).default(""),
      // Display only, so the node card can say the segment's name without a
      // trip to the database. The run never trusts it: who the flow means is
      // always looked up by id, so a renamed segment still means the same
      // people even while the card shows its old name.
      segmentName: z.string().trim().max(120).default(""),
      tag: z
        .string()
        .trim()
        .max(MEMBER_TAG_MAX_LENGTH)
        .refine((tag) => !tag.includes(MEMBER_TAG_SEPARATOR), {
          message: "A member tag cannot contain a comma.",
        })
        .transform(normalizeMemberTag)
        .default(""),
    })
    // No `path` on purpose: the compiler prefixes a message with the field it
    // came from, and "planSlug: …" is code-speak in a panel that otherwise
    // speaks English.
    .refine(
      (settings) => settings.audience !== "plan" || settings.planSlug !== "",
      { message: "Pick which plan this step means." }
    )
    .refine(
      (settings) =>
        settings.audience !== "segment" || settings.segmentId !== "",
      { message: "Pick which segment this step means." }
    )
    .refine((settings) => settings.audience !== "tag" || settings.tag !== "", {
      message: "Enter which member tag this step means.",
    }),
  name: () => "Audience",
  // Display only, so an unreadable choice reads as the default rather than
  // taking the card down. What must never happen is a *run* quietly falling
  // back like this — see `readAutomationAudience`.
  description: (settings) => {
    const wording = audienceWording(
      isAudienceKind(settings.audience) ? settings.audience : "everyone",
      typeof settings.planSlug === "string" ? settings.planSlug.trim() : "",
      typeof settings.segmentName === "string"
        ? settings.segmentName.trim()
        : "",
      typeof settings.tag === "string" ? normalizeMemberTag(settings.tag) : ""
    )
    return wording.charAt(0).toUpperCase() + wording.slice(1)
  },
  icon: UsersIcon,
  outputPorts: [{ id: "then", label: "Then" }],
  hasInput: true,
  connectionError: () => null,
  fields: () => import("@/components/automations/nodes/audience-panel"),
})
