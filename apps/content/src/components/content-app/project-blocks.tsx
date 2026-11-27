import * as React from "react"
import { ArchiveIcon, ClapperboardIcon, FlameIcon, LayoutDashboardIcon, PlusIcon, SearchIcon } from "lucide-react"

import { blockView, useBlockCount } from "@/components/shared/notes/block-card"
import { DashboardsRows } from "@/components/shared/notes/dashboards-rows"
import { blockNode, keepOnPage, type AppBlock } from "@/components/shared/notes/note-block-nodes"
import { SlideBar } from "@/components/shared/notes/side-rows"
import { NetworkRow, notePress, useSlideIn } from "@/components/social/projects/project-networks-block"
import { NewVideoPopover } from "@/components/video-editor/new-video-popover"
import { SocialIcon } from "@/components/viral/social-icon"
import { ErrorRow } from "@/components/ui/error-row"
import { getPartsErrorMessage, loadProjectParts, type ProjectParts } from "@/lib/api/content-app/projects"
import { useLoad } from "@/lib/hooks/use-load"
import {
  PROJECT_CONTENT_NODE,
  PROJECT_DASHBOARDS_NODE,
  PROJECT_RESEARCH_NODE,
  PROJECT_VIDEOS_NODE,
  PROJECT_VIRAL_NODE,
} from "@/lib/social/project-description"
import { PROJECTS_SECTION_LABELS, RESEARCH_SECTIONS, type ResearchSection } from "@/lib/social/projects-dashboard-search"
import { VIDEO_STATUS_LABELS } from "@/lib/video/project-videos"
import { isSocial, SOCIAL_NAMES, type Social } from "@/lib/viral/socials"
import { cn } from "@/lib/utils"

/**
 * Content's blocks on a project's page, above the Promote block
 * (`workspace/docs/content-app.md`, "A project's own page"; Tyler, 26 Nov 2026:
 * "create one project and inside that project 3 panel dashboard, the left
 * panel have viral, video editor and promo"):
 *
 * - **Dashboards:** Overview, this project's widgets and the page's home, and
 *   Projects, the Projects dashboard's list. **Viral:** Vault, Hooks and
 *   Formats, every project's, on the Projects dashboard. The Projects
 *   dashboard's two blocks, drawn the same way (Tyler, 27 Nov 2026: "lets
 *   bring back the dashboard block for project. The only link we have there
 *   is overview, projects, vault, hook and format").
 *
 * - **Content:** the project's videos, carousels and pictures, its count on
 *   the heading and one row opening them (Tyler, 27 Nov 2026: "put content
 *   into its own block"), as Promo's Archive block was.
 * - **Research:** what Viral finds for the project, searched with its
 *   description: Found videos, the Vault, Winning ads, and a row per social.
 * - **Videos:** the project's videos, each opening the editor on the whole
 *   screen (Tyler, 26 Nov 2026: "Option 1: whole screen"), and New video,
 *   Video's own window.
 *
 * One row of the page is picked at a time, across these blocks and Promote,
 * with the sliding bar. Overview is the page's home (Tyler, 27 Nov 2026:
 * "Just make the home the overview"). The blocks keep no values; the page
 * draws them from the project (`note-block-nodes.ts`).
 */

/** The row of the page that fills the middle and right, outside the Promote block; Overview when none is. */
export type ProjectPick =
  | { kind: "overview" }
  | { kind: "content" }
  | { kind: "research"; section: "videos" | "vault" | "ads"; social: Social | null }
  | { kind: "video"; videoId: string }
  | { kind: "network" }

export type ContentProjectBlocks = {
  projectId: string
  /** A guest sent from Project: Content alone, as in Promo. */
  guest: boolean
  pick: ProjectPick
  /** The project's videos, carousels and pictures in its Archive. */
  contentCount: number
  /** The page's home, Overview: from its row, and when the network showing is taken off. */
  onOverview: () => void
  /** Dashboards' counts: the widgets Overview shows and every project. Null while read. */
  overviewCount: number | null
  projectsCount: number | null
  /** The Projects dashboard's list, and Viral's sections there. */
  onProjects: () => void
  onViral: (section: ResearchSection) => void
  onContent: () => void
  onResearch: (section: "videos" | "vault" | "ads", social: Social | null) => void
  onVideo: (videoId: string) => void
  /** A video New video made, and the panel it opens on when it started from a template. */
  onVideoCreated: (videoId: string, panel?: "templates") => void
}

type BlocksValue = ContentProjectBlocks & {
  parts: ProjectParts | null
  partsError: string | null
  retryParts: () => void
}

const ContentProjectContext = React.createContext<BlocksValue | null>(null)

/**
 * Hands the blocks what they draw, and reads the project's research and
 * videos once per page. `reloadKey` reads them again, after New video.
 */
