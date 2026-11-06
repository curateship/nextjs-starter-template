import * as React from "react"
import {
  ArrowLeftIcon,
  EraserIcon,
  EllipsisVerticalIcon,
  HistoryIcon,
  ListTodoIcon,
  LockIcon,
  LockOpenIcon,
  PencilLineIcon,
  TimerIcon,
  MessageSquarePlusIcon,
  PaperclipIcon,
  SquareMousePointerIcon,
  TagIcon,
  Trash2Icon,
} from "lucide-react"

import {
  DELETE_TASK_DETAIL,
  DELETE_TASK_QUESTION,
  TaskView,
  type TaskParts,
  type TaskSide,
} from "@/components/project/task-body"
import { PanelCard } from "@/components/project/panel-card"
import type { NotesHandle } from "@/components/project/task-notes"
import { ASK_TIME_DAY_ID, MOVE_PICKER_ID, TaskMoreRows } from "@/components/project/task-more-menu"
import { DashboardCardHeader } from "@/components/shared/dashboard-card-header"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { plural } from "@/lib/format/plural"
import { LIMITS } from "@/lib/project/rules"
import { PANEL_GUTTER } from "@/lib/project/panel-gutter"
import { cn } from "@/lib/utils"

/**
 * The project page's right panel: the open task. Tyler drew it on 13 Oct
 * 2026 (`workspace/docs/assets/pasted-image-1791936316739365000.png`): the
 * status and a cog along the top, then Steps and Chat. On 20 Oct he put Add
 * note, Add comment and Add files behind a three-dot button and took the
 * cross away (`pasted-image-1792504237260017000.png`). On 23 Oct he took it off
 * My dashboard too: "There is no 'x' icon to close the right panel to show an
 * empty panel." Notes show above Steps once a task has some. On 14
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
  onLoaded,
}: {
  taskId: string | undefined
  /** After the task is deleted: back to the list. */
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

