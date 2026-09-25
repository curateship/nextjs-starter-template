import { createFileRoute } from "@tanstack/react-router"

import {
  DIRECTORY_FEED_CACHE_CONTROL,
  readDirectoryFeed,
  renderDirectoryFeedXml,
} from "@/server/directory/feed"
import { publicRequestOrigin } from "@/server/content/sitemap"
import { answerForRequest } from "@/server/workspaces/host"

export const Route = createFileRoute("/feed.xml")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const answer = await answerForRequest()
        if (answer.kind !== "workspace") {
          return new Response("Not found", { status: 404 })
        }

        const entries = await readDirectoryFeed(answer.workspace.id)
        return new Response(
          renderDirectoryFeedXml({
            siteName: answer.workspace.name,
            origin: publicRequestOrigin(request),
            entries,
          }),
          {
            headers: {
              "Cache-Control": DIRECTORY_FEED_CACHE_CONTROL,
              "Content-Type": "application/rss+xml; charset=utf-8",
            },
          }
        )
      },
    },
  },
})
