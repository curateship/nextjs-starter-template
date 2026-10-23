import { createFileRoute } from "@tanstack/react-router"

import { browserRedirect } from "@/server/auth/google"
import { requireAdmin } from "@/server/auth/security"
import {
  finishYoutubeConnect,
  takeYoutubeHandshake,
  YoutubeConnectError,
  YOUTUBE_SETTINGS_PATH,
} from "@/server/video/youtube-oauth"

/**
 * Connect YouTube, step two: Google sends the browser back here. This is the
 * address registered in Google Cloud as the client's redirect URI.
 *
 * The handshake cookie is read and cleared first, and the `state` Google
 * echoes back has to match it, so a link somebody else built cannot connect
 * their channel to this app. Every exit goes back to Settings → YouTube with
 * how it went in the address; the page says it in words.
 */
export const Route = createFileRoute("/api/v1/video/youtube/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const parameters = new URL(request.url).searchParams
        const handshake = takeYoutubeHandshake()
        const back = (outcome: string) =>
          browserRedirect(`${YOUTUBE_SETTINGS_PATH}?${outcome}`)

        if (parameters.get("error") === "access_denied") {
          return back("youtube_error=denied")
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
          return back("youtube_error=failed")
        }

        try {
          await requireAdmin()
        } catch {
          return back("youtube_error=forbidden")
        }

        try {
          await finishYoutubeConnect(code, handshake.verifier)
          return back("youtube=connected")
        } catch (error) {
          return back(
            `youtube_error=${error instanceof YoutubeConnectError ? error.code : "failed"}`
          )
        }
      },
    },
  },
})
