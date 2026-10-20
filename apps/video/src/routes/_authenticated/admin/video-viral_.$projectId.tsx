import { createFileRoute } from "@tanstack/react-router"

import { routeErrorComponent } from "@/components/shell/route-error"
import { ViralProjectScreenView } from "@/components/video-viral/viral-project-screen"
import { getViralErrorMessage } from "@/lib/api/video/viral"
import { loadFavourites } from "@/lib/api/video/viral-collections"
import { loadViralProject } from "@/lib/api/video/viral-projects"
import { readDirection, readOneOf, readSearchText } from "@/lib/nav/list-search"
import {
  VIRAL_FIT_CHOICES,
  VIRAL_SORTS,
  VIRAL_SOURCES,
  type ViralFit,
} from "@/lib/video/viral-view"

type ViralProjectSearch = {
  /** Videos is the default and stays out of the address. */
  view?: "downloaded" | "broken" | "creators"
  /** The playing video, `platform:id`. */
  video?: string
  /** The picked creator, `platform:channel`. */
  creator?: string
  sort?: (typeof VIRAL_SORTS)[number]
  direction?: "asc" | "desc"
  q?: string
  from?: "search" | "creators"
  keyword?: string
  fit?: ViralFit
}

/** A video or creator key: a platform, a colon, and an id with no oddities. */
function readKey(value: unknown) {
  return typeof value === "string" && /^[a-z]+:[A-Za-z0-9_@.-]{1,120}$/.test(value)
    ? value
    : undefined
}

function readFit(value: unknown): ViralFit | undefined {
  const fit = Number(value)
  return (VIRAL_FIT_CHOICES as readonly number[]).includes(fit) && fit > 0
    ? (fit as ViralFit)
    : undefined
}

/**
 * One Viral project's three panels. Everything the address can hold lives
 * there, so a reload or a shared link opens the same video playing. The
 * loader reads saved rows only; it never asks YouTube.
 */
export const Route = createFileRoute("/_authenticated/admin/video-viral_/$projectId")({
  validateSearch: (search: Record<string, unknown>): ViralProjectSearch => ({
    view:
      search.view === "creators" ||
      search.view === "broken" ||
      search.view === "downloaded"
        ? search.view
        : undefined,
    video: readKey(search.video),
    creator: readKey(search.creator),
    sort: readOneOf(search.sort, VIRAL_SORTS),
    direction: readDirection(search.direction),
    q: readSearchText(search.q),
    from: readOneOf(
      search.from,
      VIRAL_SOURCES.filter((one) => one !== "both") as ("search" | "creators")[]
    ),
    keyword: readSearchText(search.keyword),
    fit: readFit(search.fit),
  }),
  loader: async ({ params }) => {
    const [screen, favourites] = await Promise.all([
      loadViralProject(params.projectId),
      loadFavourites(),
    ])
    return { screen, favourites }
  },
  component: AdminViralProjectRoute,
  errorComponent: routeErrorComponent(getViralErrorMessage),
})

function AdminViralProjectRoute() {
  const { screen, favourites } = Route.useLoaderData()
  return <ViralProjectScreenView screen={screen} favourites={favourites} />
}
