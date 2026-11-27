import * as React from "react"
import { createFileRoute, useRouter } from "@tanstack/react-router"
import { Loader2Icon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { readSharedExport } from "@/lib/api/video/export-shares"
import {
  sharedFileUrl,
  sharedSlideUrl,
  type SharedExportView,
} from "@/lib/video/export-shares"

/**
 * The page a share link opens: the video and its title, and nothing else. No
 * account, no other exports and no link back into the app, because whoever
 * opens it may have no account at all. A shared carousel shows its slides one
 * after another, then its title and caption.
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
    const title =
      loaderData?.title ||
      (loaderData?.kind === "carousel" ? "Shared carousel" : "Shared video")
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
        title="This link is no longer available"
        text="The link may have been turned off or run out, or what it shared was deleted. Ask whoever sent it for a new link."
      />
    )
  }

  if (view.kind === "carousel") {
    return <SharedCarousel view={view} token={token} />
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

/**
 * A shared carousel: every slide, full width of a phone-sized column, then the
 * title and the caption as they were exported.
 */
function SharedCarousel({
  view,
  token,
}: {
  view: SharedExportView
  token: string
}) {
  const ratio =
    view.width && view.height ? view.width / view.height : 4 / 5
  const title = view.title || "Shared carousel"
  return (
    <main className="flex min-h-svh justify-center bg-muted/60 p-2 md:p-3">
      <div className="grid w-full max-w-[540px] content-start gap-2 md:gap-3">
        <ol className="grid gap-2 md:gap-3" aria-label="Slides">
          {Array.from({ length: view.slide_count }, (_, index) => (
            <li key={index}>
              <SharedSlide
                token={token}
                index={index}
                ratio={ratio}
                alt={`Slide ${index + 1} of ${view.slide_count}`}
              />
            </li>
          ))}
        </ol>
        <Card>
          <CardContent className="grid gap-2 py-4">
            <h1
              className={view.title ? "text-lg font-semibold" : "sr-only"}
            >
              {title}
            </h1>
            {view.caption ? (
              <p className="text-sm whitespace-pre-wrap [overflow-wrap:anywhere]">
                {view.caption}
              </p>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </main>
  )
}

type SlideState =
  | { state: "loading" }
  | { state: "ready"; url: string; video: boolean }
  | { state: "failed" }

/**
 * One slide, fetched and drawn from memory. A plain picture pointed at an app
 * address is turned away by the dev server, the same trap the export covers
 * work around. A slide refused because the link was turned off swaps the page
 * for the "no longer available" notice, as the video player does.
 */
function SharedSlide({
  token,
  index,
  ratio,
  alt,
}: {
  token: string
  index: number
  ratio: number
  alt: string
}) {
  const router = useRouter()
  const [slide, setSlide] = React.useState<SlideState>({ state: "loading" })

  React.useEffect(() => {
    let objectUrl: string | null = null
    let cancelled = false
    void (async () => {
      try {
        const response = await fetch(sharedSlideUrl(token, index), {
          cache: "no-store",
        })
        if (response.status === 404) {
          if (!cancelled) void router.invalidate()
          return
        }
        if (!response.ok) throw new Error(String(response.status))
        const blob = await response.blob()
        if (cancelled) return
        objectUrl = URL.createObjectURL(blob)
        setSlide({
          state: "ready",
          url: objectUrl,
          video: blob.type.startsWith("video/"),
        })
      } catch {
        if (!cancelled) setSlide({ state: "failed" })
      }
    })()
    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [index, router, token])

  if (slide.state === "ready" && slide.video) {
    // A video slide plays with its own controls, muted to start as on a
    // phone.
    return (
      <video
        src={slide.url}
        aria-label={alt}
        controls
        muted
        playsInline
        loop
        className="w-full rounded-lg border bg-black"
        style={{ aspectRatio: String(ratio) }}
      />
    )
  }
  if (slide.state === "ready") {
    return (
      <img
        src={slide.url}
        alt={alt}
        // A border, so a pale slide still reads as a slide on the grey page.
        className="w-full rounded-lg border bg-background"
        style={{ aspectRatio: String(ratio) }}
      />
    )
  }
  return (
    <div
      className="grid w-full place-items-center rounded-lg border bg-background text-sm text-muted-foreground"
      style={{ aspectRatio: String(ratio) }}
      role={slide.state === "failed" ? "alert" : undefined}
    >
      {slide.state === "failed" ? (
        "This slide could not be loaded. Reload the page to try again."
      ) : (
        <Loader2Icon className="size-5 animate-spin" aria-label="Loading" />
      )}
    </div>
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
