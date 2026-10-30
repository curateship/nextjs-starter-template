/**
 * A step's own fields: a name and a value each, such as "Link" and a Dropbox
 * address, added on the step's card (Tyler, 28 Oct 2026, Misc 4: "name and
 * value"). Each has a kind, picked as it is added ("the step fields should
 * have a few options like url field"). Nothing is set up ahead; any step can
 * have its own.
 */
export const STEP_FIELD_KINDS = ["text", "link", "number", "date", "tick"] as const
export type StepFieldKind = (typeof STEP_FIELD_KINDS)[number]

export const STEP_FIELD_KIND_LABEL: Record<StepFieldKind, string> = {
  text: "Text",
  link: "Link",
  number: "Number",
  date: "Date",
  tick: "Tick box",
}

/**
 * The value is kept as text whatever the kind: a web address, a number as
 * typed, a date as "2026-10-28", and a tick box as "yes" or "".
 */
export type StepField = { id: string; name: string; value: string; kind: StepFieldKind }

/** "dropbox.com/x" becomes "https://dropbox.com/x". Only http and https stay as typed, so a value can never run script. */
export function linkHref(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return ""
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
}

/** The value as a "Name: value" line reads it, for Make it a task. */
export function stepFieldText(field: StepField) {
  if (field.kind === "tick") return field.value ? "Yes" : "No"
  if (field.kind === "link") return linkHref(field.value)
  return field.value
}

/**
 * A task template's fields for its starting steps, by the step's words. A new
 * task made from the template gives each of its steps the fields saved under
 * the same words.
 */
export type StartingStepFields = Record<string, StepField[]>

/** The same fields with fresh ids, for a step copied from another. */
export function copyStepFields(fields: readonly StepField[]): StepField[] {
  return fields.map((field) => ({ ...field, id: crypto.randomUUID() }))
}
