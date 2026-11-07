import * as React from "react"
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react"
import { FolderKanbanIcon } from "lucide-react"

import { ProjectBlock, ProjectBlockButtons } from "@/components/project/admin-project-cards"
import { DailyCard, type DailyNow } from "@/components/project/daily-card"
import { RatingMonth, RatingTrend } from "@/components/project/daily-look-back"
import { BLOCK_FRAME, BlockLine, BlockTools, SELECTED, type BlockEditing } from "@/components/project/notes/note-block-drawings"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import type { AdminDashboard } from "@/lib/api/project/admin-dashboard"
import type { DailyCard as DailyCardData } from "@/lib/api/project/daily-card"
import { cn } from "@/lib/utils"

/**
 * The blocks only the site admin's own page on My dashboard offers (task "My
 * dashboard/left-panel-blocks", Tyler, 6 Nov 2026): Projects, Daily card,
 * Rating calendar and Rating trend. They draw from what the dashboard already
 * loaded, handed down by `DashboardBlocksProvider`, so they follow its live
 * reloads and never ask the server on their own, except the two rating
 * blocks, which read the ratings as Look back does.
 */

export type DashboardBlocks = {
  projects: AdminDashboard["projects"]
  projectCards: AdminDashboard["projectCards"]
  /** The site admin's own today. */
  today: string
  /** The project My tasks is filtered to, and how a Projects block sets it. */
  picked: string | undefined
  onPick: (projectId: string | undefined) => void
  daily: DailyCardData
  now: DailyNow
}

const DashboardBlocksContext = React.createContext<DashboardBlocks | null>(null)

export function DashboardBlocksProvider({ value, children }: { value: DashboardBlocks; children: React.ReactNode }) {
  return <DashboardBlocksContext.Provider value={value}>{children}</DashboardBlocksContext.Provider>
}