export function ContentProjectProvider({
  value,
  reloadKey = 0,
  children,
}: {
  value: ContentProjectBlocks
  reloadKey?: number
  children: React.ReactNode
}) {
  const read = useLoad(
    () => (value.guest ? Promise.resolve(null) : loadProjectParts(value.projectId)),
    getPartsErrorMessage,
    { keys: [value.projectId, value.guest, reloadKey], remember: `content-project-parts-${value.projectId}` }
  )
  const blocks = React.useMemo<BlocksValue>(
    () => ({ ...value, parts: read.data, partsError: read.error, retryParts: read.retry }),
    [value, read.data, read.error, read.retry]
  )
  return <ContentProjectContext.Provider value={blocks}>{children}</ContentProjectContext.Provider>
}

const OUTSIDE = <p className="p-3 text-xs text-muted-foreground">This block shows on a project's own page.</p>

/** The Projects dashboard's Dashboards block on the project's page: Overview here, Projects there. */
function DashboardsBlock() {
  const block = React.useContext(ContentProjectContext)
  if (!block) return OUTSIDE
  if (block.guest) return <p className="px-4 py-3 text-sm text-muted-foreground">The dashboards show to the project's owner.</p>
  return (
    <DashboardsRows<"overview" | "projects" | "">
      current={block.pick.kind === "overview" ? "overview" : ""}
      onPick={(key) => (key === "projects" ? block.onProjects() : block.onOverview())}
      sections={[
        { key: "overview", label: "Overview", value: block.overviewCount?.toLocaleString() },
        { key: "projects", label: "Projects", value: block.projectsCount?.toLocaleString() },
      ]}
    />
  )
}

/** The Projects dashboard's Viral block on the project's page: every project's Vault, Hooks and Formats. */
function ViralBlock() {
  const block = React.useContext(ContentProjectContext)
  if (!block) return OUTSIDE
  if (block.guest) return <p className="px-4 py-3 text-sm text-muted-foreground">Viral shows to the project's owner.</p>
  return (
    <DashboardsRows<ResearchSection | "">
      current=""
      onPick={(key) => {
        if (key) block.onViral(key)
      }}
      sections={RESEARCH_SECTIONS.map((section) => ({ key: section, label: PROJECTS_SECTION_LABELS[section] }))}
    />
  )
}

function ContentBlock() {
  const block = React.useContext(ContentProjectContext)
  useBlockCount(block?.contentCount || undefined)
  if (!block) return OUTSIDE
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] p-1.5">
      <NetworkRow
        pressKey="content"
        name="All items"
        flush
        value={block.contentCount}
        picked={block.pick.kind === "content"}
        onPress={block.onContent}
      />
    </div>
  )
}

/** A row of Research with a social's mark, as a Promote network with Posts alone is drawn. */
function SocialRow({
  social,
  paused,
  value,
  picked,
  onPress,
}: {
  social: Social
  paused: boolean
  value: number
  picked: boolean
  onPress: () => void
}) {
  const key = `research:${social}`
  const { on, holder } = useSlideIn(key, picked)
  return (
    <button
      type="button"
      onClick={() => {
        notePress(key)
        onPress()
      }}
      // The row's press, not the page editor's around the block.
      onMouseDownCapture={(event) => event.preventDefault()}
      aria-current={picked ? "true" : undefined}
      aria-label={`${SOCIAL_NAMES[social]} videos`}
      className={cn(
        "grid min-h-8 w-full min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-lg py-1 pr-2.5 pl-3.5 text-left text-sm text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset",
        picked ? "font-semibold" : "font-normal text-muted-foreground"
      )}
    >
      <span ref={holder} className="flex min-w-0 items-center">
        <SlideBar on={on} />
        <span className="flex min-w-0 items-center gap-2">
          <SocialIcon social={social} />
          <span className="truncate">{SOCIAL_NAMES[social]}</span>
          {paused ? <span className="shrink-0 text-xs font-normal text-muted-foreground">Paused</span> : null}
        </span>
      </span>
      {value ? (
        <span className="shrink-0 rounded-full bg-muted/50 px-2.5 py-0.5 font-medium text-muted-foreground tabular-nums">
          {value.toLocaleString()}
        </span>
      ) : (
        <span />
      )}
    </button>
  )
}

