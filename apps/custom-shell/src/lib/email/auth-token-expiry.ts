import { z } from "zod"

export const authLinkExpirySchema = z.object({
  verificationHours: z.number().int().min(1).max(168),
  passwordResetMinutes: z.number().int().min(5).max(1440),
  signInMinutes: z.number().int().min(5).max(60),
  emailChangeHours: z.number().int().min(1).max(168),
})

export type AuthLinkExpiry = z.infer<typeof authLinkExpirySchema>

export const DEFAULT_AUTH_LINK_EXPIRY: AuthLinkExpiry = {
  verificationHours: 24,
  passwordResetMinutes: 60,
  signInMinutes: 15,
  emailChangeHours: 24,
}

export function parseAuthLinkExpiry(value: unknown): AuthLinkExpiry {
  return authLinkExpirySchema.safeParse(value).data ?? DEFAULT_AUTH_LINK_EXPIRY
}

/**
 * The lifetime of every link that carries an authentication token.
 *
 * This stays in a plain module because both the server that enforces the limit
 * and the email wording read it. Keeping those two readers on the same value
 * means changing a lifetime cannot leave the email making an old promise.
 */
export type AuthTokenPurpose =
  | "verify_email"
  | "reset_password"
  | "login"
  | "change_email"
  | "revoke_email_change"

export function authTokenTtlMs(
  purpose: AuthTokenPurpose,
  expiry: AuthLinkExpiry = DEFAULT_AUTH_LINK_EXPIRY
) {
  switch (purpose) {
    case "verify_email":
      return expiry.verificationHours * 60 * 60 * 1000
    case "reset_password":
      return expiry.passwordResetMinutes * 60 * 1000
    case "login":
      return expiry.signInMinutes * 60 * 1000
    case "change_email":
    case "revoke_email_change":
      return expiry.emailChangeHours * 60 * 60 * 1000
  }
}

/** Writes an exact token lifetime in the plain words used in an email. */
export function formatAuthTokenExpiry(durationMs: number) {
  const hourMs = 60 * 60 * 1000
  const minuteMs = 60 * 1000

  if (durationMs % hourMs === 0) {
    const hours = durationMs / hourMs
    return hours === 1 ? "one hour" : `${hours} hours`
  }

  const minutes = durationMs / minuteMs
  return minutes === 1 ? "one minute" : `${minutes} minutes`
}

export function authTokenExpiryText(
  purpose: AuthTokenPurpose,
  expiry: AuthLinkExpiry = DEFAULT_AUTH_LINK_EXPIRY
) {
  return formatAuthTokenExpiry(authTokenTtlMs(purpose, expiry))
}
