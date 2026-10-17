import { z } from "zod"

import { dayLabel, isRealDay } from "@/lib/project/days"
import { PROJECT_ERRORS } from "@/lib/project/errors"
import { LIMITS, runsTheTeam, type TeamRole } from "@/lib/project/rules"

/**
 * The kinds of field a task type can ask for, and the rules every field
 * follows, shared by the server that checks a value and the screens that draw
 * it. This is the one list of kinds: adding one means adding it here, then
 * its editor in `src/components/project/task-fields-card.tsx`.
 *
 * Tyler's rules are in `workspace/docs/task-types.md` and
 * `workspace/docs/what-this-app-is.md`, which outrank this file.
 */

export const FIELD_KINDS = [
  "text",
  "long_text",
  "number",
  "link",
  "date",
  "dropdown",
  "checkbox",
  "person",
  "file",
] as const
export type FieldKind = (typeof FIELD_KINDS)[number]

/** Who may change a field's value. The owner and admins always may. */
export const WHO_CAN_CHANGE = ["anyone", "assignee", "handed_out_by"] as const
export type WhoCanChange = (typeof WHO_CAN_CHANGE)[number]

export const WHO_CAN_CHANGE_LABEL: Record<WhoCanChange, string> = {
  anyone: "Anyone on the project",
  assignee: "Only the person assigned",
  handed_out_by: "Only whoever handed it out",
}

/** A dropdown's choice. A removed one stays, so values that picked it still read. */
export type FieldChoice = { id: string; name: string; removed?: boolean }

export type FieldSettings = {
  choices?: FieldChoice[]
  /** The field shows only while this dropdown, in the same type, has this choice. */
  showWhen?: { fieldId: string; choiceId: string } | null
}

/** A field as the rules below need it. */
export type FieldRule = {
  id: string
  name: string
  kind: FieldKind
  neededBeforeDone: boolean
  neededWhenMade: boolean
  whoCanChange: WhoCanChange
  settings: FieldSettings
}

const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max, PROJECT_ERRORS.fieldTooLong)

/**
 * Each kind's name on screen and the check its value must pass. A File field
 * has no value of its own: its files are the task's files with the field's id.
 */
export const FIELD_KIND_INFO: Record<
  FieldKind,
  { label: string; value: z.ZodType<string | number | boolean> | null }
> = {
  text: { label: "Text", value: text(LIMITS.fieldText) },
  long_text: { label: "Long text", value: text(LIMITS.fieldLongText) },
  number: {
    label: "Number",
    value: z.number({ error: PROJECT_ERRORS.fieldNumber }),
  },
  link: {
    label: "Link",
    value: text(LIMITS.fieldLink).refine((value) => value === "" || isHttpsLink(value), PROJECT_ERRORS.fieldLink),
  },
  date: {
    label: "Date",
    value: z.string().refine((value) => value === "" || isRealDay(value), PROJECT_ERRORS.fieldDate),
  },
  dropdown: { label: "Dropdown", value: z.string().max(36) },
  checkbox: { label: "Checkbox", value: z.boolean() },
  person: { label: "Person", value: z.string().max(36) },
  file: { label: "File", value: null },
}

/** Only an https address is a link, so nothing typed can run when it's clicked. */
export function isHttpsLink(value: string) {
  try {
    return new URL(value).protocol === "https:"
  } catch {
    return false
  }
}

/**
 * The value to save, or null when the field is now empty and its row goes.
 * Throws one of `PROJECT_ERRORS` when the value doesn't fit the kind.
 */
export function cleanFieldValue(kind: FieldKind, raw: unknown): string | number | boolean | null {
  const check = FIELD_KIND_INFO[kind].value
  if (!check) throw new Error(PROJECT_ERRORS.fieldValueWrong)
  if (raw === null || raw === undefined) return null
  const parsed = check.safeParse(raw)
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? PROJECT_ERRORS.fieldValueWrong)
  }
  const value = parsed.data
  if (value === "" || value === false) return null
  return value
}

