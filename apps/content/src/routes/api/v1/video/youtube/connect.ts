import { createFileRoute } from "@tanstack/react-router"

import { browserRedirect } from "@/server/auth/google"
import { requireAdmin } from "@/server/auth/security"
import {
  rememberYoutubeHandshake,
  startYoutubeConnect,
  YOUTUBE_SETTINGS_PATH,
} from "@/server/video/youtube-oauth"

/**
 * Connect YouTube, step one: send the admin to Google's consent screen
 * (`workspace/docs/retention-curve.md`).
 *
 * A plain link from Settings → YouTube. It writes nothing to the database;
 * the state it puts in the cookie is the guard for the step that does.
 */
export const Route = createFileRoute("/api/v1/video/youtube/connect")({
  server: {
    handlers: {
      GET: async () => {
        try {
          await requireAdmin()
        } catch {
          return browserRedirect(`${YOUTUBE_SETTINGS_PATH}?youtube_error=forbidden`)
        }
        try {
          const handshake = await startYoutubeConnect()
          rememberYoutubeHandshake(handshake)
          return browserRedirect(handshake.authorizeUrl)
        } catch {
          return browserRedirect(
            `${YOUTUBE_SETTINGS_PATH}?youtube_error=client_missing`
          )
        }
      },
    },
  },
})
