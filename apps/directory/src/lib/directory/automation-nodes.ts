import {
  BadgeCheckIcon,
  CalendarClockIcon,
  InboxIcon,
  MailIcon,
  StoreIcon,
} from "lucide-react"
import { z } from "zod"

import { defineNode } from "@/lib/automations/node-descriptor"
import { plural } from "@/lib/format/plural"

/**
 * The directory's own starting points on the automation canvas, and the one
 * step that can write about them.
 *
 * Four triggers: a submission arrived, a submission was approved, a claim was
 * approved, and a featured spot ends in some number of days. What starts them
 * is `server/directory/automation-events.ts`; this file is how they draw, and
 * the browser reads it.
 *
 * **Each run is about the person the event is about**: the submitter, the
 * claimant, or whoever bought the featured spot. Tyler's call on 16 Oct 2026:
 * they go into the site's People list as a contact, so the shell's own Send
 * email step reaches them too.
 *
 * **The details a run carries** are its trigger facts, and the "Email about
 * the listing" step below fills them into its subject and body:
 * `{{listingTitle}}`, `{{listingLink}}`, `{{name}}`, `{{email}}`,
 * `{{siteName}}`, `{{siteLink}}`, and `{{featuredEndsOn}}` on the featured
 * trigger. Tyler asked for a CMS-only step rather than a change to the
 * shell's email step.
 */

export const SUBMISSION_ARRIVED_KIND = "directorySubmissionArrived"
export const SUBMISSION_APPROVED_KIND = "directorySubmissionApproved"
export const CLAIM_APPROVED_KIND = "directoryClaimApproved"
export const FEATURED_ENDING_KIND = "directoryFeaturedEnding"
export const DIRECTORY_EMAIL_KIND = "directoryEmail"

/** How far ahead of a featured spot's end the trigger can look. */
export const FEATURED_ENDING_DAYS = { min: 1, max: 30, default: 7 } as const

/** The days the dropdown offers. A saved number outside the list is kept. */
export const FEATURED_ENDING_CHOICES = [1, 2, 3, 5, 7, 14, 30] as const

export function readFeaturedDaysBefore(
  settings: Record<string, unknown>
): number {
  const days = settings.daysBefore
  return typeof days === "number" &&
    Number.isInteger(days) &&
    days >= FEATURED_ENDING_DAYS.min &&
    days <= FEATURED_ENDING_DAYS.max
    ? days
    : FEATURED_ENDING_DAYS.default
}

/** Every trigger here, so "is this one of ours" has one answer. */
export const DIRECTORY_TRIGGER_KINDS = [
  SUBMISSION_ARRIVED_KIND,
  SUBMISSION_APPROVED_KIND,
  CLAIM_APPROVED_KIND,
  FEATURED_ENDING_KIND,
] as const

export type DirectoryTriggerKind = (typeof DIRECTORY_TRIGGER_KINDS)[number]

/** How each one names itself on its card and in a run's history. */
export const DIRECTORY_TRIGGER_LABELS: Record<DirectoryTriggerKind, string> = {
  [SUBMISSION_ARRIVED_KIND]: "Submission arrived",
  [SUBMISSION_APPROVED_KIND]: "Submission approved",
  [CLAIM_APPROVED_KIND]: "Claim approved",
  [FEATURED_ENDING_KIND]: "Featured spot ending",
}

/**
 * The longer sentence each settings panel shows. The featured one says out
 * loud that the built-in reminder emails still go, so nobody is surprised by
 * the owner getting two.
 */
export const DIRECTORY_TRIGGER_HINTS: Record<DirectoryTriggerKind, string> = {
  [SUBMISSION_ARRIVED_KIND]:
    "Starts once for each new listing somebody sends in, when they confirm their email address and it reaches the review queue. The person is the address that sent it in. There is no listing yet, so the listing link is empty.",
  [SUBMISSION_APPROVED_KIND]:
    "Starts once when an admin approves a submission and it becomes a published listing. The person is the address that sent it in. The submitter's own approval email still goes as before.",
  [CLAIM_APPROVED_KIND]:
    "Starts once when an admin approves somebody's claim on a listing. The person is the new owner, at the address they proved when claiming. The built-in \"you now look after\" email still goes as before.",
  [FEATURED_ENDING_KIND]:
    "Starts once for each featured spot, when it has this many days left. The person is whoever bought the spot. The built-in renewal reminders still go as well, so a flow here can mean the owner gets two emails about the same spot.",
}

/** Settings a trigger with nothing to set saves, so its schema is honest. */
const NO_SETTINGS = z.object({})

function directoryTrigger(
  kind: Exclude<DirectoryTriggerKind, typeof FEATURED_ENDING_KIND>,
  paletteKey: string,
  description: string,
  icon: typeof InboxIcon
) {
  return defineNode({
    kind,
    palette: { key: paletteKey, group: "Triggers", description },
    createSettings: () => ({}),
    settingsSchema: NO_SETTINGS,
    name: () => DIRECTORY_TRIGGER_LABELS[kind],
    description: () => description,
    icon,
    outputPorts: [{ id: "then", label: "Then" }],
    hasInput: false,
    // Pressing Run has no submission or claim to hand the flow.
    manualStart: false,
    connectionError: () => null,
    fields: () => import("@/components/directory/automations/trigger-panel"),
  })
}

