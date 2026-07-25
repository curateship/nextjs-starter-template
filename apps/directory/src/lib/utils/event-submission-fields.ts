// Shared config for the "Submit an Event" block's form fields. The SET of fields
// is fixed — each maps to part of the draft event created on approval (event name
// → title, when → a note in the body, location → venue, email → contact) — so the
// owner can relabel them and, for the optional ones, hide or require them, but not
// add arbitrary fields. Both the public form and the block editor read this, so
// their defaults never drift apart.

export type EventSubmissionFieldKey = 'eventName' | 'dateTimeText' | 'location' | 'submitterEmail' | 'description'

export interface EventSubmissionFieldDefinition {
  key: EventSubmissionFieldKey
  /** Default label + placeholder used until the owner overrides them. */
  label: string
  placeholder: string
  /** Optional fields can be hidden or made required; essential ones are always on. */
  optional: boolean
  /** Rendered as a textarea rather than a single-line input. */
  multiline?: boolean
}

export const EVENT_SUBMISSION_FIELDS: EventSubmissionFieldDefinition[] = [
  { key: 'eventName', label: 'Event name', placeholder: 'Saturday night live music', optional: false },
  { key: 'dateTimeText', label: 'When', placeholder: 'Sat, Aug 16 · 7:00 PM', optional: true },
  { key: 'location', label: 'Location', placeholder: 'The Corner Bar, Main St', optional: true },
  { key: 'submitterEmail', label: 'Your email', placeholder: 'you@example.com', optional: false },
  { key: 'description', label: 'Description', placeholder: 'Tell us about the event...', optional: true, multiline: true },
]

export interface ResolvedEventSubmissionField extends EventSubmissionFieldDefinition {
  show: boolean
  required: boolean
}

// Merge the owner's per-field overrides (stored on block content.fields) over the
// defaults. Essential fields are always shown and required whatever the overrides say.
export function resolveEventSubmissionFields(fieldsConfig: unknown): ResolvedEventSubmissionField[] {
  const overrides = fieldsConfig && typeof fieldsConfig === 'object' ? fieldsConfig as Record<string, any> : {}

  return EVENT_SUBMISSION_FIELDS.map((field) => {
    const override = overrides[field.key] && typeof overrides[field.key] === 'object' ? overrides[field.key] as Record<string, any> : {}
    const label = typeof override.label === 'string' && override.label.trim() ? override.label.trim().slice(0, 120) : field.label
    const placeholder = typeof override.placeholder === 'string' ? override.placeholder.slice(0, 160) : field.placeholder

    return {
      ...field,
      label,
      placeholder,
      show: field.optional ? override.show !== false : true,
      required: field.optional ? override.required === true : true,
    }
  })
}
