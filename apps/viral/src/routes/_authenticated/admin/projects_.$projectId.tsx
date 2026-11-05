import { createFileRoute } from "@tanstack/react-router"

import { routeErrorComponent } from "@/components/shell/route-error"
import { ViralProjectScreenView } from "@/components/viral/viral-project-screen"
import { loadSavedViews } from "@/lib/api/saved-views"
import { getViralErrorMessage } from "@/lib/api/viral/viral"
import { loadViralProject } from "@/lib/api/viral/viral-projects"
import { readDirection, readOneOf, readSearchText } from "@/lib/nav/list-search"
import { savedViewScreen } from "@/lib/saved-views"
import { isSocial, type Social } from "@/lib/viral/socials"
import { readTextPostMin, TEXT_POST_SORTS, TEXT_POSTS_SAVED_VIEW_KIND } from "@/lib/viral/text-posts"
import { readStartMs } from "@/lib/viral/viral-breakdown"
import { VIRAL_SAVED_VIEW_KIND } from "@/lib/viral/viral-saved-views"
import {
  readSubscriberStep,
  VIRAL_FIT_CHOICES,
  VIRAL_SORTS,
  VIRAL_SOURCES,
  type ViralFit,
  type ViralSource,
} from "@/lib/viral/viral-view"

/** The middle panel's tabs other than Videos, which is the default, and the project's vault. */
const VIRAL_PROJECT_TABS = ["downloaded", "analysed", "hooks", "sounds", "vault", "ads"] as const

type ViralProjectSearch = {
  /** Videos is the default and stays out of the address. */
  view?: (typeof VIRAL_PROJECT_TABS)[number]
  /** The open video, `platform:id`; on the vault view the open vault item's id; with X, Reddit or LinkedIn picked, the open post's id. */
  open?: string
  /** Where the open video starts, in milliseconds: its hook, opened from Hooks. */
  at?: number
  /** The picked creator, `platform:channel`. */
  creator?: string
  /** The social picked in the left panel's Socials list; none shows every social's videos. */
  social?: Social
  sort?: (typeof VIRAL_SORTS)[number]
  direction?: "asc" | "desc"
  q?: string
  from?: Exclude<ViralSource, "both">
  keyword?: string
  fit?: ViralFit
  /** Followers from and up to, steps of the creators card's range. */
  fmin?: number
  fmax?: number
  /** On the Sounds tab, the picked sound's key (`soundKey`). */
  sound?: string
  /** The video whose "same idea, other creators" search fills the middle, `platform:id`. */
  same?: string
  /** With X, Reddit or LinkedIn picked, how its posts are sorted (`TEXT_POST_SORTS`). */
  psort?: (typeof TEXT_POST_SORTS)[number]
  /** With X, Reddit or LinkedIn picked, "asc" turns the sort round: lowest or oldest first. */
  pdir?: "asc"
  /** With X, Reddit or LinkedIn picked, the fewest likes a post may have (`TEXT_POST_MIN_STEPS`). */
  pmin?: number
}

/** A video or creator key, or a vault item's id: no oddities. */
function readKey(value: unknown) {
  return typeof value === "string" && /^[a-z]+:[A-Za-z0-9_@.-]{1,120}$|^[A-Za-z0-9-]{1,36}$/.test(value)
    ? value
    : undefined
}

function readFit(value: unknown): ViralFit | undefined {
  const fit = Number(value)
  return (VIRAL_FIT_CHOICES as readonly number[]).includes(fit) && fit > 0 ? (fit as ViralFit) : undefined
}

/**
 * One project's page, drawn as Travel's trip page (Tyler, 4 Nov 2026):
 * the project on the left, what its socials found in the middle, the open
 * video on the right. Everything the address can hold lives there, so a
 * reload or a pasted link opens the same video. The loader reads saved rows
 * only; it never asks YouTube.
 */
export const Route = createFileRoute("/_authenticated/admin/projects_/$projectId")({
  validateSearch: (search: Record<string, unknown>): ViralProjectSearch => ({
    view: readOneOf(search.view, VIRAL_PROJECT_TABS),
    open: readKey(search.open),
    at: readStartMs(search.at),
    creator: readKey(search.creator),
    social: isSocial(search.social) ? search.social : undefined,
    sort: readOneOf(search.sort, VIRAL_SORTS),
    direction: readDirection(search.direction),
    q: readSearchText(search.q),
    from: readOneOf(search.from, VIRAL_SOURCES.filter((one) => one !== "both") as Exclude<ViralSource, "both">[]),
    keyword: readSearchText(search.keyword),
    fit: readFit(search.fit),
    fmin: readSubscriberStep(search.fmin) ?? undefined,
    fmax: readSubscriberStep(search.fmax) ?? undefined,
    sound: typeof search.sound === "string" && search.sound.length <= 520 ? search.sound : undefined,
    same: readKey(search.same),
    psort: readOneOf(search.psort, TEXT_POST_SORTS),
    pdir: search.pdir === "asc" ? "asc" : undefined,
    pmin: readTextPostMin(search.pmin),
  }),
  loader: async ({ params }) => {
    const [screen, views, postViews] = await Promise.all([
      loadViralProject(params.projectId),
      loadSavedViews(savedViewScreen(VIRAL_SAVED_VIEW_KIND, params.projectId)),
      loadSavedViews(savedViewScreen(TEXT_POSTS_SAVED_VIEW_KIND, params.projectId)),
    ])
    return { screen, views, postViews }
  },
  component: ProjectRoute,
  errorComponent: routeErrorComponent(getViralErrorMessage),
})

function ProjectRoute() {
  const { screen, views, postViews } = Route.useLoaderData()
  return <ViralProjectScreenView key={screen.project.id} screen={screen} views={views} postViews={postViews} />
}
