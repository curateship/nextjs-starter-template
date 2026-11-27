import * as React from "react"
import { ChevronRightIcon, EyeIcon, EyeOffIcon, LayersIcon } from "lucide-react"

import { blockView, useBlockCount, useBlockMenu } from "@/components/shared/notes/block-card"
import { blockNode, keepOnPage, type AppBlock } from "@/components/shared/notes/note-block-nodes"
import { SlideBar } from "@/components/shared/notes/side-rows"
import { NetworkIcon } from "@/components/social/network-icon"
import { PROJECT_NETWORKS_NODE } from "@/lib/social/project-description"
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
  /** The networks left out of the block, from its ⋮; the picked one still shows. */
  hidden: Network[]
  /** The networks paused on their own, and those whose commenting alone is paused. */
  paused: Network[]
  pausedCommenting: Network[]
  /** Failed posts and drafts not sent, per network. Commenting has no count (Tyler, 14 Nov 2026: "remove it"). */
  postCounts: Partial<Record<Network, number>>
  /** The row showing in the middle; none while another block's row shows. */
  selected: Network | null
  selectedSide: Side
  onSelect: (network: Network, side: Side) => void
  /** Saves a new order or a network hidden or shown, from the block's ⋮. Null for a guest. */
  onArrange: ((arranged: { order: Network[]; hidden: Network[] }) => Promise<void>) | null
  /** Said when the project uses no network yet. */
  emptyLine: string
}

const ProjectNetworksContext = React.createContext<ProjectNetworksBlock | null>(null)

/**
 * The row last pressed, and when. A press on another network draws the
 * project's columns again (each network's module draws its own), so the
 * picked row's bar arrives new rather than growing in, and the shell's
 * slide only moves a bar that was on screen at the press (`press-motion.ts`).
 * A row drawn within a moment of its own press starts its bar empty and
 * grows it, as the shell's slide does (Tyler, 14 Nov 2026: "the pill is
 * missing the sliding animation").
 */
let lastPress: { key: string; at: number } | null = null
const PRESS_FRESH_MS = 1500

export function notePress(key: string) {
  lastPress = { key, at: Date.now() }
}

