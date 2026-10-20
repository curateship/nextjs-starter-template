import * as React from "react"
import {
  ArrowLeftIcon,
  EllipsisVerticalIcon,
  MessageSquarePlusIcon,
  PaperclipIcon,
  PenLineIcon,
  SettingsIcon,
  SquareMousePointerIcon,
  TagIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react"

import {
  DELETE_TASK_DETAIL,
  DELETE_TASK_QUESTION,
  TaskView,
  type TaskParts,
  type TaskSide,
} from "@/components/project/task-body"
import { PanelCard } from "@/components/project/panel-card"
import { MOVE_PICKER_ID, TaskMoreRows } from "@/components/project/task-more-menu"
import { DashboardCardHeader } from "@/components/shared/dashboard-card-header"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { plural } from "@/lib/format/plural"
import { LIMITS } from "@/lib/project/rules"
import { cn } from "@/lib/utils"

/**
 * The project page's right panel: the open task. Tyler drew it on 13 Oct
 * 2026 (`workspace/docs/assets/pasted-image-1791936316739365000.png`): the
 * status and a cog along the top, then Steps and Chat. On 20 Oct he put Add
 * note, Add comment and Add files behind a three-dot button and took the
 * cross away (`pasted-image-1792504237260017000.png`). My dashboard keeps the
 * cross, since closing the task there is the way back to the inbox. Notes show above Steps once a task has some. On 14
 * Oct he moved Follow into the cog and gave the chat the notes' pattern: an
 * icon that opens a dropdown while it's empty.
 * Later on 20 Oct the task's name took the status's place in the header, and
 * the status moved to a footer pinned to the panel's bottom with the clock,
 * Start and Completed (`task-clock.tsx`).
 * The cog opens a dropdown with every other field (Tyler's second drawing,
 * `pasted-image-1791937217887403000.png`), and the paperclip opens the
 * task's files. The Board stays in view beside it, with
 * the open task's card outlined.
 */
export function TaskSidePanel({
  taskId,
  onClose,
  closeButton = false,
  onLoaded,
}: {
  taskId: string | undefined
  onClose: () => void
  /** A cross that closes the task, where closing brings something back, as My dashboard's inbox. */
  closeButton?: boolean
  /** Once the task has loaded, which marks its chat read. */
  onLoaded?: (taskId: string) => void
}) {
  if (!taskId) {
    return (
      <>
        <DashboardCardHeader>
          <h2 className="text-sm font-medium">Task</h2>
        </DashboardCardHeader>
        <div className="grid flex-1 content-center justify-items-center gap-2 p-6 text-center">
          <SquareMousePointerIcon className="size-5 text-muted-foreground" aria-hidden />
          <p className="max-w-56 text-sm text-muted-foreground">
            Click a task to see its steps and chat here.
          </p>
        </div>
      </>
    )
  }
  return (
    <TaskView key={taskId} taskId={taskId} onLoaded={onLoaded}>
      {(parts) => <SidePanel parts={parts} onClose={onClose} closeButton={closeButton} />}
    </TaskView>
  )
}

function SidePanel({
  parts,
  onClose,
  closeButton,
}: {
  parts: TaskParts
  onClose: () => void
  closeButton: boolean
}) {
  const { side } = parts
  const frame = React.useRef<HTMLDivElement>(null)
  const [settingsOpen, setSettingsOpen] = React.useState(false)
  const [confirmDelete, setConfirmDelete] = React.useState(false)
  // A pick in Task settings that opens a card in the panel: the keyboard goes
  // there instead of back to the cog as the window closes.
  const picked = React.useRef<"move" | "remind" | null>(null)
  const { remove } = parts

  // Opening a task moves the keyboard into it, so Tab starts from the title.
  React.useEffect(() => {
    frame.current?.focus({ preventScroll: true })
  }, [])

  return (
    <div
      ref={frame}
      tabIndex={-1}
      className="flex min-h-0 flex-1 flex-col outline-none"
      aria-label={parts.title}
      role="region"
    >
      {/* The task's name on the left, where the status was, then the three dots
          and the cog (Tyler, 20 Oct 2026). The icon buttons have no border or
          background (Tyler, 14 Oct 2026). */}
      <DashboardCardHeader>
        {side ? (
          <div className="flex min-w-0 flex-1 items-start gap-1">
            <div className="min-w-0 flex-1">{side.title}</div>
            <TaskAddMenu side={side} />
            <TaskSettingsMenu
              side={side}
              open={settingsOpen}
              onOpenChange={setSettingsOpen}
              onDelete={
                remove
                  ? () => {
                      setSettingsOpen(false)
                      setConfirmDelete(true)
                    }
                  : null
              }
              onMove={() => {
                picked.current = "move"
                side.move()
              }}
              onRemind={() => {
                picked.current = "remind"
                side.remind()
              }}
              onCloseAutoFocus={(event) => {
                const card = picked.current
                if (!card) return
                picked.current = null
                event.preventDefault()
                // The reminder's calendar opens by itself and holds the keyboard.
                if (card === "move") document.getElementById(MOVE_PICKER_ID)?.focus()
              }}
            />
          </div>
        ) : (
          <h2 className="min-w-0 flex-1 truncate text-sm font-medium">{parts.title}</h2>
        )}
        {closeButton ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button type="button" variant="ghost" size="icon" aria-label="Close the task" onClick={onClose}>
                <XIcon className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Close the task</TooltipContent>
          </Tooltip>
        ) : null}
      </DashboardCardHeader>
      <ScrollArea className="min-h-0 flex-1" viewportClassName="h-full">
        <div className="grid gap-3 p-3">
          {side ? <SideBody side={side} /> : parts.body}
        </div>
      </ScrollArea>
      {/* Stays at the bottom while the rest scrolls (Tyler, 20 Oct 2026). */}
      {side?.footer}
      {remove ? (
        <ConfirmDialog
          open={confirmDelete}
          onOpenChange={setConfirmDelete}
          title={DELETE_TASK_QUESTION}
          description={DELETE_TASK_DETAIL}
          confirmLabel="Delete task"
          destructive
          loading={remove.busy}
          onConfirm={() =>
            void remove.run().then((ok) => {
              if (!ok) return
              setConfirmDelete(false)
              onClose()
            })
          }
        />
      ) : null}
    </div>
  )
}

