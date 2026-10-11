import { createFileRoute, notFound } from "@tanstack/react-router"

import { SharedFilePage } from "@/components/pomodoro/shared-file-page"
import { routeErrorComponent } from "@/components/shell/route-error"
import { readSharedFile } from "@/lib/api/pomodoro/shared-media"
import { isHandleAvailableShape } from "@/lib/pomodoro/public-profile"
import { creditLabel } from "@/lib/pomodoro/shared-media"

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * One shared file, `/u/<handle>/files/<id>` (task 03, part 7).
 *
 * `$handle_` keeps it from nesting inside the profile page, as the year
 * recap's route does. A handle or id of the wrong shape, an unshared, binned
 * or taken-down file, a switched-off or hidden profile and a block all
 * answer the same 404, so nobody can tell which it was.
 */
export const Route = createFileRoute("/_pomodoro/u/$handle_/files/$mediaId")({
  loader: async ({ params }) => {
    const handle = params.handle.toLowerCase()
    const mediaId = params.mediaId.toLowerCase()
    if (!isHandleAvailableShape(handle) || !UUID_PATTERN.test(mediaId))
      throw notFound()
    const data = await readSharedFile(handle, mediaId)
    if (!data) throw notFound()
    return { data }
  },
  errorComponent: routeErrorComponent(
    () => "This file could not be loaded. Reload to try again."
  ),
  component: SharedFileRoute,
  head: ({ loaderData }) => {
    if (!loaderData) return {}
    const { file, owner } = loaderData.data
    const title = `${file.name} ${creditLabel({ handle: owner.handle })}`
    const description =
      file.purpose === "sound"
        ? `A focus sound ${owner.name} shared on Pomoder.`
        : `A focus background ${owner.name} shared on Pomoder.`
    // A picture is its own preview, a clip its middle frame, and a sound
    // gets a drawn card, because no preview service plays sound.
    const image =
      file.purpose === "sound"
        ? `/badge/file/${file.mediaId}.png`
        : file.kind === "video"
          ? file.stillUrl || null
          : file.url
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
        ...(image
          ? [
              { property: "og:image", content: image },
              { name: "twitter:image", content: image },
            ]
          : []),
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: description },
      ],
    }
  },
})

function SharedFileRoute() {
  const { data } = Route.useLoaderData()
  return <SharedFilePage data={data} />
}