function ResearchBlock() {
  const block = React.useContext(ContentProjectContext)
  const research = block?.parts?.research
  const fresh = research ? Object.values(research.found).reduce((sum, row) => sum + row.fresh, 0) : 0
  useBlockCount(fresh || undefined)
  if (!block) return OUTSIDE
  if (block.guest) return <p className="px-4 py-3 text-sm text-muted-foreground">Research shows to the project's owner.</p>
  if (block.partsError) return <ErrorRow message={block.partsError} onRetry={block.retryParts} />
  if (!research) return <p className="px-4 py-3 text-sm text-muted-foreground">Reading what Research found…</p>
  const pick = block.pick.kind === "research" ? block.pick : null
  const socials = research.socials.filter(isSocial)
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] p-1.5">
      <NetworkRow
        pressKey="research:videos"
        name="Found videos"
        flush
        value={fresh}
        picked={pick?.section === "videos" && !pick.social}
        onPress={() => block.onResearch("videos", null)}
      />
      <NetworkRow
        pressKey="research:vault"
        name="Vault"
        flush
        value={research.vaultCount}
        picked={pick?.section === "vault"}
        onPress={() => block.onResearch("vault", null)}
      />
      <NetworkRow
        pressKey="research:ads"
        name="Winning ads"
        flush
        value={0}
        picked={pick?.section === "ads"}
        onPress={() => block.onResearch("ads", null)}
      />
      {socials.length ? (
        <div className="mt-1 grid grid-cols-[minmax(0,1fr)]">
          {socials.map((social) => (
            <SocialRow
              key={social}
              social={social}
              paused={research.pausedSocials.includes(social)}
              value={research.found[social]?.fresh ?? 0}
              picked={pick?.section === "videos" && pick.social === social}
              onPress={() => block.onResearch("videos", social)}
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}

function VideosBlock() {
  const block = React.useContext(ContentProjectContext)
  const videos = block?.parts?.videos.filter((video) => !video.archived) ?? []
  useBlockCount(videos.length || undefined)
  if (!block) return OUTSIDE
  if (block.guest) return <p className="px-4 py-3 text-sm text-muted-foreground">Videos show to the project's owner.</p>
  if (block.partsError) return <ErrorRow message={block.partsError} onRetry={block.retryParts} />
  if (!block.parts) return <p className="px-4 py-3 text-sm text-muted-foreground">Reading the project's videos…</p>
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] p-1.5">
      {!videos.length ? <p className="px-2.5 py-1.5 text-sm text-muted-foreground">No video yet.</p> : null}
      {videos.map((video) => (
        <NetworkRow
          key={video.id}
          pressKey={`video:${video.id}`}
          name={video.name}
          flush
          note={VIDEO_STATUS_LABELS[video.status]}
          value={0}
          picked={block.pick.kind === "video" && block.pick.videoId === video.id}
          onPress={() => block.onVideo(video.id)}
        />
      ))}
      {/* Video's own window: a name and a shape, or a template, never a made-up name (Tyler, 1 Nov 2026). */}
      <NewVideoPopover projectId={block.projectId} aspect="9:16" withTemplates onCreated={block.onVideoCreated}>
        <button
          type="button"
          onMouseDownCapture={(event) => event.preventDefault()}
          className="flex min-h-8 w-full items-center gap-2 rounded-lg px-2.5 py-1 text-left text-sm text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset [&_svg]:size-4"
        >
          <PlusIcon aria-hidden />
          New video
        </button>
      </NewVideoPopover>
    </div>
  )
}

const DashboardsBlockView = blockView({
  kind: "content-dashboards",
  title: "Dashboards",
  icon: <LayoutDashboardIcon />,
  Draw: DashboardsBlock,
  fixed: true,
})

const ViralBlockView = blockView({
  kind: "content-viral",
  title: "Viral",
  icon: <FlameIcon />,
  Draw: ViralBlock,
  fixed: true,
})

const ContentBlockView = blockView({
  kind: "content-content",
  title: "Content",
  icon: <ArchiveIcon />,
  Draw: ContentBlock,
  fixed: true,
})

const ResearchBlockView = blockView({
  kind: "content-research",
  title: "Research",
  icon: <SearchIcon />,
  Draw: ResearchBlock,
  fixed: true,
})

const VideosBlockView = blockView({
  kind: "content-videos",
  title: "Videos",
  icon: <ClapperboardIcon />,
  Draw: VideosBlock,
  fixed: true,
})

/** Content's fixed blocks, never in the "/" list (`PROJECT_PAGE_BLOCK_TYPES`). */
export const CONTENT_PROJECT_BLOCKS: readonly AppBlock[] = [
  {
    key: "contentDashboards",
    label: "Dashboards",
    icon: LayoutDashboardIcon,
    node: PROJECT_DASHBOARDS_NODE,
    extension: keepOnPage(blockNode(PROJECT_DASHBOARDS_NODE, {}, DashboardsBlockView)),
    offered: false,
  },
  {
    key: "contentViral",
    label: "Viral",
    icon: FlameIcon,
    node: PROJECT_VIRAL_NODE,
    extension: keepOnPage(blockNode(PROJECT_VIRAL_NODE, {}, ViralBlockView)),
    offered: false,
  },
  {
    key: "contentContent",
    label: "Content",
    icon: ArchiveIcon,
    node: PROJECT_CONTENT_NODE,
    extension: keepOnPage(blockNode(PROJECT_CONTENT_NODE, {}, ContentBlockView)),
    offered: false,
  },
  {
    key: "contentResearch",
    label: "Research",
    icon: SearchIcon,
    node: PROJECT_RESEARCH_NODE,
    extension: keepOnPage(blockNode(PROJECT_RESEARCH_NODE, {}, ResearchBlockView)),
    offered: false,
  },
  {
    key: "contentVideos",
    label: "Videos",
    icon: ClapperboardIcon,
    node: PROJECT_VIDEOS_NODE,
    extension: keepOnPage(blockNode(PROJECT_VIDEOS_NODE, {}, VideosBlockView)),
    offered: false,
  },
]