/** Values as they come back from the database, typed for each kind. */
export function readFieldValue(kind: FieldKind, raw: unknown): string | number | boolean | null {
  if (raw === null || raw === undefined) return null
  if (kind === "number") return typeof raw === "number" ? raw : null
  if (kind === "checkbox") return raw === true ? true : null
  if (kind === "file") return typeof raw === "number" ? raw : null
  return typeof raw === "string" && raw ? raw : null
}

/**
 * What a task holds in each field: the saved value, or for a File field how
 * many files it has. An empty field is missing.
 */
export type FieldValues = Record<string, string | number | boolean>

function isFieldFilled(field: Pick<FieldRule, "id" | "kind">, values: FieldValues) {
  const value = values[field.id]
  if (field.kind === "file") return typeof value === "number" && value > 0
  return value !== undefined && value !== null && value !== ""
}

/**
 * The fields that show right now. A field with "Show only when" shows while
 * its dropdown shows and holds that choice. A broken link (the dropdown or the
 * choice is gone) shows the field, and a loop never hides anything forever.
 */
export function visibleFieldIds(fields: readonly FieldRule[], values: FieldValues): Set<string> {
  const byId = new Map(fields.map((field) => [field.id, field]))
  const seen = new Map<string, boolean>()
  function shows(field: FieldRule, path: Set<string>): boolean {
    const known = seen.get(field.id)
    if (known !== undefined) return known
    const when = field.settings.showWhen
    const controller = when ? byId.get(when.fieldId) : undefined
    let result = true
    if (when && controller && controller.kind === "dropdown" && !path.has(controller.id)) {
      const choiceLives = (controller.settings.choices ?? []).some(
        (choice) => choice.id === when.choiceId && !choice.removed
      )
      if (choiceLives) {
        result = shows(controller, new Set([...path, field.id])) && values[controller.id] === when.choiceId
      }
    }
    seen.set(field.id, result)
    return result
  }
  return new Set(fields.filter((field) => shows(field, new Set())).map((field) => field.id))
}

/**
 * The first field, in the type's order, that must be filled and isn't. A
 * hidden field is never needed. A File field is never needed when a task is
 * made, because its files can only be added after.
 */
export function firstMissingField(
  fields: readonly FieldRule[],
  values: FieldValues,
  when: "done" | "made"
): FieldRule | null {
  const visible = visibleFieldIds(fields, values)
  return (
    fields.find(
      (field) =>
        visible.has(field.id) &&
        (when === "done" ? field.neededBeforeDone : field.neededWhenMade && field.kind !== "file") &&
        !isFieldFilled(field, values)
    ) ?? null
  )
}

/** "Fill in Final cut first." The server refuses with it and the screens show it. */
export function fillInFirst(field: { name: string }) {
  return `Fill in ${field.name} first.`
}

const WHO_REFUSAL: Record<Exclude<WhoCanChange, "anyone">, string> = {
  assignee: "the person assigned",
  handed_out_by: "whoever handed the task out",
}

/** "Only the person assigned or the site admin can change Final cut." */
export function onlyWhoCanChange(field: { name: string; whoCanChange: WhoCanChange }) {
  if (field.whoCanChange === "anyone") return null
  return `Only ${WHO_REFUSAL[field.whoCanChange]} or the site admin can change ${field.name}.`
}

type HandedOut = { firstHandedOutByUserId: string | null; createdByUserId: string | null }

/**
 * "Whoever handed it out": whoever first handed the task out, or whoever made
 * it when nobody has. It stays with them however the task is handed around
 * later, so the person doing the work can't hand it on and back to take over
 * the brief (Tyler's choice, 12 Oct 2026).
 */
export function handedOutBy(task: HandedOut) {
  return task.firstHandedOutByUserId ?? task.createdByUserId
}