function SideBody({ side }: { side: TaskSide }) {
  return (
    <>
      {side.tagList}
      {side.link}
      {side.notices}
      {side.notes.empty ? null : (
        <PanelCard storageId="project-task-notes" title="Notes" settings>
          {side.notes.field({ adding: false, onFinished: () => undefined })}
        </PanelCard>
      )}
      <PanelCard storageId="project-task-steps" title="Steps" meta={side.steps.meta} settings={!side.readOnly}>
        <StepsBox>{side.steps.content}</StepsBox>
      </PanelCard>
      {side.chat.count === 0 && !side.readOnly ? null : (
        <PanelCard storageId="project-task-chat" title="Chat" meta={side.chat.count || null}>
          {side.chat.content}
        </PanelCard>
      )}
    </>
  )
}

type Adding = "tags" | "note" | "chat" | "files"

/**
 * The three-dot button (Tyler, 20 Oct 2026): a dropdown of Add tags, Add
 * note, Add comment and Add files, and the one picked takes the dropdown's
 * place.
 * - **Add tags** holds the tags box: Enter places a tag, its × takes it off.
 *   The tags show under the title.
 * - **Add note** (only while the task has no notes) opens the editor ready.
 *   Done saves, and only then does the Notes card appear in the panel; closed
 *   with nothing typed, nothing appears.
 * - **Add comment** (only while the chat is empty) holds the chat's box to
 *   write the first message. Once one is sent the Chat card appears.
 * - **Add files** lists the task's files with the place to drop more, its
 *   count beside it.
 */
function TaskAddMenu({ side }: { side: TaskSide }) {
  const [open, setOpen] = React.useState(false)
  const [adding, setAdding] = React.useState<Adding | null>(null)
  const canNote = side.notes.empty && !side.readOnly
  const canChat = side.chat.count === 0 && !side.readOnly
  const filesCount = side.files.count
  const filesLabel = filesCount ? `${filesCount} ${plural(filesCount, "file")}` : "Files"

  function toggle(next: boolean) {
    setOpen(next)
    if (!next) setAdding(null)
  }

  // The first message sent: the Chat card takes over in the panel, so the dropdown closes.
  if (adding === "chat" && !canChat) toggle(false)

  const rows: { key: Adding; label: string; icon: React.ReactNode; meta?: number }[] = [
    ...(side.readOnly ? [] : [{ key: "tags" as const, label: "Add tags", icon: <TagIcon /> }]),
    ...(canNote ? [{ key: "note" as const, label: "Add note", icon: <PenLineIcon /> }] : []),
    ...(canChat ? [{ key: "chat" as const, label: "Add comment", icon: <MessageSquarePlusIcon /> }] : []),
    { key: "files", label: "Add files", icon: <PaperclipIcon />, meta: filesCount },
  ]

  return (
    <Popover open={open} onOpenChange={toggle}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Add to the task"
              className={cn(open && "bg-muted")}
            >
              <EllipsisVerticalIcon className="size-4" />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>Add tags, a note, a comment or files</TooltipContent>
      </Tooltip>
      {/* It opens leftward from the button and keeps 16px off the window's edge. */}
      <PopoverContent
        aria-label={adding ? rows.find((row) => row.key === adding)?.label : "Add to the task"}
        align="end"
        collisionPadding={16}
        className={cn("gap-3", adding ? "w-[min(24rem,calc(100vw-2rem))] p-3" : "w-56 gap-0 p-1")}
      >
        {adding === null ? (
          rows.map((row) => (
            <Button
              key={row.key}
              type="button"
              variant="ghost"
              className="w-full justify-start font-normal [&_svg]:text-muted-foreground"
              onClick={() => setAdding(row.key)}
            >
              {row.icon}
              <span className="flex-1 text-left">{row.label}</span>
              {row.meta ? <span className="text-xs text-muted-foreground">{row.meta}</span> : null}
            </Button>
          ))
        ) : (
          <>
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="-my-1 -ml-1 size-7"
                aria-label="Back"
                onClick={() => setAdding(null)}
              >
                <ArrowLeftIcon className="size-4" />
              </Button>
              <h2 className="text-sm font-medium">
                {adding === "files" ? filesLabel : rows.find((row) => row.key === adding)?.label}
              </h2>
            </div>
            {adding === "files" ? (
              <>
                <p className="text-xs text-muted-foreground">
                  Up to {LIMITS.filesPerTask} files on a task. Only people who can see the task can download them.
                </p>
                {side.files.content}
              </>
            ) : adding === "tags" ? (
              side.tags
            ) : adding === "note" ? (
              side.notes.field({ adding: true, onFinished: () => toggle(false) })
            ) : (
              side.chat.content
            )}
          </>
        )}
      </PopoverContent>
    </Popover>
  )
}

