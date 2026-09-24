import * as React from "react"
import { createFileRoute, useRouter } from "@tanstack/react-router"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { readSharedExport } from "@/lib/api/video/export-shares"
import { sharedFileUrl } from "@/lib/video/export-shares"

/**
 * The page a share link opens: the video and its title, and nothing else. No
 * account, no other exports and no link back into the app, because whoever
 * opens it may have no account at all.
 *
 * The token rides in the query rather than the path so the page-view counter,
 * which keeps paths and drops queries, never writes a live link into the
 * traffic figures. It is not a registered public page on purpose: it has no
 * place in the sitemap or the menu, and search engines are told to leave it.
 */
export const Route = createFileRoute("/share")({
  validateSearch: (search: Record<string, unknown>) => ({
    token: typeof search.token === "string" ? search.token : undefined,
  }),
  loaderDeps: ({ search }) => ({ token: search.token }),
  loader: ({ deps }) => (deps.token ? readSharedExport(deps.token) : null),
  head: ({ loaderData }) => {
    const title = loaderData?.title || "Shared video"
    return {
      meta: [
        { title },
        { property: "og:title", content: title },
        { name: "robots", content: "noindex, nofollow" },
      ],
    }
  },
  component: SharedVideoRoute,
  errorComponent: SharedVideoError,
})

function SharedVideoRoute() {
  const view = Route.useLoaderData()
  const { token } = Route.useSearch()
  const router = useRouter()

  if (!view || !token) {
    return (
      <SharedVideoNotice
        title="This video is no longer available"
        text="The link may have been turned off or run out, or the video was deleted. Ask whoever sent it for a new link."
      />
    )
  }

  const ratio =
    view.width && view.height ? view.width / view.height : 16 / 9

  return (
    <main className="flex min-h-svh items-center justify-center bg-muted/60 p-2 md:p-3">
      <div
        className="grid gap-2 md:gap-3"
        // As wide as the page allows, but never so wide that a tall video runs
        // off the bottom of the screen.
        style={{ width: `min(100%, calc(85svh * ${ratio}))` }}
      >
        <video
          src={sharedFileUrl(token)}
          controls
          playsInline
          preload="metadata"
          className="w-full rounded-lg bg-black"
          style={{ aspectRatio: String(ratio) }}
          // A link turned off while the video plays refuses the next piece of
          // the file and the player gives up. Asking again swaps the player
          // for the notice when that is why; any other failure keeps the
          // player's own error.
          onError={() => void router.invalidate()}
        />
        <h1
          className={
            view.title ? "truncate text-lg font-semibold" : "sr-only"
          }
          title={view.title ?? undefined}
        >
          {view.title || "Shared video"}
        </h1>
      </div>
    </main>
  )
}

function SharedVideoError() {
  const router = useRouter()
  return (
    <SharedVideoNotice
      title="This video could not be loaded"
      text="Something went wrong on our side. Try again in a moment."
      action={
        <Button type="button" onClick={() => void router.invalidate()}>
          Try again
        </Button>
      }
    />
  )
}

function SharedVideoNotice({
  title,
  text,
  action,
}: {
  title: string
  text: string
  action?: React.ReactNode
}) {
  return (
    <main className="flex min-h-svh items-center justify-center bg-muted/60 p-2 md:p-3">
      <Card className="w-full max-w-md">
        <CardContent className="flex flex-col items-center gap-2 py-8 text-center">
          <h1 className="text-lg font-semibold">{title}</h1>
          <p className="text-sm text-muted-foreground">{text}</p>
          {action ? <div className="pt-2">{action}</div> : null}
        </CardContent>
      </Card>
    </main>
  )
}