/** Whether this person may change the field on this task. The owner and admins always may. */
export function canChangeField(
  field: Pick<FieldRule, "whoCanChange">,
  task: HandedOut & { assigneeUserId: string | null },
  viewer: { userId: string; role: TeamRole }
) {
  if (runsTheTeam(viewer.role)) return true
  if (field.whoCanChange === "assignee") return task.assigneeUserId === viewer.userId
  if (field.whoCanChange === "handed_out_by") return handedOutBy(task) === viewer.userId
  return true
}

/**
 * Whether this person may change the task's type once it exists: whoever
 * handed it out, the owner and admins. Anyone else could otherwise switch it
 * to a plain task to get past "Needed before Done" (Tyler's choice, 12 Oct 2026).
 */
export function canChangeTaskType(task: HandedOut, viewer: { userId: string; role: TeamRole }) {
  return runsTheTeam(viewer.role) || handedOutBy(task) === viewer.userId
}

/** A dropdown's live choices, the ones that can still be picked. */
export function liveChoices(settings: FieldSettings) {
  return (settings.choices ?? []).filter((choice) => !choice.removed)
}

/**
 * The value as words: "YouTube", "Yes", "Nov 30", "2 files". A removed
 * dropdown choice reads "TikTok (removed)". A person reads by name, from
 * `people`. Null when there's nothing to show.
 */
export function fieldValueText(
  field: Pick<FieldRule, "kind" | "settings">,
  value: string | number | boolean | undefined,
  people: ReadonlyMap<string, string>
): string | null {
  if (value === undefined || value === null || value === "") return null
  switch (field.kind) {
    case "checkbox":
      return value === true ? "Yes" : null
    case "date":
      return typeof value === "string" ? dayLabel(value) : null
    case "number":
      return typeof value === "number" ? value.toLocaleString("en-US", { maximumFractionDigits: 6 }) : null
    case "dropdown": {
      const choice = (field.settings.choices ?? []).find((c) => c.id === value)
      if (!choice) return null
      return choice.removed ? `${choice.name} (removed)` : choice.name
    }
    case "person":
      return typeof value === "string" ? (people.get(value) ?? null) : null
    case "file":
      return typeof value === "number" && value > 0 ? `${value} ${value === 1 ? "file" : "files"}` : null
    default:
      return String(value)
  }
}

/** How a column of this field sorts: numbers as numbers, the rest as their words. */
export function fieldSortValue(
  field: Pick<FieldRule, "kind" | "settings">,
  value: string | number | boolean | undefined,
  people: ReadonlyMap<string, string>
): string | number | null {
  if (value === undefined) return null
  if (field.kind === "number" || field.kind === "file") return typeof value === "number" ? value : null
  if (field.kind === "date") return typeof value === "string" ? value : null
  return fieldValueText(field, value, people)?.toLowerCase() ?? null
}

/**
 * What a field's control holds while someone types: words for most kinds,
 * true or false for a checkbox, an id or "" for a dropdown or a person.
 */
export type FieldDraft = string | boolean

export function draftFromValue(kind: FieldKind, value: string | number | boolean | undefined): FieldDraft {
  if (kind === "checkbox") return value === true
  if (value === undefined || value === null || typeof value === "boolean") return ""
  return String(value)
}

/**
 * The value to send for a draft, or the reason it can't be sent. The server
 * checks again; this only spares a round trip for a plain typing slip.
 */
export function valueFromDraft(
  kind: FieldKind,
  draft: FieldDraft
): { value: string | number | boolean | null } | { error: string } {
  if (kind === "checkbox") return { value: draft === true ? true : null }
  const text = typeof draft === "string" ? draft.trim() : ""
  if (!text) return { value: null }
  if (kind === "number") {
    const number = Number(text)
    return Number.isFinite(number) ? { value: number } : { error: PROJECT_ERRORS.fieldNumber }
  }
  if (kind === "link" && !isHttpsLink(text)) return { error: PROJECT_ERRORS.fieldLink }
  const max = kind === "long_text" ? LIMITS.fieldLongText : kind === "link" ? LIMITS.fieldLink : LIMITS.fieldText
  if (text.length > max) return { error: PROJECT_ERRORS.fieldTooLong }
  return { value: text }
}
