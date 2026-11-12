import * as React from "react"
import { ArchiveIcon, ChevronRightIcon, LayersIcon, Loader2Icon, PauseIcon, PlayIcon } from "lucide-react"

import { blockView, useBlockCount } from "@/components/shared/notes/block-card"
import { blockNode, keepOnPage, type AppBlock } from "@/components/shared/notes/note-block-nodes"
import { SlideBar } from "@/components/shared/notes/side-rows"
import { Hint } from "@/components/social/hint"
import { NetworkIcon } from "@/components/social/network-icon"
import { Button } from "@/components/ui/button"
import { PROJECT_ARCHIVE_NODE, PROJECT_NETWORKS_NODE } from "@/lib/social/project-description"
import { NETWORK_NAMES, type Network } from "@/lib/social/networks"
import { isCommentingNetwork, type Side } from "@/lib/social/sides"
import { collapseStorageKey, useRememberedCollapse } from "@/lib/remembered-choice"
import { cn } from "@/lib/utils"

/**
 * What the Networks block draws, handed down by the project's left panel. The
 * block keeps no values of its own (`note-block-nodes.ts`).
 */
export type ProjectNetworksBlock = {
  /** Whose networks, so each project remembers its own folds in this browser. */
  projectId: string
  networks: Network[]
  /** The networks paused on their own, and those whose commenting alone is paused. */
  paused: Network[]
  pausedCommenting: Network[]
  /** Failed posts and drafts not sent, and posts and replies to answer, per network. */
  postCounts: Partial<Record<Network, number>>
  commentCounts: Partial<Record<Network, number>>
  /** The row showing in the middle; no network while the Archive shows. */
  selected: Network | null
  selectedSide: Side
  archiveSelected: boolean
  archiveCount: number
  /** Where the picked Commenting row's keywords are drawn by its module. */
  keywordSlot: (element: HTMLDivElement | null) => void
  onSelect: (network: Network, side: Side) => void
  onSelectArchive: () => void
  /** Null for a guest, who never pauses anything. */
  onToggleCommentingPause: ((network: Network, paused: boolean) => Promise<void>) | null
  /** Said when the project uses no network yet. */
  emptyLine: string
}

const ProjectNetworksContext = React.createContext<ProjectNetworksBlock | null>(null)

export function ProjectNetworksProvider({ value, children }: { value: ProjectNetworksBlock; children: React.ReactNode }) {
  return <ProjectNetworksContext.Provider value={value}>{children}</ProjectNetworksContext.Provider>
}

/**
 * Networks: one list in the block's white tile (Tyler, 12 Nov 2026, of the
 * first drawing, a list per network with small grey headings between them:
 * "what kind of Ui is this? ... fix it").
 *
 * - **Each network** is a heading line: its mark and name in the block
 *   heading's dark grey, with Paused after it while the whole network is.
 * - **Its rows** sit under it, indented to line up with the name: Posts, with
 *   how many need you (failed posts and drafts) in its pill, and, where it
 *   comments, Commenting, with how many wait to be answered. They are the
 *   shell's block rows (`side-rows.tsx`): grey names, the picked one dark
 *   with the sliding bar, the figure in the lightest grey pill. Pointing at
 *   Commenting shows its Pause commenting button in the pill's place.
 * - **The picked Commenting row's keywords** are listed under it, at the
 *   same indent.
 *
 * Tyler's rows of 5 Nov 2026 stay: "Make each network have its own card and
 * inside that cade have 2 rows, one for posts and one for commenting".
 */
