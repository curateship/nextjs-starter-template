import { createFileRoute, notFound } from "@tanstack/react-router"

import { PublicPageFrame } from "@/components/shell/public-page-frame"
import { visitorRouteErrorComponent } from "@/components/shell/route-error"
import { PublicProfileContent } from "@/components/social/public-profile-view"
import { requirePageVisible } from "@/lib/api/content/pages"
import {
  getPublicProfileErrorMessage,
  readPublicProfile,
} from "@/lib/api/trade/public-profiles"
import {
  SHARE_IMAGE_HEIGHT,
  SHARE_IMAGE_WIDTH,
  signedWholeUsd,
} from "@/lib/trade/public-profile/share-image"

/**
 * One trader's public profile, open without an account.
 *
 * It follows the Traders page's on/off switch: hiding the leaderboard and
 * leaving every profile readable would be the switch not working. A handle
 * that is not public right now, whether it never existed, is switched off or
 * was hidden by an admin, is the same plain "not found", so none of the three
 * can be told apart from outside.
 */
export const Route = createFileRoute("/t/$handle")({
  loader: async ({ params }) => {
    const [, page] = await Promise.all([
      requirePageVisible("/traders"),
      readPublicProfile(params.handle),
    ])
    if (!page) throw notFound()
    return page
  },
  head: ({ loaderData }) => {
    if (!loaderData) return {}
    const { view, pageUrl, shareImageUrl } = loaderData
    const title = `${view.displayName} (@${view.handle}) on Trade`
    const description = `Made ${signedWholeUsd(view.figures.made["30d"].money)} in the last 30 days and ${signedWholeUsd(view.figures.made.all.money)} all time, from every real wallet, worked out by Trade.`
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:type", content: "profile" },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:url", content: pageUrl },
        { property: "og:image", content: shareImageUrl },
        { property: "og:image:type", content: "image/png" },
        { property: "og:image:width", content: String(SHARE_IMAGE_WIDTH) },
        { property: "og:image:height", content: String(SHARE_IMAGE_HEIGHT) },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: description },
        { name: "twitter:image", content: shareImageUrl },
        // Only a member who ticked "Let search engines list me" is listed.
        ...(view.searchable ? [] : [{ name: "robots", content: "noindex" }]),
      ],
      links: [{ rel: "canonical", href: pageUrl }],
    }
  },
  component: PublicProfileRoute,
  errorComponent: visitorRouteErrorComponent(getPublicProfileErrorMessage),
})

function PublicProfileRoute() {
  const { view } = Route.useLoaderData()
  return (
    <PublicPageFrame className="place-items-start justify-items-center [&>*]:w-full [&>*]:min-w-0">
      <div className="mx-auto flex w-full max-w-4xl min-w-0 flex-col gap-2 text-left md:gap-3">
        <PublicProfileContent view={view} />
      </div>
    </PublicPageFrame>
  )
}
