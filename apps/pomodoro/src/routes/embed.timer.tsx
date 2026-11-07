import { createFileRoute } from "@tanstack/react-router"

import { EmbedTimer, EmbedTimerOff } from "@/components/pomodoro/embed-timer"
import { readEmbedTimer } from "@/lib/api/pomodoro/embed-timer"

/**
 * The timer for a Notion embed block: no left menu, no header, guest only.
 * Kept out of search results, because it is a piece of another page. The
 * admin can switch it off in Settings → Notion timer.
 */
export const Route = createFileRoute("/embed/timer")({
  loader: () => readEmbedTimer(),
  head: () => ({
    meta: [
      { title: "Flowfly timer" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: EmbedTimerPage,
})

function EmbedTimerPage() {
  const { enabled } = Route.useLoaderData()
  return enabled ? <EmbedTimer /> : <EmbedTimerOff />
}