function NetworksBlock() {
  const block = React.useContext(ProjectNetworksContext)
  const [busy, setBusy] = React.useState<Network | null>(null)
  useBlockCount(block?.networks.length || undefined)
  if (!block) return <p className="p-3 text-xs text-muted-foreground">This block shows on a project's own page.</p>

  const toggleCommenting = (network: Network, paused: boolean) => {
    const toggle = block.onToggleCommentingPause
    if (!toggle) return
    setBusy(network)
    void toggle(network, paused).finally(() => setBusy(null))
  }

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] p-1.5">
      {!block.networks.length ? <p className="px-2.5 py-1.5 text-sm text-muted-foreground">{block.emptyLine}</p> : null}
      {block.networks.map((network, index) => {
        const name = NETWORK_NAMES[network]
        const isPaused = block.paused.includes(network)
        const commentingPaused = block.pausedCommenting.includes(network)
        const posts = block.postCounts[network] ?? 0
        const waiting = block.commentCounts[network] ?? 0
        const pickedCommenting = network === block.selected && block.selectedSide === "commenting"
        return (
          <NetworkFold
            key={network}
            projectId={block.projectId}
            network={network}
            first={index === 0}
            paused={isPaused}
            waiting={posts + (isCommentingNetwork(network) ? waiting : 0)}
            picked={network === block.selected}
          >
            <NetworkRow
              name="Posts"
              value={posts}
              picked={network === block.selected && block.selectedSide === "posts"}
              onPress={() => block.onSelect(network, "posts")}
            />
            {isCommentingNetwork(network) ? (
              <NetworkRow
                name="Commenting"
                note={commentingPaused ? "Paused" : null}
                value={waiting}
                picked={pickedCommenting}
                onPress={() => block.onSelect(network, "commenting")}
                menu={
                  block.onToggleCommentingPause ? (
                    <Hint
                      label={
                        commentingPaused
                          ? `Resume commenting on ${name}`
                          : `Pause commenting on ${name} alone. Comments wait; your own posts still go out.`
                      }
                    >
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        aria-label={commentingPaused ? `Resume commenting on ${name}` : `Pause commenting on ${name}`}
                        disabled={busy !== null}
                        onMouseDownCapture={(event) => event.preventDefault()}
                        onClick={() => toggleCommenting(network, !commentingPaused)}
                      >
                        {busy === network ? <Loader2Icon className="animate-spin" /> : commentingPaused ? <PlayIcon /> : <PauseIcon />}
                      </Button>
                    </Hint>
                  ) : null
                }
              />
            ) : null}
            {/* The picked network's keywords, drawn here by its Commenting header
                (`KeywordPicker`), at the rows' indent. The page's heading and
                paragraph sizes are reset, or the editor's would reach the list. */}
            {pickedCommenting ? (
              <div
                ref={block.keywordSlot}
                className="pt-1 pr-1 pb-1 pl-1 empty:hidden [&_:is(h1,h2,h3,h4,p)]:!m-0 [&_:is(h1,h2,h3,h4)]:!text-xs [&_:is(h1,h2,h3,h4)]:!leading-normal [&_p]:!text-sm [&_p]:!leading-snug"
              />
            ) : null}
          </NetworkFold>
        )
      })}
    </div>
  )
}

/**
 * A network as a toggle (Tyler, 12 Nov 2026: "each network its a toggle",
 * then his drawing, "style it like this"): its mark and its name in dark,
 * the arrow at the end pointing down while open and right while shut. Its
 * rows hang from a thin line under the mark. Each project remembers its
 * own folds in this browser. The network whose row is showing opens by
 * itself when it is picked, whatever was remembered; folding it again is
 * allowed. Folded, its name carries what waits on its rows in the pill, so
 * nothing waiting is hidden.
 */
function NetworkFold({
  projectId,
  network,
  first,
  paused,
  waiting,
  picked,
  children,
}: {
  projectId: string
  network: Network
  first: boolean
  paused: boolean
  /** Posts that need you and posts to answer, added together. */
  waiting: number
  picked: boolean
  children: React.ReactNode
}) {
  const name = NETWORK_NAMES[network]
  const [open, setOpen] = useRememberedCollapse(collapseStorageKey.settingsCard(`promo-network-${projectId}-${network}`))
  // Picked, it opens by itself; folding it again afterwards is allowed.
  React.useEffect(() => {
    if (picked) setOpen(true)
  }, [picked, setOpen])
  return (
    <section aria-label={name} className={cn("grid grid-cols-[minmax(0,1fr)]", !first && "mt-1")}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        // The toggle's press, not the page editor's around the block.
        onMouseDownCapture={(event) => event.preventDefault()}
        className="grid min-h-8 w-full min-w-0 grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 rounded-lg px-2.5 py-1 text-left text-sm font-medium text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset"
      >
        <span className="flex min-w-0 items-center gap-2 [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted-foreground">
          <NetworkIcon network={network} />
          <span className="truncate">{name}</span>
          {paused ? <span className="shrink-0 text-xs font-normal text-muted-foreground">Paused</span> : null}
        </span>
        {!open && waiting ? (
          <span className="shrink-0 rounded-full bg-muted/50 px-2.5 py-0.5 font-medium text-muted-foreground tabular-nums">
            {waiting.toLocaleString()}
          </span>
        ) : (
          <span />
        )}
        <ChevronRightIcon
          aria-hidden
          className={cn("size-4 shrink-0 text-muted-foreground/70 transition-transform duration-200", open && "rotate-90")}
        />
      </button>
      {/* Its rows hang from a thin line under the network's mark (Tyler's
          drawing, 12 Nov 2026: "style it like this"). The line is part of the
          rows' drawing, as the bar is, not a divider, so it has a grey of its
          own rather than Divider lines, which drew it too faint to see (Tyler:
          "i cant see the border line, its too faint"). */}
      {open ? (
        <div className="ml-[1.125rem] grid grid-cols-[minmax(0,1fr)] border-l border-zinc-300 py-0.5 dark:border-zinc-600">{children}</div>
      ) : null}
    </section>
  )
}

