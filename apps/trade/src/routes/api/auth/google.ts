import { createFileRoute } from "@tanstack/react-router"

import { safeRedirectPath } from "@/lib/redirect-path"
import {
  browserRedirect,
  googleSignInEnabled,
  rememberGoogleHandshake,
  startGoogleSignIn,
} from "@/server/google-auth"

/**
 * "Continue with Google", step one: send the browser to Google.
 *
 * Deliberately no origin check. This is a plain link somebody clicks, not a
 * mutation — it writes nothing to the database, and the state it puts in the
 * cookie is itself the guard for the step that does.
 */
export const Route = createFileRoute("/api/auth/google")({
  server: {
    handlers: {
      GET: ({ request }) => {
        if (!googleSignInEnabled()) {
          return browserRedirect("/login?error=GOOGLE_SIGN_IN_FAILED")
        }

        // Carried out to Google and back, so somebody who was sent to sign in
        // still lands on the page they originally asked for.
        const redirectTo = safeRedirectPath(
          new URL(request.url).searchParams.get("redirect")
        )

        const handshake = startGoogleSignIn()
        rememberGoogleHandshake(handshake, redirectTo)

        return browserRedirect(handshake.authorizeUrl)
      },
    },
  },
})
