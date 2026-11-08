import * as React from "react"
import {
  BellRingIcon,
  EllipsisVerticalIcon,
  HourglassIcon,
  LayersIcon,
  LayoutDashboardIcon,
  PlusIcon,
  UsersIcon,
} from "lucide-react"

import {
  blockView,
  useBlockCount,
  useBlockMenu,
} from "@/components/shared/notes/block-card"
import { DOT } from "@/components/crm/crm-table"
import { DashboardsRows } from "@/components/shared/notes/dashboards-rows"
import { SideRows } from "@/components/shared/notes/side-rows"
import {
  blockNode,
  keepOnPage,
  type AppBlock,
} from "@/components/shared/notes/note-block-nodes"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type { CrmBlockFigures } from "@/lib/api/crm/page"
import { CRM_STAGE_LABELS, CRM_STAGES, type CrmStage } from "@/lib/crm/crm"
import { CRM_SECTIONS_NODE } from "@/lib/crm/crm-page"
import { CRM_TAB_LABELS, CRM_TABS, type CrmTab } from "@/lib/crm/crm-search"
import { formatDate } from "@/lib/format/format-time"

/**
 * The CRM's own "/" blocks on its left page (the Admin 3 panel design,
 * 7 Nov 2026; Tyler: "Left panel list blocks like emails"). Each is Trade's
 * block card ("we need to use trade's card design though") and keeps no
 * values: it draws what the CRM screen hands down through `CrmBlocksProvider`.
 */

export type CrmBlocks = {
  figures: CrmBlockFigures | null
  /** The section the middle shows, and picking another, for the Dashboards block. */
  section: CrmTab
  onPickSection: (section: CrmTab) => void
  /** How many widgets Overview shows; null while the layout is read. */
  widgetCount: number | null
  /** The address the inbox is narrowed to, lowered, or "". */
  activeAddress: string
  onAddress: (address: string) => void
  activeStage: CrmStage | "all"
  onStage: (stage: CrmStage | "all") => void
  /** The conversation open on the right, so its row looks picked. */
  openThreadId: string | null
  onOpenThread: (threadId: string) => void
  /** The segment the People tab is showing, or "". */
  activeSegment: string
  /** Shows a segment's people on the People tab; "" lets it go. */
  onSegment: (segmentId: string) => void
  /** A segment row's ⋯, drawn only where these are given: the People tab. */
  onEditSegment?: (segmentId: string) => void
  onDeleteSegment?: (segmentId: string) => void
  /** The Segments block's ⋮, Add a segment: the People tab's new segment window. */
  onNewSegment: () => void
}

const CrmBlocksContext = React.createContext<CrmBlocks | null>(null)

export function CrmBlocksProvider({
  value,
  children,
}: {
  value: CrmBlocks
  children: React.ReactNode
}) {
  return (
    <CrmBlocksContext.Provider value={value}>{children}</CrmBlocksContext.Provider>
  )
}

function useCrmBlocks() {
  return React.useContext(CrmBlocksContext)
}

/** What a block shows on a page with no CRM behind it. */
function NotHere() {
  return (
    <p className="p-3 text-xs text-muted-foreground">
      This block shows on the CRM dashboard.
    </p>
  )
}

