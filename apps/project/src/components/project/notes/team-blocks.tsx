import * as React from "react"
import { Link } from "@tanstack/react-router"
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react"
import { PlusIcon, Trash2Icon } from "lucide-react"

import { FoldHeading } from "@/components/project/fold-heading"
import { BLOCK_FRAME, BlockLine, type BlockEditing } from "@/components/project/notes/note-block-drawings"
import { CheckinsCard } from "@/components/project/team-checkins-card"
import { TeamFiguresGrid } from "@/components/project/team-figures"
import { MemberGroups } from "@/components/project/team-member-groups"
import { TeamSideCardTiles } from "@/components/project/team-side-card"
import { AttentionPanel, WorkloadPanel, useAttention } from "@/components/project/team-work-panels"
import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { TeamDay } from "@/lib/api/project/checkins"
import type { TeamFigures, TeamMemberRow } from "@/lib/api/project/teams"
import { FOOTER_CARD_BODY } from "@/lib/project/panel-gutter"
import { useTeamId } from "@/lib/project/team-scope"
import { collapseStorageKey, useRememberedCollapse } from "@/lib/remembered-choice"
import { cn } from "@/lib/utils"

/**
 * The blocks only a team's own page on the Team dashboard offers (task "Team
 * dashboard/admin-3-panel-design", Tyler, 7 Nov 2026: "checkins, workload and
 * attention becomes blocks for the left panel"): Check-ins, Workload and
 * Attention, which were the right panel's tabs, and This week and Members,
 * which were the left panel's cards. They draw from what the Team dashboard
 * already loaded, handed down by `TeamBlocksProvider`, so they follow its
 * live reloads. Workload and Attention load their own lists, as their tabs
 * did.
 */

export type TeamBlocks = {
  /** The day picked on the calendar, today on arrival, and its check-ins. */
  day: TeamDay
  /** The day as the address names it, which the Check-ins block says it shows. */
  requested: string | undefined
  myUserId: string
  members: TeamMemberRow[]
  figures: TeamFigures
  /** The site admin, who alone sees Attention, resends invites and invites people. */
  canRun: boolean
  /** Changes when Workload and Attention should load again: a live change, or the open task. */
  reload: string
  onOpenTask: (taskId: string) => void
  clients: string[]
  client: string | undefined
  onClient: (client: string | undefined) => void
  /** A resend is saving. */
  busy: boolean
  onOpenMember: (member: TeamMemberRow) => void
  onResend: (member: TeamMemberRow) => void
  onInvite: () => void
  onTrends: () => void
}

const TeamBlocksContext = React.createContext<TeamBlocks | null>(null)

export function TeamBlocksProvider({ value, children }: { value: TeamBlocks; children: React.ReactNode }) {
  return <TeamBlocksContext.Provider value={value}>{children}</TeamBlocksContext.Provider>
}

function useTeamBlocks() {
  return React.useContext(TeamBlocksContext)
}

/** The frame each block sits in, as every other "/" block's. */
function Frame({ selected, children }: { selected: boolean; children: React.ReactNode }) {
  return (
    <NodeViewWrapper data-selected={selected || undefined} data-note-block="" data-note-atom="" className={BLOCK_FRAME}>
      {children}
    </NodeViewWrapper>
  )
}

function editingOf({ editor, deleteNode }: NodeViewProps): BlockEditing {
  return { editable: editor.isEditable, remove: deleteNode }
}

/** What a team block shows on any page but a team's, which can't happen today. */
function NotHere({ editing, label }: { editing: BlockEditing; label: string }) {
  return (
    <BlockLine editing={editing} label={label}>
      This block shows on the team's page.
    </BlockLine>
  )
}

/**
 * Every team block is one card: a solid light grey box, as the Daily card
 * block is, whose heading row holds the title and the bin while the page can
 * be written in, with no fold arrow (Tyler, 7 Nov 2026: "the header should be
 * here on the same row as the trashcan icon. Also clicking on the header
 * toggles the card"). Pressing the title folds it; the fold is remembered in
 * this browser, per block. The cards inside are white tiles.
 */
function BlockCard({
  editing,
  kind,
  title,
  count,
  removeLabel,
  bodyClassName,
  children,
}: {
  editing: BlockEditing
  /** Names the fold this browser remembers. */
  kind: string
  title: string
  count?: number
  removeLabel: string
  bodyClassName?: string
  children: React.ReactNode
}) {
  const [open, setOpen, noFlashKey] = useRememberedCollapse(collapseStorageKey.settingsCard(`team-block-${kind}`))
  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="grid grid-cols-[minmax(0,1fr)] overflow-hidden rounded-2xl bg-[color-mix(in_oklab,var(--muted)_50%,var(--background))]"
    >
      {/* The page's own heading look stops at the card, so the title sits level with the bin.
          No fold arrow (Tyler, 7 Nov 2026: "dont need to show this"): the title is the press. */}
      <FoldHeading
        band
        title={title}
        count={count}
        open={open}
        className="[&>button[aria-hidden]]:hidden [&>h2]:!m-0 [&>h2]:!p-0 [&>h2]:!text-base [&>h2]:!leading-tight [&>h2]:!font-semibold"
      >
        {editing.editable ? (
          // Shown while the block is pointed at or focused, and always on a phone, as every block's bin is.
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={removeLabel}
                className="text-muted-foreground opacity-0 group-hover/block:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100"
                onClick={editing.remove}
              >
                <Trash2Icon className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{removeLabel}</TooltipContent>
          </Tooltip>
        ) : null}
      </FoldHeading>
      <CollapsibleContent data-collapse-key={noFlashKey} className={cn("grid min-w-0 gap-3", FOOTER_CARD_BODY, bodyClassName)}>
        <TeamSideCardTiles>{children}</TeamSideCardTiles>
      </CollapsibleContent>
    </Collapsible>
  )
}