/**
 * One row of the block, drawn as the shell's block rows are (`SideRows`):
 * the sliding bar and the name, grey until picked, then the figure in its
 * pill. Indented under its network's name, or at the block's edge (Archive).
 */
function NetworkRow({
  name,
  flush = false,
  note = null,
  value,
  picked,
  onPress,
  menu = null,
}: {
  name: string
  /** At the block's edge rather than indented under a network: the Archive block's one row. */
  flush?: boolean
  note?: string | null
  value: number
  picked: boolean
  onPress: () => void
  /** Shown in the pill's place while the row is pointed at. */
  menu?: React.ReactNode
}) {
  return (
    <div className="group/row relative flex min-w-0 items-center">
      <button
        type="button"
        onClick={onPress}
        // The row's press, not the page editor's around the block.
        onMouseDownCapture={(event) => event.preventDefault()}
        aria-current={picked ? "true" : undefined}
        className={cn(
          "grid min-h-8 w-full min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-lg py-1 pr-2.5 text-left text-sm",
          flush ? "pl-2.5" : "pl-3.5",
          "hover:[&>[data-row-name]]:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset"
        )}
      >
        <span
          data-row-name=""
          // Grey and regular until picked; picked, dark and bold with the bar (Tyler's drawing).
          className={cn("flex min-w-0 items-center gap-2 transition-colors", picked ? "font-semibold text-foreground" : "font-normal text-muted-foreground")}
        >
          <span className="flex min-w-0 items-center">
            <SlideBar on={picked} />
            <span className="min-w-0 truncate">{name}</span>
          </span>
          {note ? <span className="shrink-0 text-xs font-normal">{note}</span> : null}
        </span>
        {value ? (
          <span
            className={cn(
              "shrink-0 rounded-full bg-muted/50 px-2.5 py-0.5 font-medium text-muted-foreground tabular-nums",
              menu && "group-hover/row:invisible group-focus-within/row:invisible [@media(hover:none)]:invisible"
            )}
          >
            {value.toLocaleString()}
          </span>
        ) : (
          <span />
        )}
      </button>
      {menu ? (
        <span className="absolute right-1.5 flex opacity-0 group-hover/row:opacity-100 group-focus-within/row:opacity-100 [@media(hover:none)]:opacity-100">
          {menu}
        </span>
      ) : null}
    </div>
  )
}

/**
 * Archive: the project's videos, carousels and pictures in a block of its
 * own under Networks (Tyler, 12 Nov 2026: "move the archive to its own
 * block"), its count on the heading. Its one row opens them in the middle and
 * right panels, picked with the sliding bar while they show.
 */
function ArchiveBlock() {
  const block = React.useContext(ProjectNetworksContext)
  useBlockCount(block?.archiveCount || undefined)
  if (!block) return <p className="p-3 text-xs text-muted-foreground">This block shows on a project's own page.</p>
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] p-1.5">
      <NetworkRow
        name="All items"
        flush
        value={block.archiveCount}
        picked={block.archiveSelected}
        onPress={block.onSelectArchive}
      />
    </div>
  )
}

const ArchiveBlockView = blockView({
  kind: "promo-archive",
  title: "Archive",
  icon: <ArchiveIcon />,
  Draw: ArchiveBlock,
  fixed: true,
})

const NetworksBlockView = blockView({
  kind: "promo-networks",
  title: "Networks",
  icon: <LayersIcon />,
  Draw: NetworksBlock,
  fixed: true,
})

/**
 * The project page's own blocks: the fixed Networks and Archive blocks,
 * never in the "/" list (`PROJECT_PAGE_BLOCK_TYPES`, which the server cleans
 * a page with).
 */
export const PROJECT_APP_BLOCKS: readonly AppBlock[] = [
  {
    key: "promoNetworks",
    label: "Networks",
    icon: LayersIcon,
    node: PROJECT_NETWORKS_NODE,
    extension: keepOnPage(blockNode(PROJECT_NETWORKS_NODE, {}, NetworksBlockView)),
    offered: false,
  },
  {
    key: "promoArchive",
    label: "Archive",
    icon: ArchiveIcon,
    node: PROJECT_ARCHIVE_NODE,
    extension: keepOnPage(blockNode(PROJECT_ARCHIVE_NODE, {}, ArchiveBlockView)),
    offered: false,
  },
]
