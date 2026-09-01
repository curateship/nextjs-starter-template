import { formatAuthTokenExpiry } from "@/lib/email/auth-token-expiry"
import { db, type CustomShellDb } from "@/server/db"
import { RateLimitError, enforceRateLimit } from "@/server/auth/rate-limit"
import { alertAccountLocked } from "@/server/auth/security-alerts"
import { findUserByEmail, type SessionOrigin } from "@/server/auth/security"

const LOGIN_LIMIT = {
  maxAttempts: 5,
  windowSeconds: 15 * 60,
}

/**
 * Counts password sign-in attempts and sends one warning at the instant a real
 * account becomes locked. Every later refusal keeps the same public answer but
 * sends nothing, so the form cannot be used to flood somebody's inbox.
 */
export async function enforceLoginRateLimit(
  email: string,
  visitorIp: string,
  origin: SessionOrigin,
  database: CustomShellDb = db
) {
  try {
    await enforceRateLimit(`login:${visitorIp}:${email}`, LOGIN_LIMIT, database)
  } catch (error) {
    if (error instanceof RateLimitError && error.newlyBlocked) {
      // The outside answer stays RATE_LIMITED whether an account exists or any
      // part of its courtesy alert fails. That keeps addresses private and the
      // lock itself reliable when email or the account lookup has a problem.
      try {
        const user = await findUserByEmail(email, database)
        if (user) {
          await alertAccountLocked(
            user.email,
            origin,
            user.name,
            formatAuthTokenExpiry(LOGIN_LIMIT.windowSeconds * 1_000)
          )
        }
      } catch {
        // The lockout is already recorded. Its email attempt must not replace
        // the rate-limit response or let another password attempt through.
      }
    }

    throw error
  }
}
