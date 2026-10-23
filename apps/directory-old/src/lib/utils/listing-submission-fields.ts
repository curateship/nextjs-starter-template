// Shared config for the "Add your listing" block's form fields. The SET of
// fields is fixed — each maps to part of the listing created on approval
// (business name -> title, address -> Core block, contact email -> Core email
// link, description -> rich-text body, image -> featured image) — so the owner
// can relabel them and, for the optional ones, hide or require them, but not add
// arbitrary fields. Both the public form and the block editor read this, so
// their defaults never drift apart. (The category selector is handled separately
// because it is a dropdown of the site's published categories, not a text field.)

export type ListingSubmissionFieldKey = 'businessName' | 'address' | 'contactEmail' | 'description' | 'imageUrl'

export interface ListingSubmissionFieldDefinition {
  key: ListingSubmissionFieldKey
  /** Default label + placeholder used until the owner overrides them. */
  label: string
  placeholder: string
  /** Optional fields can be hidden or made required; essential ones are always on. */
  optional: boolean
  /** Rendered as a textarea rather than a single-line input. */
  multiline?: boolean
}

export const LISTING_SUBMISSION_FIELDS: ListingSubmissionFieldDefinition[] = [
  { key: 'businessName', label: 'Business name', placeholder: "The Corner Bakery", optional: false },
  { key: 'address', label: 'Address', placeholder: '1245 Broadway, New York, NY', optional: true },
  { key: 'contactEmail', label: 'Contact email', placeholder: 'you@example.com', optional: false },
  { key: 'description', label: 'Description', placeholder: 'Tell us about the business...', optional: true, multiline: true },
  { key: 'imageUrl', label: 'Image link', placeholder: 'https://example.com/photo.jpg', optional: true },
]

export interface ResolvedListingSubmissionField extends ListingSubmissionFieldDefinition {
  show: boolean
  required: boolean
}

// Merge the owner's per-field overrides (stored on block content.fields) over the
// defaults. Essential fields are always shown and required whatever the overrides say.
export function resolveListingSubmissionFields(fieldsConfig: unknown): ResolvedListingSubmissionField[] {
  const overrides = fieldsConfig && typeof fieldsConfig === 'object' ? fieldsConfig as Record<string, any> : {}

  return LISTING_SUBMISSION_FIELDS.map((field) => {
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