// --- Check-ins ----------------------------------------------------------------

export function CheckinsBlockView(props: NodeViewProps) {
  return (
    <Frame selected={props.selected}>
      <CheckinsDrawing editing={editingOf(props)} />
    </Frame>
  )
}

/** The picked day's check-ins, as the right panel's Check-ins tab drew them. */
export function CheckinsDrawing({ editing }: { editing: BlockEditing }) {
  const blocks = useTeamBlocks()
  if (!blocks) return <NotHere editing={editing} label="Remove check-ins" />
  return (
    <BlockCard editing={editing} kind="checkins" title="Check-ins" removeLabel="Remove check-ins">
      <CheckinsCard day={blocks.day} requested={blocks.requested} myUserId={blocks.myUserId} members={blocks.members} />
    </BlockCard>
  )
}

// --- Workload -----------------------------------------------------------------

export function WorkloadBlockView(props: NodeViewProps) {
  return (
    <Frame selected={props.selected}>
      <WorkloadDrawing editing={editingOf(props)} />
    </Frame>
  )
}

export function WorkloadDrawing({ editing }: { editing: BlockEditing }) {
  const blocks = useTeamBlocks()
  if (!blocks) return <NotHere editing={editing} label="Remove workload" />
  return (
    <BlockCard editing={editing} kind="workload" title="Workload" removeLabel="Remove workload">
      <WorkloadPanel
        reload={blocks.reload}
        onOpenTask={blocks.onOpenTask}
        clients={blocks.clients}
        client={blocks.client}
        onClient={blocks.onClient}
      />
    </BlockCard>
  )
}

// --- Attention ----------------------------------------------------------------

export function AttentionBlockView(props: NodeViewProps) {
  return (
    <Frame selected={props.selected}>
      <AttentionDrawing editing={editingOf(props)} />
    </Frame>
  )
}

/**
 * What needs attention, the site admin's alone as its tab was: a member
 * reading the page sees nothing in its place.
 */
export function AttentionDrawing({ editing }: { editing: BlockEditing }) {
  const blocks = useTeamBlocks()
  if (!blocks) return <NotHere editing={editing} label="Remove attention" />
  if (!blocks.canRun) return null
  return <AttentionCards editing={editing} blocks={blocks} />
}

function AttentionCards({ editing, blocks }: { editing: BlockEditing; blocks: TeamBlocks }) {
  const attention = useAttention(true, blocks.reload)
  return (
    <BlockCard
      editing={editing}
      kind="attention"
      title="Attention"
      count={attention.loaded.state === "ready" ? attention.loaded.value.length : undefined}
      removeLabel="Remove attention"
    >
      <AttentionPanel attention={attention} onOpenTask={blocks.onOpenTask} />
    </BlockCard>
  )
}

// --- This week ----------------------------------------------------------------

export function WeekBlockView(props: NodeViewProps) {
  return (
    <Frame selected={props.selected}>
      <WeekDrawing editing={editingOf(props)} />
    </Frame>
  )
}

/** The team's four figures for the week, with Trends at its foot. */
export function WeekDrawing({ editing }: { editing: BlockEditing }) {
  const blocks = useTeamBlocks()
  if (!blocks) return <NotHere editing={editing} label="Remove this week" />
  return (
    <BlockCard editing={editing} kind="week" title="This week" removeLabel="Remove this week" bodyClassName="pb-2">
      {/* The figures run to the card's edges, under a line, as Tyler drew them. */}
      <div className="pb-4">
        <TeamFiguresGrid figures={blocks.figures} />
      </div>
      {/* A link that leads away sits at the foot of the card, not in its heading (UI standard). */}
      <div className="-mx-4 -mt-3 border-t px-2 pt-2">
        <Button type="button" variant="ghost" size="sm" onClick={blocks.onTrends}>
          Trends
        </Button>
      </div>
    </BlockCard>
  )
}

// --- Members ------------------------------------------------------------------

export function MembersBlockView(props: NodeViewProps) {
  return (
    <Frame selected={props.selected}>
      <MembersDrawing editing={editingOf(props)} />
    </Frame>
  )
}

/** Who is on the team, active then invited, with Invite people and Manage at its foot. */
export function MembersDrawing({ editing }: { editing: BlockEditing }) {
  const blocks = useTeamBlocks()
  const teamId = useTeamId()
  if (!blocks) return <NotHere editing={editing} label="Remove members" />
  return (
    <BlockCard editing={editing} kind="members" title="Members" count={blocks.members.length} removeLabel="Remove members">
      <MemberGroups
        members={blocks.members}
        myUserId={blocks.myUserId}
        canRun={blocks.canRun}
        busy={blocks.busy}
        onOpen={blocks.onOpenMember}
        onResend={blocks.onResend}
      />
      {blocks.canRun ? (
        <Button type="button" className="w-full" onClick={blocks.onInvite}>
          <PlusIcon className="size-4" />
          Invite people
        </Button>
      ) : null}
      <div className="-mx-2 -mb-2">
        <Button asChild variant="ghost" size="sm">
          {teamId ? (
            <Link to="/teams/$teamId/members" params={{ teamId }}>
              Manage
            </Link>
          ) : (
            <Link to="/team/members">Manage</Link>
          )}
        </Button>
      </div>
    </BlockCard>
  )
}
