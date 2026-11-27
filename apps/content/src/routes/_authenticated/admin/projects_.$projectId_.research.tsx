import * as React from "react"
import { createFileRoute } from "@tanstack/react-router"

import { ProjectTopProvider } from "@/components/content-app/project-top"
import { useProjectTop } from "@/components/content-app/project-top-state"
import { useProjectsLeft } from "@/components/content-app/projects-left"
import { routeErrorComponent } from "@/components/shell/route-error"
import { ViralProjectScreenView } from "@/components/viral/viral-project-screen"
import { loadProjectParts } from "@/lib/api/content-app/projects"
import { loadSavedViews } from "@/lib/api/saved-views"
import { loadProject, type ProjectView } from "@/lib/api/social/projects"
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
  VIRAL_SHOWS,
  VIRAL_SORTS,
  VIRAL_SOURCES,
  type ViralFit,
  type ViralSource,
} from "@/lib/viral/viral-view"

/**
 * Research's lists other than Found videos, which is the default. Vault and
 * Winning ads were lists too until 27 Nov 2026 (Tyler: "Remove winning ads
 * feature ... and vault dont belong here"); an old link naming one opens
 * Found videos. Downloaded and Analysed were tabs
 * until 21 Nov 2026 (Tyler: "We dont need analyzed and downloaded its own tab
 * when it can be sectioned or filtered"); an old link naming one opens Videos
 * with Filter's Show set to it.
 */
const VIRAL_PROJECT_TABS = ["hooks", "sounds", "creators"] as const
const OLD_SHOW_TABS = ["downloaded", "analysed"] as const

type ViralProjectSearch = {
  /** Videos is the default and stays out of the address. */
  view?: (typeof VIRAL_PROJECT_TABS)[number]
  /** Filter's Show: every video (the default), the downloaded ones, or the analysed ones. */
  show?: (typeof VIRAL_SHOWS)[number]
  /** The open video, `platform:id`; on Creators the open creator, `platform:channel`; with X, Reddit or LinkedIn picked, the open post's id. */
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

/** A video or creator key, or a post's id: no oddities. */
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
 * A project's Research, drawn as Viral's project page was (Tyler, 4 Nov
 * 2026): what its socials found in the middle, the open video on the right.
 * In Content it is the project's Research tab: the Projects dashboard's left
 * panel stays on the left, and the address is the project's
 * (`workspace/docs/content-app.md`). Everything the address can hold lives there, so a
 * reload or a pasted link opens the same video. The loader reads saved rows
 * only; it never asks YouTube.
 */
export const Route = createFileRoute("/_authenticated/admin/projects_/$projectId_/research")({
  // Drawn in the browser only, as the Viral dashboard is: on the server the
  // shell's three-panel frame has no Settings → Styling to read, and drew the
  // side panels at other widths than the browser then did, so every load
  // failed to hydrate.
  ssr: false,
  validateSearch: (search: Record<string, unknown>): ViralProjectSearch => ({
    view: readOneOf(search.view, VIRAL_PROJECT_TABS),
    show: readOneOf(search.show, VIRAL_SHOWS) ?? readOneOf(search.view, OLD_SHOW_TABS),
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
    // The project's research row is made first when it is missing (`workspace/docs/content-app.md`).
    await loadProjectParts(params.projectId)
    const [project, screen, views, postViews] = await Promise.all([
      loadProject(params.projectId),
      loadViralProject(params.projectId),
      loadSavedViews(savedViewScreen(VIRAL_SAVED_VIEW_KIND, params.projectId)),
      loadSavedViews(savedViewScreen(TEXT_POSTS_SAVED_VIEW_KIND, params.projectId)),
    ])
    return { project, screen, views, postViews }
  },
  component: ProjectRoute,
  errorComponent: routeErrorComponent(getViralErrorMessage),
})

function ProjectRoute() {
  const { project, screen, views, postViews } = Route.useLoaderData()
  return <ResearchPage key={screen.project.id} initialProject={project} screen={screen} views={views} postViews={postViews} />
}

/**
 * Research inside the project: Viral's middle and right under the project's
 * tab row, with the Projects dashboard's left panel (Tyler, 27 Nov 2026: "I
 * dont want the left panel to change"). After the project's tabs, one
 * dropdown picks Research's list: Found videos, Hooks, Sounds or Creators
 * (`researchViews`), the Research block's rows and the
 * videos' own tabs before they moved into the one header. The socials it
 * reads are Filter's Social row.
 */
function ResearchPage({
  initialProject,
  screen,
  views,
  postViews,
}: {
  initialProject: ProjectView
  screen: Awaited<ReturnType<typeof loadViralProject>>
  views: Awaited<ReturnType<typeof loadSavedViews>>
  postViews: Awaited<ReturnType<typeof loadSavedViews>>
}) {
  const [project, setProject] = React.useState(initialProject)
  const { left, coverUrl } = useProjectsLeft({ section: "projects" })
  const { top, dialogs } = useProjectTop({
    view: project,
    onView: setProject,
    tab: "research",
    network: null,
    // Research's own dropdown, built where its counts are (`researchViews` in `viral-project-screen.tsx`).
    sub: null,
  })
  return (
    <ProjectTopProvider value={top}>
      <ViralProjectScreenView screen={screen} views={views} postViews={postViews} left={left} rightCover={coverUrl} />
      {dialogs}
    </ProjectTopProvider>
  )
}
