import * as React from "react"
import { PaperclipIcon, PenLineIcon, SettingsIcon, SquareMousePointerIcon, Trash2Icon, XIcon } from "lucide-react"

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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { plural } from "@/lib/format/plural"
import { LIMITS } from "@/lib/project/rules"
import { cn } from "@/lib/utils"

/**
 * The project page's right panel: the open task. Tyler drew it on 13 Oct
 * 2026 (`workspace/docs/assets/pasted-image-1791936316739365000.png`): the
 * status, Add note, the files, Follow and a cog along the top with a cross to
 * close, then Steps and Chat. Notes show above Steps once a task has some.
 * The cog opens a dropdown with every other field (Tyler's second drawing,
 * `pasted-image-1791937217887403000.png`), and the paperclip opens the
 * task's files. The Board stays in view beside it, with
 * the open task's card outlined.
 */
export function TaskSidePanel({
  taskId,
  onClose,
  onLoaded,
}: {
  taskId: string | undefined
  onClose: () => void
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
      {(parts) => <SidePanel parts={parts} onClose={onClose} />}
    </TaskView>
  )
}

function SidePanel({ parts, onClose }: { parts: TaskParts; onClose: () => void }) {
  const { side } = parts
  const frame = React.useRef<HTMLDivElement>(null)
  const [settingsOpen, setSettingsOpen] = React.useState(false)
  const [filesOpen, setFilesOpen] = React.useState(false)
  const [addingNote, setAddingNote] = React.useState(false)
  const [confirmDelete, setConfirmDelete] = React.useState(false)
  // A pick in Task settings that opens a card in the panel: the keyboard goes
  // there instead of back to the cog as the window closes.
  const picked = React.useRef<"move" | "remind" | null>(null)
  const { remove } = parts
  const filesLabel = side?.files.count ? `${side.files.count} ${plural(side.files.count, "file")}` : null

  // Opening a task moves the keyboard into it, so Tab starts from the status.
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
      {/* In a narrow panel Add note and Follow drop their words for their
          icons, and anything still too wide scrolls sideways rather than
          pushing the cross out of reach. */}
      <DashboardCardHeader className="@container/task-head">
        <ScrollArea className="min-w-0 flex-1">
          {side ? (
            <div className="flex w-max items-center gap-1">
              {side.status}
              {side.notes.empty && !side.readOnly ? (
                <AddNoteMenu open={addingNote} onOpenChange={setAddingNote}>
                  {side.notes.field({ adding: true, onFinished: () => setAddingNote(false) })}
                </AddNoteMenu>
              ) : null}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className="px-2.5"
                    aria-label={`Files, ${side.files.count}`}
                    onClick={() => setFilesOpen(true)}
                  >
                    <PaperclipIcon className="size-4" />
                    {side.files.count}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {filesLabel ?? "No files yet"}
                </TooltipContent>
              </Tooltip>
              {parts.follow}
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
            <h2 className="text-sm font-medium">{parts.title}</h2>
          )}
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button type="button" variant="ghost" size="icon" aria-label="Close the task" onClick={onClose}>
              <XIcon className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Close the task</TooltipContent>
        </Tooltip>
      </DashboardCardHeader>
      <ScrollArea className="min-h-0 flex-1" viewportClassName="h-full">
        <div className="grid gap-3 p-3">
          {side ? <SideBody side={side} /> : parts.body}
        </div>
      </ScrollArea>
      {side ? (
        <Dialog open={filesOpen} onOpenChange={setFilesOpen}>
          <DialogContent variant="admin" className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Files</DialogTitle>
              <DialogDescription>
                Up to {LIMITS.filesPerTask} files on a task. Only people who can see the task can
                download them.
              </DialogDescription>
            </DialogHeader>
            <DialogBody>
              <Card size="sm">
                <CardHeader>
                  <CardTitle>{filesLabel ?? "Files"}</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4">{side.files.content}</CardContent>
              </Card>
            </DialogBody>
            <DialogFooter>
              <Button type="button" onClick={() => setFilesOpen(false)}>
                Done
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
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
      {side.notices}
      {side.notes.empty ? null : (
        <PanelCard storageId="project-task-notes" title="Notes">
          {side.notes.field({ adding: false, onFinished: () => undefined })}
        </PanelCard>
      )}
      <PanelCard storageId="project-task-steps" title="Steps" meta={side.steps.meta}>
        <StepsBox>{side.steps.content}</StepsBox>
      </PanelCard>
      <PanelCard storageId="project-task-chat" title="Chat" meta={side.chat.count || null}>
        {side.chat.content}
      </PanelCard>
    </>
  )
}

/**
 * Add note, as Tyler asked on 13 Oct 2026: a dropdown under the button with
 * the editor ready. Done saves, and only then does the Notes card appear in
 * the panel. Closed with nothing typed, nothing appears. Typing and then
 * clicking away still saves, so nothing written is lost.
 */
function AddNoteMenu({
  open,
  onOpenChange,
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The notes field, opened ready to write. */
  children: React.ReactNode
}) {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" aria-label="Add note" className={cn(open && "bg-muted")}>
          <PenLineIcon className="size-4" />
          <span className="@max-lg/task-head:hidden">Add note</span>
        </Button>
      </PopoverTrigger>
      {/* No heading: the editor's formatting bar floats over the top line. */}
      {/* It opens leftward from the button and keeps 16px off the window's edge. */}
      <PopoverContent
        aria-label="Add note"
        align="end"
        collisionPadding={16}
        className="w-[min(24rem,calc(100vw-2rem))] gap-3 p-3"
      >
        {open ? children : null}
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
 * every field that isn't on the panel (title, person, dates, priority, type,
 * section, labels and review), the type's own fields and the Plan under it,
 * then Duplicate, Move, Remind me and Delete. The History tab holds the
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
              variant="outline"
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
        className="w-[min(30rem,calc(100vw-2rem))] gap-0 p-0"
        onCloseAutoFocus={onCloseAutoFocus}
      >
        <Tabs value={tab} onValueChange={(value) => setTab(value as typeof tab)}>
          <div className="border-b px-4 py-3">
            <TabsList>
              <TabsTrigger value="details">Details</TabsTrigger>
              <TabsTrigger value="history">History</TabsTrigger>
            </TabsList>
          </div>
        </Tabs>
        <ScrollArea className="min-h-0" viewportClassName="max-h-[min(70vh,44rem)]">
          {tab === "details" ? (
            <div className={cn("grid [&_[data-slot=select-trigger]]:w-full", FLAT_CARDS)}>
              <div className="grid gap-4 p-4">{side.details}</div>
              {side.typeFields ? <div className="border-t p-4">{side.typeFields}</div> : null}
              <div className="border-t p-4">{side.plan}</div>
              {side.readOnly && !onDelete ? null : (
                <div className="grid gap-1 border-t p-2">
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
              )}
            </div>
          ) : (
            <div className={cn("p-4", FLAT_CARDS)}>{side.history}</div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  )
}

/**
 * The Plan, History and type-field cards drawn flat inside the dropdown: a
 * heading and its fields, with a line between sections instead of a frame.
 */
const FLAT_CARDS =
  "[&_[data-slot=card]]:rounded-none [&_[data-slot=card]]:bg-transparent [&_[data-slot=card]]:py-0 [&_[data-slot=card]]:ring-0 [&_[data-slot=card-header]]:!px-0 [&_[data-slot=card-content]]:!px-0"
