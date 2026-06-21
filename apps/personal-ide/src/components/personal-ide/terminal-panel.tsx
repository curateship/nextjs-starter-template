import {
  DndContext,
  KeyboardCode,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  type DragEndEvent,
  useSensor,
  useSensors,
} from "@dnd-kit/core"
import {
  SortableContext,
  horizontalListSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable"
import { X } from "lucide-react"
import { lazy, Suspense, useCallback } from "react"
import type { ClipboardEvent as ReactClipboardEvent } from "react"

import {
  terminalStateFor,
} from "@/app/terminal"
import type { SkillItem, WorkspaceTerminalState } from "@/app/types"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const TerminalPane = lazy(() =>
  import("@/components/personal-ide/terminal-pane").then((module) => ({
    default: module.TerminalPane,
  }))
)

export function BottomPanel({
  activeWorkspaceId,
  activeTab,
  focusNonce,
  isDarkTheme,
  terminalStates,
  onAddTerminal,
  onCloseTerminal,
  onSelectTerminal,
  onSizeChange,
  onError,
  onPasteImage,
  onTerminalInput,
  onTerminalOutput,
  onTabChange,
}: {
  activeWorkspaceId: string
  activeTab: string
  focusNonce: number
  isDarkTheme: boolean
  terminalStates: Record<string, WorkspaceTerminalState>
  onAddTerminal: () => void
  onCloseTerminal: (workspaceId: string, terminalId: string) => void
  onSelectTerminal: (workspaceId: string, terminalId: string) => void
  onSizeChange: (cols: number, rows: number) => void
  onError: (value: string) => void
  onPasteImage: (event: ReactClipboardEvent | ClipboardEvent) => void
  onTerminalInput: (workspaceId: string, terminalId: string) => void
  onTerminalOutput: (workspaceId: string, terminalId: string, data: number[]) => void
  onTabChange: (value: string) => void
}) {
  const activeTerminalState = terminalStateFor(activeWorkspaceId, terminalStates)
  const activeTerminalId = activeTerminalState.activeTerminalId
  const terminalEntries = Object.entries(terminalStates).flatMap(([workspaceId, state]) =>
    state.terminals.map((terminal) => ({ workspaceId, terminal }))
  )

  return (
    <div
      className="grid h-full min-h-0 grid-rows-[40px_1fr] border-b bg-muted/35"
      onPaste={onPasteImage}
    >
      <div className="flex h-10 items-center gap-2 border-b px-3">
        <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
          {activeTerminalState.terminals.map((terminal) => {
            const selected = activeTab === "terminal" && terminal.id === activeTerminalId

            return (
              <div
                key={terminal.id}
                className={cn(
                  "flex h-7 shrink-0 items-center rounded-md text-xs text-muted-foreground",
                  selected && "bg-muted text-foreground"
                )}
              >
                <button
                  type="button"
                  className="h-full px-2 font-medium hover:text-foreground"
                  onClick={() => onSelectTerminal(activeWorkspaceId, terminal.id)}
                >
                  {terminal.name}
                </button>
                <button
                  type="button"
                  className="flex h-full items-center px-2 text-muted-foreground hover:text-foreground"
                  aria-label={`Close ${terminal.name}`}
                  onClick={() => onCloseTerminal(activeWorkspaceId, terminal.id)}
                >
                  <X className="size-3.5" />
                </button>
              </div>
            )
          })}
        </div>
        <button
          type="button"
          className="h-7 shrink-0 rounded-md px-2 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-45"
          disabled={!activeWorkspaceId}
          onClick={onAddTerminal}
        >
          + Add terminal
        </button>
        <button
          type="button"
          className={cn(
            "h-7 shrink-0 rounded-md px-2 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground",
            activeTab === "problems" && "bg-muted text-foreground"
          )}
          onClick={() => onTabChange("problems")}
        >
          Problems
        </button>
      </div>
      <div className="min-h-0 bg-background">
        <div className={cn("h-full min-h-0", activeTab !== "terminal" && "hidden")}>
          {terminalEntries.map(({ workspaceId, terminal }) => (
            <div
              key={terminal.id}
              className={cn(
                "h-full min-h-0",
                (workspaceId !== activeWorkspaceId || terminal.id !== activeTerminalId) &&
                  "hidden"
              )}
            >
              <Suspense fallback={<div className="h-full min-h-0 p-2" />}>
                <TerminalPane
                  active={
                    activeTab === "terminal" &&
                    workspaceId === activeWorkspaceId &&
                    terminal.id === activeTerminalId
                  }
                  focusNonce={terminal.id === activeTerminalId ? focusNonce : 0}
                  isDarkTheme={isDarkTheme}
                  onSizeChange={onSizeChange}
                  onError={onError}
                  onPasteImage={onPasteImage}
                  onTerminalInput={onTerminalInput}
                  onTerminalOutput={onTerminalOutput}
                  startupCommand={terminal.startupCommand}
                  terminalId={terminal.id}
                  workspaceId={workspaceId}
                />
              </Suspense>
            </div>
          ))}
        </div>
        <div
          className={cn(
            "h-full bg-background p-4 text-xs text-muted-foreground",
            activeTab !== "problems" && "hidden"
          )}
        >
          No problems
        </div>
      </div>
    </div>
  )
}

export function ActionBar({
  canClear,
  skills,
  onClearInput,
  onMoveSkill,
  onUseSkill,
}: {
  canClear: boolean
  skills: SkillItem[]
  onClearInput: () => void
  onMoveSkill: (slug: string, overSlug: string) => void
  onUseSkill: (skill: SkillItem) => void
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
      keyboardCodes: {
        start: [KeyboardCode.Space],
        cancel: [KeyboardCode.Esc],
        end: [KeyboardCode.Space, KeyboardCode.Enter, KeyboardCode.Tab],
      },
    })
  )

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    onMoveSkill(String(active.id), String(over.id))
  }

  return (
    <div className="flex h-full items-center gap-2 bg-muted/35 px-3">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext
          items={skills.map((skill) => skill.slug)}
          strategy={horizontalListSortingStrategy}
        >
          <div className="flex min-w-0 items-center gap-2">
            {skills.map((skill) => (
              <SortableSkillShortcut key={skill.slug} skill={skill} onUseSkill={onUseSkill} />
            ))}
          </div>
        </SortableContext>
      </DndContext>
      <button
        type="button"
        className="ml-auto h-7 shrink-0 rounded-md px-2 text-sm font-medium hover:bg-muted disabled:pointer-events-none disabled:opacity-45"
        disabled={!canClear}
        onClick={onClearInput}
      >
        Clear
      </button>
    </div>
  )
}

function SortableSkillShortcut({
  skill,
  onUseSkill,
}: {
  skill: SkillItem
  onUseSkill: (skill: SkillItem) => void
}) {
  const {
    attributes,
    listeners,
    setActivatorNodeRef,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } =
    useSortable({ id: skill.slug })
  const style = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    transition,
    opacity: isDragging ? 0.6 : 1,
  }
  const setShortcutRef = useCallback(
    (node: HTMLButtonElement | null) => {
      setNodeRef(node)
      setActivatorNodeRef(node)
    },
    [setActivatorNodeRef, setNodeRef]
  )

  return (
    <Button
      ref={setShortcutRef}
      style={style}
      type="button"
      variant="ghost"
      size="sm"
      {...attributes}
      {...listeners}
      className={cn(
        "h-7 shrink-0 cursor-grab active:cursor-grabbing",
        isDragging && "cursor-grabbing"
      )}
      onClick={() => onUseSkill(skill)}
    >
      {skill.name}
    </Button>
  )
}
