import { createFileRoute } from "@tanstack/react-router"

import { startWorkspaceFor } from "@/lib/api/auth"
import {
  browserRedirect,
  exchangeGoogleCode,
  signInWithGoogle,
  takeGoogleHandshake,
} from "@/server/google-auth"
import { clearRateLimit, enforceRateLimit } from "@/server/rate-limit"
import { describeRequestOrigin, setSessionCookie } from "@/server/security"

/**
 * "Continue with Google", step two: Google sends the browser back here.
 *
 * The handshake cookie is read and cleared first, so one trip to Google can
 * only ever complete one sign-in. The `state` Google echoes back has to match
 * what is in that cookie; anything else — a stale attempt, a link somebody else
 * built, a second click on the same one — is refused before this server talks
 * to anybody.
 *
 * Every failure ends the same way: back to the sign-in page with a code the
 * page turns into a message. Nothing is said about which account exists.
 */
export const Route = createFileRoute("/api/auth/google_/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const parameters = new URL(request.url).searchParams
        const handshake = takeGoogleHandshake()

        // Closing Google's account picker is not a failure, so it just goes
        // back to the sign-in page without an alarming message.
        if (parameters.get("error") === "access_denied") {
          return browserRedirect("/login")
        }

        const code = parameters.get("code")
        const state = parameters.get("state")
        if (
          parameters.get("error") ||
          !code ||
          !state ||
          !handshake ||
          state !== handshake.state
        ) {
          return signInFailed("GOOGLE_SIGN_IN_FAILED")
        }

        // Everything below is an outbound call to Google, and a code can be
        // wrong, so the endpoint is counted like the other sign-in paths. The
        // key is the address alone — there is no account here yet — which is
        // why a success clears it: otherwise an office signing in this way
        // would lock its own people out. What is left is what the limit is for.
        const origin = describeRequestOrigin()
        const rateLimitKey = `google-callback:${origin.ipAddress ?? "unknown"}`
        try {
          await enforceRateLimit(rateLimitKey, {
            maxAttempts: 10,
            windowSeconds: 60 * 60,
          })

          const identity = await exchangeGoogleCode(code, handshake.verifier)
          const { user, sessionToken } = await signInWithGoogle(identity, origin)

          await clearRateLimit(rateLimitKey)
          await startWorkspaceFor(user.id)
          setSessionCookie(sessionToken)

          return browserRedirect(handshake.redirect ?? "/")
        } catch (error) {
          return signInFailed(
            error instanceof Error ? error.message : "GOOGLE_SIGN_IN_FAILED"
          )
        }
      },
    },
  },
})

/**
 * The codes the sign-in page has a message for. Anything else — a database that
 * is down, a bug — comes back as a failed Google sign-in rather than handing
 * the browser a raw error to print.
 */
const REPORTED_CODES = new Set([
  "ACCOUNT_SUSPENDED",
  "PROVIDER_EMAIL_UNVERIFIED",
  "RATE_LIMITED",
])

function signInFailed(code: string) {
  const reported = REPORTED_CODES.has(code) ? code : "GOOGLE_SIGN_IN_FAILED"
  return browserRedirect(`/login?error=${reported}`)
}