const submissionArrivedNode = directoryTrigger(
  SUBMISSION_ARRIVED_KIND,
  "trigger-directory-submission-arrived",
  "Starts when somebody sends in a new listing",
  InboxIcon
)

const submissionApprovedNode = directoryTrigger(
  SUBMISSION_APPROVED_KIND,
  "trigger-directory-submission-approved",
  "Starts when a sent-in listing is approved",
  StoreIcon
)

const claimApprovedNode = directoryTrigger(
  CLAIM_APPROVED_KIND,
  "trigger-directory-claim-approved",
  "Starts when somebody's claim on a listing is approved",
  BadgeCheckIcon
)

const featuredEndingNode = defineNode({
  kind: FEATURED_ENDING_KIND,
  palette: {
    key: "trigger-directory-featured-ending",
    group: "Triggers",
    description: "Starts a set number of days before a featured spot ends",
  },
  createSettings: () => ({ daysBefore: FEATURED_ENDING_DAYS.default }),
  settingsSchema: z.object({
    daysBefore: z
      .number()
      .int()
      .min(FEATURED_ENDING_DAYS.min)
      .max(FEATURED_ENDING_DAYS.max),
  }),
  name: () => DIRECTORY_TRIGGER_LABELS[FEATURED_ENDING_KIND],
  description: (settings) => {
    const days = readFeaturedDaysBefore(settings)
    return `Starts when a featured spot has ${days} ${plural(days, "day", "days")} left.`
  },
  icon: CalendarClockIcon,
  outputPorts: [{ id: "then", label: "Then" }],
  hasInput: false,
  manualStart: false,
  connectionError: () => null,
  fields: () => import("@/components/directory/automations/trigger-panel"),
})

/** The words the email step can fill in, and what each one becomes. */
export const DIRECTORY_EMAIL_PLACEHOLDERS = [
  { token: "{{name}}", meaning: "The person's name, when they gave one" },
  { token: "{{email}}", meaning: "The person's email address" },
  { token: "{{listingTitle}}", meaning: "The listing's name" },
  {
    token: "{{listingLink}}",
    meaning: "The listing's page. Empty for a submission not yet approved",
  },
  { token: "{{siteName}}", meaning: "This site's name" },
  { token: "{{siteLink}}", meaning: "This site's front page" },
  {
    token: "{{featuredEndsOn}}",
    meaning: "The day a featured spot ends. Empty for the other triggers",
  },
] as const

export const DIRECTORY_EMAIL_SUBJECT_MAX = 200
export const DIRECTORY_EMAIL_BODY_MAX = 5_000

type DirectoryEmailSettings = { subject: string; body: string }

export function readDirectoryEmailSettings(
  settings: Record<string, unknown>
): DirectoryEmailSettings {
  const text = (value: unknown) => (typeof value === "string" ? value : "")
  return { subject: text(settings.subject), body: text(settings.body) }
}

/**
 * A plain email to the person the run is about, with the listing's details
 * filled in. Plain lines and one link, the same as the directory's own
 * emails, so whatever a submitter typed can only ever be text.
 */
const directoryEmailNode = defineNode({
  kind: DIRECTORY_EMAIL_KIND,
  palette: {
    key: "step-directory-email",
    group: "Actions",
    description: "Email the person a directory trigger is about, with the listing filled in",
  },
  createSettings: () => ({
    subject: "Welcome to {{siteName}}",
    body: "Hi {{name}},\n\nThanks for looking after {{listingTitle}}. You can see it here: {{listingLink}}",
  }),
  // Strict at compile time only: a half-written email still saves.
  settingsSchema: z.object({
    subject: z
      .string()
      .trim()
      .min(1, "Give the email a subject.")
      .max(DIRECTORY_EMAIL_SUBJECT_MAX, "That subject is too long."),
    body: z
      .string()
      .trim()
      .min(1, "Write the email.")
      .max(DIRECTORY_EMAIL_BODY_MAX, "That email is too long."),
  }),
  name: () => "Email about the listing",
  description: (settings) => {
    const { subject } = readDirectoryEmailSettings(settings)
    return subject.trim()
      ? `Sends “${subject.trim()}”.`
      : "Emails the person this flow is about."
  },
  icon: MailIcon,
  outputPorts: [{ id: "then", label: "Then" }],
  hasInput: true,
  connectionError: () => null,
  fields: () => import("@/components/directory/automations/directory-email-panel"),
})

export const DIRECTORY_AUTOMATION_NODES = [
  submissionArrivedNode,
  submissionApprovedNode,
  claimApprovedNode,
  featuredEndingNode,
  directoryEmailNode,
]
