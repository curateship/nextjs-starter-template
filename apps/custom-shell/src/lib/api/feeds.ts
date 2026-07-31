import { createServerFn } from "@tanstack/react-start"

import { loadFeedsSummary, type FeedsSummary } from "@/server/feeds"
import { requireAdmin } from "@/server/security"

export type { FeedsSummary }

const feedsErrorMessages: Record<string, string> = {
  FORBIDDEN: "You do not have access to that.",
  AUTH_REQUIRED: "Please sign in again.",
}

export function getFeedsErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : ""
  const matched = Object.keys(feedsErrorMessages).find((code) =>
    message.includes(code)
  )

  return matched
    ? feedsErrorMessages[matched]
    : "We could not load the feeds overview. Please try again."
}

const loadFeedsFn = createServerFn({ method: "GET" }).handler(async () => {
  await requireAdmin()
  return loadFeedsSummary()
})

export function loadFeeds() {
  return loadFeedsFn()
}