/** A block row's ⋯, in the place of its count while the row is pointed at: Edit and Delete. */
function RowMenu({
  label,
  items,
}: {
  label: string
  items: { label: string; destructive?: boolean; onSelect: () => void }[]
}) {
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="ghost" size="icon-sm" aria-label={label} className="text-muted-foreground">
          <EllipsisVerticalIcon className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        {items.map((item) => (
          <DropdownMenuItem
            key={item.label}
            variant={item.destructive ? "destructive" : undefined}
            onSelect={item.onSelect}
          >
            {item.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function Reading() {
  return <p className="p-3 text-xs text-muted-foreground">Reading…</p>
}

/** Each section's count in the Dashboards block, from the figures; Overview counts its widgets. */
const SECTION_COUNT: Record<Exclude<CrmTab, "overview">, (figures: CrmBlockFigures) => number> = {
  inbox: (figures) => figures.openCount,
  people: (figures) => figures.peopleCount,
  broadcasts: (figures) => figures.broadcastCount,
}

/**
 * Dashboards: Overview, Inbox, People and Broadcasts, the one showing picked
 * (Tyler, 8 Nov 2026: "We need to get the CRM dashboard up to date with the
 * new admin dashboard"), as the Admin page's. Inbox counts open
 * conversations, People everybody once, Broadcasts every newsletter. Also
 * drawn on its own while the page is read.
 */
export function CrmSectionsBlock() {
  const blocks = useCrmBlocks()
  if (!blocks) return <NotHere />
  const { figures } = blocks
  return (
    <DashboardsRows
      current={blocks.section}
      onPick={blocks.onPickSection}
      sections={CRM_TABS.map((section) => ({
        key: section,
        label: CRM_TAB_LABELS[section],
        value:
          section === "overview"
            ? blocks.widgetCount?.toLocaleString()
            : figures
              ? SECTION_COUNT[section](figures).toLocaleString()
              : undefined,
      }))}
    />
  )
}

/**
 * Follow up today: leads whose chase date has come, soonest first, the note
 * or the date muted after the name. Pressing one opens their newest
 * conversation, and its row is picked while that conversation is open.
 */
function FollowUpsBlock() {
  const blocks = useCrmBlocks()
  const due = blocks?.figures?.followUps
  useBlockCount(due?.length || undefined)
  if (!blocks) return <NotHere />
  if (!due) return <Reading />
  return (
    <SideRows
      empty="Nobody to chase today."
      rows={due.map((lead) => ({
        key: lead.leadId,
        name: lead.name?.trim() || lead.email,
        line: lead.note?.trim() || `Due ${formatDate(lead.followUpAt)}`,
        picked: lead.threadId !== null && lead.threadId === blocks.openThreadId,
        onPress: () => {
          if (lead.threadId) blocks.onOpenThread(lead.threadId)
        },
      }))}
    />
  )
}

/** How many whole days ago, at least one. */
export function daysSince(iso: string) {
  return Math.max(1, Math.floor((new Date().getTime() - new Date(iso).getTime()) / 86_400_000))
}

/**
 * Waiting on you (CRM task 11): open conversations they wrote last and
 * nobody answered for the site's number of days, the longest waiting first,
 * how long in the pill. The number is the CRM settings ⋮'s; with the chase
 * off the block says so.
 */
function WaitingBlock() {
  const blocks = useCrmBlocks()
  const waiting = blocks?.figures?.waiting
  useBlockCount(waiting?.length || undefined)
  if (!blocks) return <NotHere />
  if (!waiting) return <Reading />
  if (!blocks.figures?.unansweredDays) {
    return (
      <p className="p-3 text-sm text-muted-foreground">
        The chase is off. The ⋮ at the top turns it on.
      </p>
    )
  }
  return (
    <SideRows
      empty="Nobody is waiting on you."
      rows={waiting.map((thread) => {
        const days = daysSince(thread.lastMessageAt)
        return {
          key: thread.threadId,
          name: thread.name?.trim() || thread.email,
          value: `${days} ${days === 1 ? "day" : "days"}`,
          picked: thread.threadId === blocks.openThreadId,
          onPress: () => blocks.onOpenThread(thread.threadId),
        }
      })}
    />
  )
}

/**
 * Segments: every saved segment of contacts with how many are in it. Pressing
 * one shows its people on People; pressing it again lets it go. The block's
 * ⋮ holds Add a segment, which opens People's new segment window, and Delete
 * block. On People a row's ⋯ has Edit and Delete.
 */
function SegmentsBlock() {
  const blocks = useCrmBlocks()
  const segments = blocks?.figures?.segments
  useBlockCount(segments?.length || undefined)
  useBlockMenu(
    blocks
      ? [{ label: "Add a segment", icon: <PlusIcon className="size-4" />, onSelect: blocks.onNewSegment }]
      : undefined
  )
  if (!blocks) return <NotHere />
  if (!segments) return <Reading />
  const { onEditSegment, onDeleteSegment } = blocks
  return (
    <SideRows
      empty="No segment yet. The ⋮ above, then Add a segment, makes one."
      rows={segments.map((segment) => ({
        key: segment.id,
        name: segment.name,
        value: segment.total.toLocaleString(),
        picked: blocks.activeSegment === segment.id,
        onPress: () => blocks.onSegment(blocks.activeSegment === segment.id ? "" : segment.id),
        menu:
          onEditSegment && onDeleteSegment ? (
            <RowMenu
              label={`More for ${segment.name}`}
              items={[
                { label: "Edit", onSelect: () => onEditSegment(segment.id) },
                { label: "Delete", destructive: true, onSelect: () => onDeleteSegment(segment.id) },
              ]}
            />
          ) : undefined,
      }))}
    />
  )
}

/**
 * Stages: how many leads are at each one, with the stage's dot from the
 * tables. Pressing one narrows the inbox to it; pressing it again lets it go.
 */
function StagesBlock() {
  const blocks = useCrmBlocks()
  if (!blocks) return <NotHere />
  const stages = blocks.figures?.stages
  if (!stages) return <Reading />
  return (
    <SideRows
      empty=""
      rows={CRM_STAGES.map((stage) => ({
        key: stage,
        name: CRM_STAGE_LABELS[stage],
        dot: DOT.stage[stage],
        value: stages[stage].toLocaleString(),
        picked: blocks.activeStage === stage,
        onPress: () => blocks.onStage(blocks.activeStage === stage ? "all" : stage),
      }))}
    />
  )
}

const SectionsBlockView = blockView({
  kind: "crm-sections",
  title: "Dashboards",
  icon: <LayoutDashboardIcon />,
  Draw: CrmSectionsBlock,
  fixed: true,
})

const FollowUpsBlockView = blockView({
  kind: "crm-follow-ups",
  title: "Follow up today",
  icon: <BellRingIcon />,
  Draw: FollowUpsBlock,
})

const WaitingBlockView = blockView({
  kind: "crm-waiting",
  title: "Waiting on you",
  icon: <HourglassIcon />,
  Draw: WaitingBlock,
})

const SegmentsBlockView = blockView({
  kind: "crm-segments",
  title: "Segments",
  icon: <UsersIcon />,
  Draw: SegmentsBlock,
})

const StagesBlockView = blockView({
  kind: "crm-stages",
  title: "Stages",
  icon: <LayersIcon />,
  Draw: StagesBlock,
})

/**
 * Every block the CRM page knows: Dashboards (fixed, never in the "/" list),
 * then the ones offered under Advanced blocks, in the "/" list's order. Their
 * node names are `CRM_PAGE_BLOCK_TYPES`, which the server cleans a saved page
 * with.
 */
export const CRM_APP_BLOCKS: readonly AppBlock[] = [
  {
    key: "crmSections",
    label: "Dashboards",
    icon: LayoutDashboardIcon,
    node: CRM_SECTIONS_NODE,
    extension: keepOnPage(blockNode(CRM_SECTIONS_NODE, {}, SectionsBlockView)),
    offered: false,
  },
  {
    key: "crmFollowUps",
    label: "Follow up today",
    icon: BellRingIcon,
    node: "noteCrmFollowUps",
    extension: blockNode("noteCrmFollowUps", {}, FollowUpsBlockView),
  },
  {
    key: "crmWaiting",
    label: "Waiting on you",
    icon: HourglassIcon,
    node: "noteCrmWaiting",
    extension: blockNode("noteCrmWaiting", {}, WaitingBlockView),
  },
  {
    key: "crmSegments",
    label: "Segments",
    icon: UsersIcon,
    node: "noteCrmSegments",
    extension: blockNode("noteCrmSegments", {}, SegmentsBlockView),
  },
  {
    key: "crmStages",
    label: "Stages",
    icon: LayersIcon,
    node: "noteCrmStages",
    extension: blockNode("noteCrmStages", {}, StagesBlockView),
  },
]
