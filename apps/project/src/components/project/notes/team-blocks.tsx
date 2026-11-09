import * as React from "react"
import { Link } from "@tanstack/react-router"
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react"
import {
  ActivityIcon,
  CircleAlertIcon,
  ClipboardCheckIcon,
  PlusIcon,
  UsersIcon,
  WeightIcon,
  type LucideIcon,
} from "lucide-react"

import { BLOCK_FRAME, BlockLine, type BlockEditing } from "@/components/project/notes/note-block-drawings"
import { ProjectBlockCard } from "@/components/project/notes/project-block-card"
import { CheckinsCard } from "@/components/project/team-checkins-card"
import { TeamFiguresGrid } from "@/components/project/team-figures"
import { MemberGroups } from "@/components/project/team-member-groups"
import { TeamSideCardTiles } from "@/components/project/team-side-card"
import { AttentionPanel, WorkloadPanel, useAttention } from "@/components/project/team-work-panels"
import { Button } from "@/components/ui/button"
import type { TeamDay } from "@/lib/api/project/checkins"
import type { TeamFigures, TeamMemberRow } from "@/lib/api/project/teams"
import { useTeamId } from "@/lib/project/team-scope"

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
 * Every team block is the shell's block card (task "Shell look/three-panel-shell-look",
 * Tyler, 9 Nov 2026: "Shell look, one tile"): a frosted grey box, its title
 * folding it, a ⋮ with Delete block while the page can be written in, and
 * what it shows on one white tile, its lists as the shell's one-line rows.
 * It was Project's own grey card with a bin from 7 Nov 2026.
 */
function TeamBlockCard({
  editing,
  kind,
  title,
  icon: Icon,
  count,
  children,
}: {
  editing: BlockEditing
  /** Names the fold this browser remembers. */
  kind: string
  title: string
  icon: LucideIcon
  count?: number
  children: React.ReactNode
}) {
  return (
    <ProjectBlockCard editing={editing} kind={`team-${kind}`} title={title} icon={<Icon className="size-4" />} count={count}>
      <TeamSideCardTiles>{children}</TeamSideCardTiles>
    </ProjectBlockCard>
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
    <TeamBlockCard editing={editing} kind="checkins" title="Check-ins" icon={ClipboardCheckIcon}>
      <CheckinsCard day={blocks.day} requested={blocks.requested} myUserId={blocks.myUserId} members={blocks.members} />
    </TeamBlockCard>
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
    <TeamBlockCard editing={editing} kind="workload" title="Workload" icon={WeightIcon}>
      <WorkloadPanel
        reload={blocks.reload}
        onOpenTask={blocks.onOpenTask}
        clients={blocks.clients}
        client={blocks.client}
        onClient={blocks.onClient}
      />
    </TeamBlockCard>
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
    <TeamBlockCard
      editing={editing}
      kind="attention"
      title="Attention"
      icon={CircleAlertIcon}
      count={attention.loaded.state === "ready" ? attention.loaded.value.length : undefined}
    >
      <AttentionPanel attention={attention} onOpenTask={blocks.onOpenTask} />
    </TeamBlockCard>
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
    <TeamBlockCard editing={editing} kind="week" title="This week" icon={ActivityIcon}>
      <TeamFiguresGrid figures={blocks.figures} />
      {/* A link that leads away sits at the foot of the card, not in its heading (UI standard). */}
      <div className="border-t p-1.5">
        <Button type="button" variant="ghost" size="sm" onClick={blocks.onTrends}>
          Trends
        </Button>
      </div>
    </TeamBlockCard>
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
    <TeamBlockCard editing={editing} kind="members" title="Members" icon={UsersIcon} count={blocks.members.length}>
      <MemberGroups
        members={blocks.members}
        myUserId={blocks.myUserId}
        canRun={blocks.canRun}
        busy={blocks.busy}
        onOpen={blocks.onOpenMember}
        onResend={blocks.onResend}
      />
      <div className="flex flex-wrap items-center gap-1 border-t p-1.5">
        {blocks.canRun ? (
          <Button type="button" variant="ghost" size="sm" onClick={blocks.onInvite}>
            <PlusIcon className="size-4" />
            Invite people
          </Button>
        ) : null}
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
    </TeamBlockCard>
  )
}