function SidePanel({
  parts,
  onClose,
}: {
  parts: TaskParts
  onClose: () => void
}) {
  const { side } = parts
  const frame = React.useRef<HTMLDivElement>(null)
  const [settingsOpen, setSettingsOpen] = React.useState(false)
  // The notes' text toolbar, opened from the ⋮ (Tyler, 2 Nov 2026).
  const [toolbar, setToolbar] = React.useState(false)
  const notes = React.useRef<NotesHandle>(null)
  const [confirmDelete, setConfirmDelete] = React.useState(false)
  // A pick in the ⋮ menu that opens a card in the panel: the keyboard goes
  // there instead of back to the ⋮ as the menu closes.
  const picked = React.useRef<"move" | "remind" | "ask" | null>(null)
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
      {/* The task's name on the left, where the status was (Tyler, 20 Oct
          2026), then the one ⋮ menu, which took in the cog's on 2 Nov 2026.
          The button has no border or background (Tyler, 14 Oct 2026). */}
      <DashboardCardHeader>
        {side ? (
          <div className="flex min-w-0 flex-1 items-start gap-1">
            <div className="min-w-0 flex-1">{side.title}</div>
            <TaskMenu
              side={side}
              notes={notes}
              toolbar={toolbar}
              onToolbar={setToolbar}
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
              onAskTime={() => {
                picked.current = "ask"
                side.askTime()
              }}
              onCloseAutoFocus={(event) => {
                const card = picked.current
                if (!card) return
                picked.current = null
                event.preventDefault()
                // The reminder's calendar opens by itself and holds the keyboard.
                if (card === "move") document.getElementById(MOVE_PICKER_ID)?.focus()
                if (card === "ask") document.getElementById(ASK_TIME_DAY_ID)?.focus()
              }}
            />
          </div>
        ) : (
          <h2 className="min-w-0 flex-1 truncate text-sm font-medium">{parts.title}</h2>
        )}
      </DashboardCardHeader>
      <ScrollArea className="min-h-0 flex-1" viewportClassName="h-full">
        <div className={cn("grid", PANEL_GUTTER)}>
          {side ? <SideBody side={side} notes={notes} toolbar={toolbar} onToolbar={setToolbar} /> : parts.body}
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

function SideBody({
  side,
  notes,
  toolbar,
  onToolbar,
}: {
  side: TaskSide
  notes: React.Ref<NotesHandle>
  toolbar: boolean
  onToolbar: (shown: boolean) => void
}) {
  return (
    <>
      {side.tagList}
      {side.link}
      {side.notices}
      {/* The panel's own body under the title, always there to write in, as a
          note's words sit under its name in the Note app (Tyler, 28 Oct 2026). */}
      {side.notes.empty && side.readOnly ? null : side.notes.field({ toolbar, onToolbar, handle: notes })}
      {/* No steps, no Steps card: the ⋮'s Add steps adds the first (Tyler, 2 Nov 2026). */}
      {side.steps.count === 0 ? null : (
        <PanelCard storageId="project-task-steps" title="Steps" meta={side.steps.meta} settings={!side.readOnly}>
          <StepsBox>{side.steps.content}</StepsBox>
        </PanelCard>
      )}
      {side.chat.count === 0 && !side.readOnly ? null : (
        <PanelCard storageId="project-task-chat" title="Chat" meta={side.chat.count || null}>
          {side.chat.content}
        </PanelCard>
      )}
    </>
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

type Adding = "tags" | "chat" | "files" | "steps" | "time"

/**
 * The task's one ⋮ menu (Tyler, 2 Nov 2026: "the 3 dot and the cog dropdowns
 * are too redundent, combine them into one",
 * `assets/pasted-image-1793657566602963000.png`). Along the top, the Details
 * and History tabs with Follow at the right. Details holds, in order:
 * - **Add to task**, a row of icons: Tags, Comment (only while the chat is
 *   empty), Files, Steps and Time. The one picked takes the menu's place,
 *   with an arrow back.
 * - **The fields**, flat rows with lines between them: Person, Dates,
 *   Priority and template, the template's own fields, Plan.
 * - **The rows that do something**: the Needs review tick box, Show the text toolbar, the notes'
 *   Earlier versions, Delete and Lock (the last two hidden and Unlock shown while they're locked), Remind me, Ask for more time, Duplicate,
 *   Move to project, Save as task template, then Delete task under a line.
 * Each field saves on its own, so there is no Save button.
 */
function TaskMenu({
  side,
  open,
  onOpenChange,
  notes,
  toolbar,
  onToolbar,
  onDelete,
  onMove,
  onRemind,
  onAskTime,
  onCloseAutoFocus,
}: {
  side: TaskSide
  open: boolean
  onOpenChange: (open: boolean) => void
  notes: React.RefObject<NotesHandle | null>
  toolbar: boolean
  onToolbar: (shown: boolean) => void
  onDelete: (() => void) | null
  onMove: () => void
  onRemind: () => void
  onAskTime: () => void
  onCloseAutoFocus: (event: Event) => void
}) {
  const [tab, setTab] = React.useState<"details" | "history">("details")
  const [adding, setAdding] = React.useState<Adding | null>(null)
  const canChat = side.chat.count === 0 && !side.readOnly
  const filesCount = side.files.count

  // Leaving a field saves it, so closing first leaves the field being typed in.
  function close() {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
    onOpenChange(false)
    setAdding(null)
  }

  // The first message sent: the Chat card takes over in the panel, so the menu closes.
  if (adding === "chat" && !canChat) close()

  const tiles: { key: Adding; label: string; title: string; icon: React.ReactNode }[] = [
    ...(side.readOnly ? [] : [{ key: "tags" as const, label: "Tags", title: "Add tags", icon: <TagIcon /> }]),
    ...(canChat ? [{ key: "chat" as const, label: "Comment", title: "Add comment", icon: <MessageSquarePlusIcon /> }] : []),
    {
      key: "files",
      label: "Files",
      title: filesCount ? `${filesCount} ${plural(filesCount, "file")}` : "Files",
      icon: <PaperclipIcon />,
    },
    ...(side.readOnly ? [] : [{ key: "steps" as const, label: "Steps", title: "Add steps", icon: <ListTodoIcon /> }]),
    ...(side.time ? [{ key: "time" as const, label: "Time", title: "Time spent", icon: <TimerIcon /> }] : []),
  ]
  const picked = tiles.find((tile) => tile.key === adding)

  const row = "w-full justify-start font-normal"

  return (
    <Popover open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Task menu"
              className={cn(open && "bg-muted")}
            >
              <EllipsisVerticalIcon className="size-4" />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>Task menu</TooltipContent>
      </Tooltip>
      <PopoverContent
        aria-label={picked ? picked.title : "Task menu"}
        align="end"
        collisionPadding={16}
        // Narrower and smaller text than the panel's other dropdowns (Tyler,
        // 2 Nov 2026: "reduce all the text a bit (10%) and reduce the dropdown
        // width by 10%", then "increase by 5%"): 363px wide, 14px text at
        // 13px, 12px at 11.5px.
        className="w-[min(22.7rem,calc(100vw-2rem))] gap-0 p-0 [&_.text-sm]:!text-[13px] [&_.text-xs]:!text-[11.5px] [&_[data-slot=button]]:text-[13px] [&_[data-slot=tabs-trigger]]:!text-[13px]"
        onCloseAutoFocus={onCloseAutoFocus}
      >
        {picked ? (
          <div className="grid gap-3 p-3">
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
              <h2 className="text-sm font-medium">{picked.title}</h2>
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
            ) : adding === "steps" ? (
              side.steps.add
            ) : adding === "time" ? (
              side.time?.content
            ) : (
              side.chat.content
            )}
          </div>
        ) : (
          <>
            <Tabs value={tab} onValueChange={(value) => setTab(value as typeof tab)}>
              {/* Follow sits at the right of the tabs (Tyler, 14 Oct 2026), the
                  same 32px tall as them, with the gap New task has from its
                  panel's top and right edge on every side (Tyler, 2 Nov 2026:
                  "too much padding and its not even", then "use that spacing"). */}
              <div className="flex items-center justify-between gap-2 border-b p-3 [&>[data-slot=button]]:h-8">
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
                  <div className="grid gap-2 border-b px-4 pt-3 pb-2">
                    <p className="text-xs text-muted-foreground">Add to task</p>
                    <div className="grid auto-cols-fr grid-flow-col">
                      {tiles.map((tile) => (
                        <Button
                          key={tile.key}
                          type="button"
                          variant="ghost"
                          className="h-auto flex-col gap-1.5 px-1 py-2 text-xs font-normal [&_svg:not([class*='size-'])]:size-5"
                          onClick={() => setAdding(tile.key)}
                        >
                          {tile.icon}
                          {tile.label}
                        </Button>
                      ))}
                    </div>
                  </div>
                  {/* Flat rows with lines between them, edge to edge (Tyler, 20 Oct 2026).
                      Their names are 13px medium here, not the 15px bold they
                      have elsewhere (Tyler, 2 Nov 2026: "reduce the text size"),
                      and each row is 8px above and below, not 12px ("theres too
                      much spacing between the items here"). */}
                  <div className="grid [&_label]:!text-[13px] [&_label]:!font-medium [&>[data-slot=collapsible]]:!py-2">
                    {side.settings}
                  </div>
                  <div className="grid gap-1 border-t p-2 empty:hidden [&_[data-slot=button]]:font-normal">
                    {side.review}
                    {side.readOnly || side.notesLock?.locked ? null : (
                      <Button
                        type="button"
                        variant="ghost"
                        className={row}
                        onClick={() => {
                          close()
                          onToolbar(!toolbar)
                        }}
                      >
                        <PencilLineIcon className="size-4" />
                        {toolbar ? "Hide the text toolbar" : "Show the text toolbar"}
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      className={row}
                      onClick={() => {
                        close()
                        notes.current?.showVersions()
                      }}
                    >
                      <HistoryIcon className="size-4" />
                      Earlier versions of the notes
                    </Button>
                    {side.readOnly || side.notes.empty || side.notesLock?.locked ? null : (
                      <Button
                        type="button"
                        variant="ghost"
                        className={row}
                        onClick={() => {
                          close()
                          notes.current?.askDelete()
                        }}
                      >
                        <EraserIcon className="size-4" />
                        Delete the notes
                      </Button>
                    )}
                    {side.notesLock ? (
                      <Button type="button" variant="ghost" className={row} onClick={side.notesLock.toggle}>
                        {side.notesLock.locked ? <LockOpenIcon className="size-4" /> : <LockIcon className="size-4" />}
                        {side.notesLock.locked ? "Unlock the notes" : "Lock the notes"}
                      </Button>
                    ) : null}
                    {side.readOnly ? null : (
                      <TaskMoreRows
                        detail={side.detail}
                        onMove={onMove}
                        onRemind={onRemind}
                        onAskTime={onAskTime}
                        onPicked={close}
                      />
                    )}
                    {onDelete ? (
                      <>
                        <div className="-mx-2 my-1 border-t" />
                        <Button
                          type="button"
                          variant="ghost"
                          className="justify-start text-destructive hover:text-destructive"
                          onClick={onDelete}
                        >
                          <Trash2Icon className="size-4" />
                          Delete task
                        </Button>
                      </>
                    ) : null}
                  </div>
                </div>
              ) : (
                <div className={cn("p-4", FLAT_CARDS)}>{side.history}</div>
              )}
            </ScrollArea>
          </>
        )}
      </PopoverContent>
    </Popover>
  )
}

/** The History card drawn flat inside the dropdown: a heading and its rows, no frame. */
const FLAT_CARDS =
  "[&_[data-slot=card]]:rounded-none [&_[data-slot=card]]:bg-transparent [&_[data-slot=card]]:py-0 [&_[data-slot=card]]:ring-0 [&_[data-slot=card-header]]:!px-0 [&_[data-slot=card-content]]:!px-0"