/** Whether the picked bar shows yet: false for one frame on a row drawn just after its own press. */
export function useSlideIn(key: string, picked: boolean) {
  const holder = React.useRef<HTMLSpanElement | null>(null)
  const [held, setHeld] = React.useState(
    () => picked && lastPress?.key === key && Date.now() - lastPress.at < PRESS_FRESH_MS
  )
  React.useLayoutEffect(() => {
    if (!held) return
    const bar = holder.current?.querySelector("[data-dashboards-bar]")
    // Armed as the shell arms a bar under a press, so its width slides.
    bar?.setAttribute("data-slide-armed", "")
    const frame = requestAnimationFrame(() => setHeld(false))
    const done = window.setTimeout(() => bar?.removeAttribute("data-slide-armed"), 400)
    return () => {
      cancelAnimationFrame(frame)
      window.clearTimeout(done)
    }
  }, [held])
  return { on: picked && !held, holder }
}

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
 *   how many need you (failed posts and drafts) in its pill, and Commenting,
 *   with no count (Tyler, 14 Nov 2026, of its "2": "remove it"), and Paused
 *   after it while its commenting is. Pause commenting itself is at the foot of the network's
 *   keywords dropdown (`commenting-pause.ts`). Only a network with both rows folds
 *   (Tyler, 14 Nov 2026: "Only the network that have both post and
 *   commenting link should have the toggle, if not then just link the
 *   network straight to its posts"), so Instagram and TikTok are one line
 *   that opens their posts (`NetworkLink`). They are the
 *   shell's block rows (`side-rows.tsx`): grey names, the picked one dark
 *   with the sliding bar, the figure in the lightest grey pill.
 *
 * Tyler's rows of 5 Nov 2026 stay: "Make each network have its own card and
 * inside that cade have 2 rows, one for posts and one for commenting".
 */
function NetworksBlock() {
  const block = React.useContext(ProjectNetworksContext)
  const hidden = block?.hidden ?? []
  // The picked network shows while hidden, so what fills the middle always has its line.
  const shown = (block?.networks ?? []).filter((network) => !hidden.includes(network) || network === block?.selected)
  useBlockCount(shown.length || undefined)
  // The ⋮ lists every network with its grip and its eye: drag to reorder,
  // press to hide or show (Tyler, 14 Nov 2026: "i should be able to hide and
  // drag and drop networks here"), as the Dashboards block's ⋮ does.
  const arrange = block?.onArrange
  const order = block?.networks ?? []
  useBlockMenu(
    arrange
      ? order.map((network) => {
          const isHidden = hidden.includes(network)
          const name = NETWORK_NAMES[network]
          return {
            label: name,
            ariaLabel: `${isHidden ? "Show" : "Hide"} ${name}`,
            muted: isHidden,
            keepOpen: true,
            end: isHidden ? <EyeOffIcon aria-hidden /> : <EyeIcon aria-hidden />,
            sortKey: network,
            onSelect: () =>
              void arrange({ order, hidden: isHidden ? hidden.filter((other) => other !== network) : [...hidden, network] }),
          }
        })
      : undefined,
    arrange
      ? (keys) => void arrange({ order: keys.filter((key): key is Network => order.includes(key as Network)), hidden })
      : undefined
  )
  if (!block) return <p className="p-3 text-xs text-muted-foreground">This block shows on a project's own page.</p>


  return (
    <div className="grid grid-cols-[minmax(0,1fr)] p-1.5">
      {!block.networks.length ? <p className="px-2.5 py-1.5 text-sm text-muted-foreground">{block.emptyLine}</p> : null}
      {shown.map((network, index) => {
        const isPaused = block.paused.includes(network)
        const commentingPaused = block.pausedCommenting.includes(network)
        const posts = block.postCounts[network] ?? 0
        const pickedCommenting = network === block.selected && block.selectedSide === "commenting"
        // Posts alone (Instagram, TikTok): no toggle, the network opens its posts.
        if (!isCommentingNetwork(network)) {
          return (
            <NetworkLink
              key={network}
              network={network}
              first={index === 0}
              paused={isPaused}
              value={posts}
              picked={network === block.selected}
              onPress={() => block.onSelect(network, "posts")}
            />
          )
        }
        return (
          <NetworkFold
            key={network}
            projectId={block.projectId}
            network={network}
            first={index === 0}
            paused={isPaused}
            waiting={posts}
            picked={network === block.selected}
          >
            <NetworkRow
              pressKey={`${network}:posts`}
              name="Posts"
              value={posts}
              picked={network === block.selected && block.selectedSide === "posts"}
              onPress={() => block.onSelect(network, "posts")}
            />
            <NetworkRow
                pressKey={`${network}:commenting`}
                name="Commenting"
                note={commentingPaused ? "Paused" : null}
                value={0}
                picked={pickedCommenting}
                onPress={() => block.onSelect(network, "commenting")}
              />
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
 * allowed. Folded, its name carries its Posts count in the pill, so no
 * post that needs you is hidden.
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
  /** Your posts on it that need you: failed ones and drafts. */
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
 * A network with Posts alone, as one line that opens its posts: its mark and
 * name as a folding network's heading is drawn, with no arrow, the posts that
 * need you in the pill, and the sliding bar before the mark while its posts
 * show.
 */
function NetworkLink({
  network,
  first,
  paused,
  value,
  picked,
  onPress,
}: {
  network: Network
  first: boolean
  paused: boolean
  /** Failed posts and drafts not sent. */
  value: number
  picked: boolean
  onPress: () => void
}) {
  const name = NETWORK_NAMES[network]
  const { on: barOn, holder } = useSlideIn(`${network}:posts`, picked)
  return (
    <button
      type="button"
      onClick={() => {
        notePress(`${network}:posts`)
        onPress()
      }}
      // The line's press, not the page editor's around the block.
      onMouseDownCapture={(event) => event.preventDefault()}
      aria-current={picked ? "true" : undefined}
      aria-label={`${name} posts`}
      className={cn(
        "grid min-h-8 w-full min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-lg px-2.5 py-1 text-left text-sm text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset",
        picked ? "font-semibold" : "font-medium",
        !first && "mt-1"
      )}
    >
      <span ref={holder} className="flex min-w-0 items-center [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted-foreground">
        <SlideBar on={barOn} />
        <span className="flex min-w-0 items-center gap-2">
          <NetworkIcon network={network} />
          <span className="truncate">{name}</span>
          {paused ? <span className="shrink-0 text-xs font-normal text-muted-foreground">Paused</span> : null}
        </span>
      </span>
      {value ? (
        <span className="shrink-0 rounded-full bg-muted/50 px-2.5 py-0.5 font-medium text-muted-foreground tabular-nums">{value.toLocaleString()}</span>
      ) : (
        <span />
      )}
    </button>
  )
}

/**
 * One row of the block, drawn as the shell's block rows are (`SideRows`):
 * the sliding bar and the name, grey until picked, then the figure in its
 * pill. Indented under its network's name, or at the block's edge (Archive).
 */
export function NetworkRow({
  pressKey,
  name,
  flush = false,
  note = null,
  value,
  picked,
  onPress,
}: {
  /** Names the row across a redraw, such as "medium:posts", so its bar can grow in after a press. */
  pressKey: string
  name: string
  /** At the block's edge rather than indented under a network: the Archive block's one row. */
  flush?: boolean
  note?: string | null
  value: number
  picked: boolean
  onPress: () => void
}) {
  const { on: barOn, holder } = useSlideIn(pressKey, picked)
  return (
    <div className="group/row relative flex min-w-0 items-center">
      <button
        type="button"
        onClick={() => {
          notePress(pressKey)
          onPress()
        }}
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
          <span ref={holder} className="flex min-w-0 items-center">
            <SlideBar on={barOn} />
            <span className="min-w-0 truncate">{name}</span>
          </span>
          {note ? <span className="shrink-0 text-xs font-normal">{note}</span> : null}
        </span>
        {value ? (
          <span
            className="shrink-0 rounded-full bg-muted/50 px-2.5 py-0.5 font-medium text-muted-foreground tabular-nums"
          >
            {value.toLocaleString()}
          </span>
        ) : (
          <span />
        )}
      </button>
    </div>
  )
}

const NetworksBlockView = blockView({
  kind: "promo-networks",
  title: "Promote",
  icon: <LayersIcon />,
  Draw: NetworksBlock,
  fixed: true,
})

/**
 * The project page's Networks block, fixed and never in the "/" list
 * (`PROJECT_PAGE_BLOCK_TYPES`, which the server cleans a page with). In
 * Content its title is Promote, under the Dashboard, Research and Videos
 * blocks (`src/components/content-app/project-blocks.tsx`).
 */
export const PROJECT_APP_BLOCKS: readonly AppBlock[] = [
  {
    key: "promoNetworks",
    label: "Promote",
    icon: LayersIcon,
    node: PROJECT_NETWORKS_NODE,
    extension: keepOnPage(blockNode(PROJECT_NETWORKS_NODE, {}, NetworksBlockView)),
    offered: false,
  },
]
