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
import { listen } from "@tauri-apps/api/event"
import { FitAddon } from "@xterm/addon-fit"
import { Terminal } from "@xterm/xterm"
import "@xterm/xterm/css/xterm.css"
import { X } from "lucide-react"
import { useCallback, useEffect, useRef } from "react"
import type { ClipboardEvent as ReactClipboardEvent } from "react"

import {
  resizeNativeTerminal,
  startNativeTerminal,
  writeNativeTerminal,
} from "@/app/native/terminal"
import { readableError } from "@/app/path"
import {
  TERMINAL_SCROLLBACK_LINES,
  terminalOutputEvent,
  terminalStateFor,
} from "@/app/terminal"
import type { SkillItem, TerminalOutput, WorkspaceTerminalState } from "@/app/types"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export function BottomPanel({
  activeWorkspaceId,
  activeTab,
  focusNonce,
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
              <TerminalPane
                active={
                  activeTab === "terminal" &&
                  workspaceId === activeWorkspaceId &&
                  terminal.id === activeTerminalId
                }
                focusNonce={terminal.id === activeTerminalId ? focusNonce : 0}
                onSizeChange={onSizeChange}
                onError={onError}
                onPasteImage={onPasteImage}
                onTerminalInput={onTerminalInput}
                onTerminalOutput={onTerminalOutput}
                startupCommand={terminal.startupCommand}
                terminalId={terminal.id}
                workspaceId={workspaceId}
              />
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

function TerminalPane({
  active,
  focusNonce,
  onSizeChange,
  onError,
  onPasteImage,
  onTerminalInput,
  onTerminalOutput,
  terminalId,
  startupCommand,
  workspaceId,
}: {
  active: boolean
  focusNonce: number
  onSizeChange: (cols: number, rows: number) => void
  onError: (value: string) => void
  onPasteImage: (event: ClipboardEvent) => void
  onTerminalInput: (workspaceId: string, terminalId: string) => void
  onTerminalOutput: (workspaceId: string, terminalId: string, data: number[]) => void
  startupCommand?: string
  terminalId: string
  workspaceId: string
}) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const terminalRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const frameRef = useRef<number | null>(null)
  const activeRef = useRef(active)
  const startupCommandSentRef = useRef(false)

  useEffect(() => {
    activeRef.current = active
  }, [active])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const handlePaste = (event: ClipboardEvent) => onPasteImage(event)
    container.addEventListener("paste", handlePaste, true)
    return () => container.removeEventListener("paste", handlePaste, true)
  }, [onPasteImage])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    let cancelled = false
    let unlisten: (() => void) | undefined

    const terminal = new Terminal({
      cursorBlink: true,
      convertEol: false,
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
      fontSize: 12,
      scrollback: TERMINAL_SCROLLBACK_LINES,
      theme: {
        background: "#ffffff",
        foreground: "#171717",
        cursor: "#171717",
        selectionBackground: "rgba(59, 130, 246, 0.32)",
        selectionForeground: "#171717",
        selectionInactiveBackground: "rgba(100, 116, 139, 0.25)",
      },
    })
    const fit = new FitAddon()
    terminal.loadAddon(fit)
    terminal.open(container)
    terminalRef.current = terminal
    fitRef.current = fit

    const refreshTerminal = () => {
      if (cancelled || terminal.rows < 1) return

      try {
        terminal.refresh(0, terminal.rows - 1)
      } catch {
        // xterm can throw while the panel is hidden during resize.
      }
    }

    const fitTerminal = () => {
      if (frameRef.current) window.cancelAnimationFrame(frameRef.current)
      frameRef.current = window.requestAnimationFrame(() => {
        frameRef.current = null
        if (!container.isConnected || container.clientWidth === 0 || container.clientHeight === 0) {
          return
        }

        try {
          fit.fit()
          refreshTerminal()
          onSizeChange(terminal.cols || 80, terminal.rows || 24)
          void resizeNativeTerminal(
            terminalId,
            terminal.cols || 80,
            terminal.rows || 24
          ).catch(() => undefined)
        } catch {
          // xterm can throw while the panel is hidden during resize.
        }
      })
    }

    const startAfterFit = () => {
      try {
        fit.fit()
        refreshTerminal()
        const cols = terminal.cols || 80
        const rows = terminal.rows || 24
        onSizeChange(cols, rows)
        void startNativeTerminal(workspaceId, terminalId, cols, rows)
          .then(() => resizeNativeTerminal(terminalId, cols, rows))
          .then(() => {
            if (!startupCommand || startupCommandSentRef.current) return undefined

            startupCommandSentRef.current = true
            return writeNativeTerminal(terminalId, startupCommand)
          })
          .catch((error) => onError(readableError(error)))
      } catch (error) {
        onError(readableError(error))
      }
    }

    const dataDisposable = terminal.onData((data) => {
      void writeNativeTerminal(terminalId, data).catch((error) =>
        onError(readableError(error))
      )
    })
    const keyDisposable = terminal.onKey(({ domEvent }) => {
      if (domEvent.key !== "Enter") return
      if (domEvent.metaKey || domEvent.ctrlKey || domEvent.altKey) return
      onTerminalInput(workspaceId, terminalId)
    })
    const observer = new ResizeObserver(fitTerminal)
    observer.observe(container)

    listen<TerminalOutput>(terminalOutputEvent(terminalId), (event) => {
      if (
        event.payload.workspaceId !== workspaceId ||
        event.payload.terminalId !== terminalId
      ) {
        return
      }
      const data = new Uint8Array(event.payload.data)
      onTerminalOutput(workspaceId, terminalId, event.payload.data)
      terminal.write(data, () => {
        if (activeRef.current) refreshTerminal()
      })
    })
      .then((dispose) => {
        if (cancelled) {
          dispose()
          return
        }

        unlisten = dispose
        window.requestAnimationFrame(() => {
          window.requestAnimationFrame(startAfterFit)
        })
      })
      .catch((error) => onError(readableError(error)))

    return () => {
      cancelled = true
      if (frameRef.current) window.cancelAnimationFrame(frameRef.current)
      unlisten?.()
      observer.disconnect()
      dataDisposable.dispose()
      keyDisposable.dispose()
      terminal.dispose()
      terminalRef.current = null
      fitRef.current = null
    }
  }, [
    onError,
    onSizeChange,
    onTerminalInput,
    onTerminalOutput,
    startupCommand,
    terminalId,
    workspaceId,
  ])

  useEffect(() => {
    terminalRef.current?.focus()
  }, [focusNonce])

  useEffect(() => {
    if (!active) return

    const frame = window.requestAnimationFrame(() => {
      const terminal = terminalRef.current
      const fit = fitRef.current
      if (!terminal || !fit) return

      try {
        fit.fit()
        onSizeChange(terminal.cols || 80, terminal.rows || 24)
        void resizeNativeTerminal(
          terminalId,
          terminal.cols || 80,
          terminal.rows || 24
        ).catch(() => undefined)
        window.requestAnimationFrame(() => {
          if (terminal.rows < 1) return
          try {
            terminal.refresh(0, terminal.rows - 1)
          } catch {
            // xterm can throw while the panel is being shown.
          }
        })
        terminal.focus()
      } catch {
        // xterm can throw while the panel is being shown.
      }
    })

    return () => window.cancelAnimationFrame(frame)
  }, [active, onSizeChange, terminalId])

  return (
    <div className="h-full min-h-0 p-2">
      <div ref={containerRef} className="h-full min-h-0 overflow-hidden" />
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
