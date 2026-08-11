/**
 * What the public "add your listing" form asks for.
 *
 * One list, read by the form that draws the fields and by the server that
 * checks them, so the two can never disagree about what is required or how long
 * an answer may be. The directory app made this list per-site configurable; that
 * went with the block system, and a fixed list is what a plain record needs.
 *
 * Pure data with nothing behind it — no imports — because both sides need it and
 * the browser must not pull the server in behind it.
 */

export type SubmissionFieldName =
  | "businessName"
  | "contactEmail"
  | "address"
  | "phone"
  | "website"
  | "description"

export type SubmissionField = {
  name: SubmissionFieldName
  label: string
  required: boolean
  /** Matches the column, so the form stops typing before the server refuses it. */
  maxLength: number
  /** Drawn as a growing textarea rather than one line. */
  multiline?: boolean
  type?: "email" | "tel" | "url"
  /** Only where the label genuinely cannot say it. Most fields have none. */
  hint?: string
}

export const SUBMISSION_FIELDS: SubmissionField[] = [
  {
    name: "businessName",
    label: "Business name",
    required: true,
    maxLength: 200,
  },
  {
    name: "contactEmail",
    label: "Contact email",
    required: true,
    maxLength: 255,
    type: "email",
    // **Says both things it does, because it does both.** It is where the
    // confirmation link goes, and it becomes the listing's public contact link
    // if this is approved. A hint that mentioned only the first would have
    // people putting a personal address in a box that publishes it.
    hint: "We send one link here to check the address. If your listing is approved, this becomes its public contact address.",
  },
  { name: "address", label: "Address", required: false, maxLength: 300 },
  { name: "phone", label: "Phone", required: false, maxLength: 60, type: "tel" },
  {
    name: "website",
    label: "Website",
    required: false,
    maxLength: 2000,
    type: "url",
  },
  {
    name: "description",
    label: "Description",
    required: false,
    maxLength: 2000,
    multiline: true,
  },
]

/** The blank form, so the component has one source for its starting values. */
export function emptySubmissionValues(): Record<SubmissionFieldName, string> {
  return {
    businessName: "",
    contactEmail: "",
    address: "",
    phone: "",
    website: "",
    description: "",
  }
}

/**
 * A rough shape check, not a promise the address exists.
 *
 * The only thing that proves an address is real is the link arriving at it,
 * which is the whole reason a submission is not visible to an admin until
 * somebody clicks one. This just catches the typo before the email is sent.
 */
export function looksLikeEmail(value: string): boolean {
  const trimmed = value.trim()
  return trimmed.length > 2 && /^[^\s@]+@[^\s@.]+\.[^\s@]+$/.test(trimmed)
}
