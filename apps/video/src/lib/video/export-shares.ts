/**
 * Share links for finished exports: the words and choices both the browser and
 * the server need. The rows and the checks live in
 * `src/server/video/export-shares.ts`.
 */

/** How long a new link works for, in days. `null` means until turned off. */
export const SHARE_EXPIRY_CHOICES = [
  { value: "never", label: "Until I turn it off", days: null },
  { value: "1", label: "For 1 day", days: 1 },
  { value: "7", label: "For 7 days", days: 7 },
  { value: "30", label: "For 30 days", days: 30 },
] as const

export type ShareExpiryChoice = (typeof SHARE_EXPIRY_CHOICES)[number]["value"]

export const SHARE_EXPIRY_VALUES = SHARE_EXPIRY_CHOICES.map(
  (choice) => choice.value
) as [ShareExpiryChoice, ...ShareExpiryChoice[]]

export function shareExpiryDays(choice: ShareExpiryChoice) {
  return (
    SHARE_EXPIRY_CHOICES.find((option) => option.value === choice)?.days ?? null
  )
}

/** 32 random bytes written as hex. Anything else is not a token. */
export const SHARE_TOKEN_PATTERN = /^[0-9a-f]{64}$/

export const SHARE_ONLY_READY_MESSAGE =
  "Only a finished export can be shared."

/** The page a link opens. A query rather than a path; see the share doc. */
export function shareLinkUrl(origin: string, token: string) {
  return `${origin}/share?token=${token}`
}

/** Where the shared page streams the file from. */
export function sharedFileUrl(token: string) {
  return `/api/v1/video/share/${token}/file`
}

/** What the owner sees about an export's link. */
export type ExportShareSummary = {
  token: string
  created_at: string
  expires_at: string | null
  /** Past its expiry but not turned off. It opens nothing. */
  expired: boolean
}

/** Everything the public page is told about a shared export. */
export type SharedExportView = {
  title: string | null
  width: number | null
  height: number | null
}
