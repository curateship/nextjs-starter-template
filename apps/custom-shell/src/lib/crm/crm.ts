/**
 * What a lead, a thread and a message ARE, in types both sides can read.
 *
 * The browser needs the stage list to draw the dropdown and the server needs it
 * to refuse anything else, so it lives here rather than in either.
 */

/** How far along a lead is. The order is the order they are drawn in. */
export const CRM_STAGES = [
  "new",
  "contacted",
  "quoted",
  "won",
  "lost",
] as const

export type CrmStage = (typeof CRM_STAGES)[number]

/**
 * What each stage is called on screen.
 *
 * Plain words on purpose. "Qualified" and "In pipeline" are sales jargon for
 * things a person would say differently.
 */
export const CRM_STAGE_LABELS: Record<CrmStage, string> = {
  new: "New",
  contacted: "Contacted",
  quoted: "Quoted",
  won: "Won",
  lost: "Lost",
}

/**
 * What is happening with a thread.
 *
 * `snoozed` is "not now, ask me again later" and carries its own date;
 * `closed` is done with. Neither deletes anything.
 */
export const CRM_THREAD_STATUSES = ["open", "snoozed", "closed"] as const

export type CrmThreadStatus = (typeof CRM_THREAD_STATUSES)[number]

export const CRM_THREAD_STATUS_LABELS: Record<CrmThreadStatus, string> = {
  open: "Open",
  snoozed: "Snoozed",
  closed: "Closed",
}

/** Which way one email went. */
export type CrmDirection = "in" | "out"

/**
 * One file that came with an email.
 *
 * The file itself stays with Resend. This is what the conversation can show
 * about it without fetching anything: what it is called, how big it is, and
 * the id needed to ask for it later.
 */
export type CrmAttachment = {
  id: string
  filename: string
  contentType: string | null
  /** Bytes, when the provider said. Null when it did not. */
  size: number | null
}

/** The most money a lead can be worth: $10,000,000, in cents. */
export const CRM_MAX_VALUE_CENTS = 1_000_000_000

/** The longest a note or a reply may be, in characters. */
export const CRM_MAX_BODY_LENGTH = 20_000

/** How many threads one page of the inbox holds. */
export const CRM_INBOX_PAGE_SIZE = 30

/**
 * The most conversations one ticked-rows press may carry.
 *
 * Ticks only ever come from rows on screen, and the inbox loads 30 at a time,
 * so 200 is seven presses of Load more with every row ticked. It is here so
 * the bar can say so in words instead of the request coming back with a
 * validation refusal nobody can read.
 */
export const CRM_MAX_THREADS_PER_PRESS = 200
