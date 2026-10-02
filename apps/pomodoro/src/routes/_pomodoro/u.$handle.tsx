import { createFileRoute, notFound } from "@tanstack/react-router"

import { PublicProfilePage } from "@/components/pomodoro/public-profile-page"
import { routeErrorComponent } from "@/components/shell/route-error"
import { readPublicProfile } from "@/lib/api/pomodoro/public-profile"
import { isHandleAvailableShape } from "@/lib/pomodoro/public-profile"

/**
 * One person's public page, `/u/<handle>`.
 *
 * Under `_pomodoro`, so it draws in the product's own shell with the sidebar,
 * the header and the scene behind it, the same as every other screen in this
 * app. The group and room invite pages are the precedent: a page a stranger
 * lands on from a shared link is still this app's page, not one of the
 * shell's signed-out marketing pages. The Pomoder tokens the profile draws
 * with (`--p-accent`, `--p-fg-rgb`) only exist inside this shell, so a
 * profile outside it drew its heatmap in transparent squares.
 *
 * Four things answer 404 and they answer it identically: a handle that is not
 * even handle-shaped, a handle nobody holds, a profile switched off, and a
 * deleted account. Nobody can learn from the response whether a profile ever
 * existed, the same rule the streak badge route follows.
 *
 * The shape check runs here, before the endpoint is called at all, so a
 * handle carrying a NUL byte never reaches Postgres.
 */
export const Route = createFileRoute("/_pomodoro/u/$handle")({
  loader: async ({ params }) => {
    const handle = params.handle.toLowerCase()
    if (!isHandleAvailableShape(handle)) throw notFound()
    const profile = await readPublicProfile(handle)
    if (!profile) throw notFound()
    return { profile }
  },
  errorComponent: routeErrorComponent(
    () => "This profile could not be loaded. Reload to try again."
  ),
  component: PublicProfileRoute,
  head: ({ loaderData }) => {
    if (!loaderData) return {}
    const { profile } = loaderData
    const description =
      profile.bio ??
      `${profile.name}'s focus record, published by ${profile.name}.`
    // The card is a PNG because X, Slack and iMessage all refuse SVG in a
    // preview. Both the Open Graph and the Twitter names are given, because
    // the services that unfurl links read one or the other and not both.
    const card = `/badge/profile/${profile.handle}.png`
    return {
      meta: [
        { title: `${profile.name} · Focus profile` },
        { name: "description", content: description },
        { property: "og:title", content: `${profile.name} · Focus profile` },
        { property: "og:description", content: description },
        { property: "og:type", content: "profile" },
        { property: "og:image", content: card },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: `${profile.name} · Focus profile` },
        { name: "twitter:description", content: description },
        { name: "twitter:image", content: card },
      ],
    }
  },
})

function PublicProfileRoute() {
  const { profile } = Route.useLoaderData()
  return <PublicProfilePage profile={profile} />
}
