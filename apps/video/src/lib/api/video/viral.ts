import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { createErrorMessage } from "../error-message"
import { adminGet, adminPost } from "@/server/guards"
import {
  getYoutubeKeyStatus,
  removeYoutubeApiKey,
  saveYoutubeApiKey,
  type YoutubeKeyStatus,
} from "@/server/video/settings"
import { AI_KEY_MISSING_MESSAGES } from "@/lib/video/ai-providers"
import {
  FOLDER_NAME_REQUIRED_MESSAGE,
  FOLDER_NAME_TAKEN_MESSAGE,
  FOLDER_NOT_FOUND_MESSAGE,
} from "@/lib/video/project-folders"
import { isProjectSpendLimitMessage } from "@/lib/video/project-spend"
import { VIRAL_SAYS, YOUTUBE_QUOTA_MESSAGE } from "@/lib/video/viral"

/** Sentences other parts of the app already wrote for a person to read. */
const SHOWN_AS_IS: ReadonlySet<string> = new Set([
  FOLDER_NAME_REQUIRED_MESSAGE,
  FOLDER_NAME_TAKEN_MESSAGE,
  FOLDER_NOT_FOUND_MESSAGE,
])

/**
 * The YouTube key behind Viral, and the one error lookup every Viral endpoint
 * shares. Admin only: every search spends from the day's 10,000 free YouTube
 * units, so this is not a door to leave open to every member.
 */

export type { YoutubeKeyStatus }

const UNREACHABLE_MESSAGE =
  "YouTube could not be reached. Try again in a moment."

const describeKnownError = createErrorMessage(
  {
    YOUTUBE_QUOTA: YOUTUBE_QUOTA_MESSAGE,
    YOUTUBE_UNREACHABLE: UNREACHABLE_MESSAGE,
    CREATOR_NOT_FOUND: "That creator is no longer followed.",
    CREATOR_ALREADY_FOLLOWED: "You already follow that creator.",
    YOUTUBE_KEY_MISSING:
      "Following a YouTube channel needs the YouTube key. Paste one in Settings → YouTube first.",
    YOUTUBE_CHANNEL_NOT_FOUND:
      "YouTube has no channel at that link. Check the address and try again.",
    SAVED_VIDEO_NOT_FOUND: "That saved video is gone.",
    AI_LIMIT_REACHED:
      "Your AI allowance is used up, so nothing new can be broken down until next month.",
    EMPTY_KEY: "Paste a key before saving.",
    ENCRYPTION_NOT_CONFIGURED:
      "The server has no encryption key set, so secrets cannot be saved. Set CUSTOM_SHELL_SECRET_ENCRYPTION_KEY first.",
    SECRET_UNREADABLE:
      "The saved key can no longer be read. Paste it again in Settings → YouTube.",
  },
  "That did not work. Try again in a moment."
)

/**
 * A refusal the server already worded ("VIRAL_SAYS: …") or YouTube's own
 * reason ("YouTube said: …") is the answer as it stands; anything else is
 * looked up, so the screen never shows raw JSON.
 */
export function getViralErrorMessage(error: unknown) {
  const message =
    typeof error === "string"
      ? error
      : error instanceof Error
        ? error.message
        : ""
  if (SHOWN_AS_IS.has(message)) return message
  if (AI_KEY_MISSING_MESSAGES.has(message)) return message
  if (isProjectSpendLimitMessage(message)) return message
  const says = message.indexOf(VIRAL_SAYS)
  if (says >= 0) return message.slice(says + VIRAL_SAYS.length)
  const said = message.indexOf("YouTube said:")
  if (said >= 0) return message.slice(said)
  return describeKnownError(error)
}

const getKeyStatusFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .handler(async () => getYoutubeKeyStatus())

export function loadYoutubeKeyStatus() {
  return getKeyStatusFn()
}

const saveKeyFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ apiKey: z.string().min(1).max(200) }))
  .handler(async ({ data }) => {
    await saveYoutubeApiKey(data.apiKey)
    return getYoutubeKeyStatus()
  })

export function saveYoutubeKey(apiKey: string) {
  return saveKeyFn({ data: { apiKey } })
}

const removeKeyFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .handler(async () => {
    await removeYoutubeApiKey()
    return getYoutubeKeyStatus()
  })

export function removeYoutubeKey() {
  return removeKeyFn()
}