function useDashboardBlocks() {
  return React.useContext(DashboardBlocksContext)
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

/** Fills the block in, then puts the cursor on the line under it, as the other blocks do. */
function fill(props: NodeViewProps, attrs: Record<string, unknown>) {
  props.updateAttributes(attrs)
  window.requestAnimationFrame(() => {
    const { editor } = props
    const at = props.getPos()
    if (editor.isDestroyed || typeof at !== "number") return
    const after = at + props.node.nodeSize
    const next = editor.state.doc.nodeAt(after)
    if (next?.isTextblock) editor.chain().focus().setTextSelection(after + 1).run()
    else editor.commands.focus()
  })
}

function textAttr(value: unknown) {
  return typeof value === "string" ? value : null
}

/** What an empty block or a gone one shows when the page isn't My dashboard's, which can't happen today. */
function NotHere({ editing, label }: { editing: BlockEditing; label: string }) {
  return (
    <BlockLine editing={editing} label={label}>
      This block shows on your My dashboard.
    </BlockLine>
  )
}

// --- Projects -----------------------------------------------------------------

export function ProjectBlockView(props: NodeViewProps) {
  const projectId = textAttr(props.node.attrs.projectId)
  return (
    <Frame selected={props.selected}>
      <ProjectDrawing projectId={projectId} editing={editingOf(props)} onPick={(next) => fill(props, { projectId: next })} />
    </Frame>
  )
}

export function ProjectDrawing({
  projectId,
  editing,
  onPick,
}: {
  projectId: string | null
  editing: BlockEditing
  onPick: (projectId: string) => void
}) {
  const blocks = useDashboardBlocks()
  if (!blocks) return <NotHere editing={editing} label="Remove projects block" />
  if (!projectId) {
    return (
      <>
        <div className={cn("rounded-md border bg-muted/40 p-3 pr-12", SELECTED)}>
          <ProjectSearch projects={blocks.projects} onPick={onPick} />
        </div>
        <BlockTools editing={editing} label="Remove projects block" />
      </>
    )
  }
  const project = blocks.projects.find((row) => row.id === projectId)
  if (!project) {
    return (
      <BlockLine editing={editing} label="Remove projects block">
        Removed: this project is no longer open.
      </BlockLine>
    )
  }
  const picked = blocks.picked === project.id
  return (
    <>
      <ProjectBlock
        project={project}
        extras={blocks.projectCards}
        today={blocks.today}
        picked={picked}
        onPick={() => blocks.onPick(picked ? undefined : project.id)}
      />
      <BlockTools editing={editing} label="Remove projects block" top="top-3">
        <ProjectBlockButtons project={project} />
      </BlockTools>
    </>
  )
}

/** The list an empty Projects block shows: every team's open projects, narrowed by what is typed. */
function ProjectSearch({ projects, onPick }: { projects: DashboardBlocks["projects"]; onPick: (projectId: string) => void }) {
  const [query, setQuery] = React.useState("")
  const inputId = React.useId()
  const words = query.trim().toLowerCase()
  const found = projects
    .filter((project) => !words || `${project.team.name} ${project.name}`.toLowerCase().includes(words))
    .sort((a, b) => a.name.localeCompare(b.name))
  return (
    <div className="grid gap-2">
      <Label htmlFor={inputId}>Pick a project</Label>
      <Input id={inputId} value={query} placeholder="Type part of its name" onChange={(event) => setQuery(event.target.value)} />
      {projects.length === 0 ? (
        <p className="py-1 text-sm text-muted-foreground">No team has an open project yet.</p>
      ) : found.length === 0 ? (
        <p className="py-1 text-sm text-muted-foreground">No open project has that in its name.</p>
      ) : (
        // A long list scrolls inside the block, so the page under it stays in reach.
        <ScrollArea viewportClassName="max-h-60">
        <ul role="listbox" aria-label="Projects" className="grid gap-0.5">
          {found.map((project) => (
            <li key={project.id}>
              <button
                type="button"
                role="option"
                aria-selected={false}
                className="flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
                onClick={() => onPick(project.id)}
              >
                <FolderKanbanIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <span className="grid min-w-0">
                  <span className="truncate">{project.name}</span>
                  <span className="truncate text-xs text-muted-foreground">{project.team.name}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
        </ScrollArea>
      )}
    </div>
  )
}

// --- Daily card -----------------------------------------------------------------

/**
 * The whole Daily card as a block (Tyler, 6 Nov 2026: "The habits block doesnt
 * really work properly. Just make it the same as the habits and greeting card
 * in the footer (and remove the footer card)"): the greeting, Start day, the
 * habits, Next meeting, Tomorrow, the reviews and Rate your day, in the
 * rounded grey box the footer drew it in, always open ("it doesnt need to be
 * a toggle"). It is the card itself, so every tick and button saves the way
 * the card always has. One per page.
 */
export function DailyCardBlockView(props: NodeViewProps) {
  return (
    <Frame selected={props.selected}>
      <DailyCardDrawing editing={editingOf(props)} />
    </Frame>
  )
}

export function DailyCardDrawing({ editing }: { editing: BlockEditing }) {
  const blocks = useDashboardBlocks()
  if (!blocks) return <NotHere editing={editing} label="Remove daily card" />
  return (
    <>
      {/* A solid light grey, so the sky behind the page never shows through it, and no
          "selected" ring: a click on a tick or a button inside selects the block, and the
          ring then sat round the card all the time (Tyler, 6 Nov 2026: "why is it so ugly?"). */}
      <div className="grid grid-cols-[minmax(0,1fr)] overflow-hidden rounded-2xl bg-[color-mix(in_oklab,var(--muted)_50%,var(--background))] [&_[data-daily-section]]:bg-background">
        <DailyCard daily={blocks.daily} now={blocks.now} checkin={null} boxed />
      </div>
      <BlockTools editing={editing} label="Remove daily card" />
    </>
  )
}

// --- Rating calendar and Rating trend -----------------------------------------

export function RatingMonthBlockView(props: NodeViewProps) {
  return (
    <Frame selected={props.selected}>
      <RatingMonthDrawing editing={editingOf(props)} />
    </Frame>
  )
}

export function RatingMonthDrawing({ editing }: { editing: BlockEditing }) {
  const blocks = useDashboardBlocks()
  if (!blocks) return <NotHere editing={editing} label="Remove rating calendar" />
  return (
    <>
      <div className={cn("rounded-md border bg-card p-3", SELECTED)}>
        <RatingMonth today={blocks.daily.cardDay} roomForTools={editing.editable} />
      </div>
      <BlockTools editing={editing} label="Remove rating calendar" top="top-3" />
    </>
  )
}

export function RatingTrendBlockView(props: NodeViewProps) {
  return (
    <Frame selected={props.selected}>
      <RatingTrendDrawing editing={editingOf(props)} />
    </Frame>
  )
}

export function RatingTrendDrawing({ editing }: { editing: BlockEditing }) {
  const blocks = useDashboardBlocks()
  if (!blocks) return <NotHere editing={editing} label="Remove rating trend" />
  return (
    <>
      <div className={cn("rounded-md border bg-card p-3", SELECTED)}>
        <RatingTrend today={blocks.daily.cardDay} roomForTools={editing.editable} />
      </div>
      <BlockTools editing={editing} label="Remove rating trend" />
    </>
  )
}