/**
 * Steps read as a plain checklist on the grey card: a step's text has no box
 * around it until it is pointed at or typed in.
 */
function StepsBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid gap-4 [&_[aria-label=Step]]:border-transparent [&_[aria-label=Step]]:!bg-transparent [&_[aria-label=Step]]:shadow-none [&_[aria-label=Step]:focus-visible]:border-input [&_[aria-label=Step]:hover]:border-input">
      {children}
    </div>
  )
}

/**
 * The cog's dropdown, as Tyler drew it on 13 Oct 2026: a Details tab with
 * every field that isn't on the panel, as cards that fold open with their
 * answer on the right (Tyler, 14 Oct 2026): Person, Dates, Priority and type,
 * Needs review, the type's own fields and the Plan. Then Duplicate, Move,
 * Remind me and Delete. The History tab holds the
 * task's history. Each field saves on its own, so there is no Save button.
 */
function TaskSettingsMenu({
  side,
  open,
  onOpenChange,
  onDelete,
  onMove,
  onRemind,
  onCloseAutoFocus,
}: {
  side: TaskSide
  open: boolean
  onOpenChange: (open: boolean) => void
  onDelete: (() => void) | null
  onMove: () => void
  onRemind: () => void
  onCloseAutoFocus: (event: Event) => void
}) {
  const [tab, setTab] = React.useState<"details" | "history">("details")

  // Leaving a field saves it, so closing first leaves the field being typed in.
  function close() {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
    onOpenChange(false)
  }

  return (
    <Popover open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Task settings"
              className={cn(open && "bg-muted")}
            >
              <SettingsIcon className="size-4" />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>Task settings</TooltipContent>
      </Tooltip>
      <PopoverContent
        align="end"
        // As narrow as My settings' dropdown now its fields stack one per row (Tyler, 14 Oct 2026).
        className="w-[min(24rem,calc(100vw-2rem))] gap-0 p-0"
        onCloseAutoFocus={onCloseAutoFocus}
      >
        <Tabs value={tab} onValueChange={(value) => setTab(value as typeof tab)}>
          {/* Follow sits at the right of the tabs (Tyler, 14 Oct 2026). */}
          <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
            <TabsList>
              <TabsTrigger value="details">Details</TabsTrigger>
              <TabsTrigger value="history">History</TabsTrigger>
            </TabsList>
            {side.followButton}
          </div>
        </Tabs>
        <ScrollArea className="min-h-0" viewportClassName="max-h-[min(70vh,44rem)]">
          {tab === "details" ? (
            <div className="grid [&_[data-slot=select-trigger]]:w-full">
              <div className="grid gap-2 p-3">{side.settings}</div>
              <div className="grid gap-1 border-t p-2 empty:hidden">
                {side.readOnly ? null : (
                  <TaskMoreRows detail={side.detail} onMove={onMove} onRemind={onRemind} onPicked={close} />
                )}
                {onDelete ? (
                  <Button
                    type="button"
                    variant="ghost"
                    className="justify-start text-destructive hover:text-destructive"
                    onClick={onDelete}
                  >
                    <Trash2Icon className="size-4" />
                    Delete task
                  </Button>
                ) : null}
              </div>
            </div>
          ) : (
            <div className={cn("p-4", FLAT_CARDS)}>{side.history}</div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  )
}

/** The History card drawn flat inside the dropdown: a heading and its rows, no frame. */
const FLAT_CARDS =
  "[&_[data-slot=card]]:rounded-none [&_[data-slot=card]]:bg-transparent [&_[data-slot=card]]:py-0 [&_[data-slot=card]]:ring-0 [&_[data-slot=card-header]]:!px-0 [&_[data-slot=card-content]]:!px-0"
