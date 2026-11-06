import * as React from "react"
import {
  EraserIcon,
  ListTodoIcon,
  LockIcon,
  LockOpenIcon,
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
import { Popover, PopoverContent } from "@/components/ui/popover"
import { Popover as PopoverPrimitive } from "radix-ui"
import { TabbedMenu } from "@/components/project/my-settings-menu"
import { ScrollArea } from "@/components/ui/scroll-area"
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
  const notes = React.useRef<NotesHandle>(null)
  const [confirmDelete, setConfirmDelete] = React.useState(false)
  // A pick in the ⋮ menu that opens a card in the panel: the keyboard goes
  // there instead of back to the ⋮ as the menu closes.
  const picked = React.useRef<"move" | "ask" | null>(null)
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
            {/* Follow as a bell beside the ⋮ (Tyler, 6 Nov 2026: "move the bell follow here
                ... just add the icon only"); it was at the right of the menu's tabs. */}
            {side.followButton}
            <TaskMenu
              side={side}
              notes={notes}
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
          {side ? <SideBody side={side} notes={notes} /> : parts.body}
        </div>
      </ScrollArea>
      {/* Stays at the bottom while the rest scrolls (Tyler, 20 Oct 2026), with Add to
          task just above it since 6 Nov 2026. */}
      {side ? <TaskAddRow side={side} /> : null}
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

function SideBody({ side, notes }: { side: TaskSide; notes: React.Ref<NotesHandle> }) {
  return (
    <>
      {side.tagList}
      {side.link}
      {side.notices}
      {/* The panel's own body under the title, always there to write in, as a
          note's words sit under its name in the Note app (Tyler, 28 Oct 2026). */}
      {side.notes.empty && side.readOnly ? null : side.notes.field({ handle: notes })}
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
 * are too redundent, combine them into one"), drawn since 6 Nov 2026 as My
 * settings is ("It needs to copy the Ui of the left panel tabs"): underlined
 * tabs from the left, 32px apart, and each tab scrolling inside it.
 * - **General** (was Details): Person, Dates and Details as grouped lists,
 *   each row its value and an arrow that opens its field (Tyler's drawing,
 *   `pick-rows.tsx`), then Needs review, Delete and Lock
 *   the notes, Ask for more time, Duplicate, Move to project, Save as task
 *   template, and Delete task under a line.
 * - **Versions**: the notes' earlier versions, with Bring back.
 * Remind me is a row under Dates since 6 Nov 2026 ("put reminds me under
 * here"); it was a tab for a few hours.
 * The text toolbar's row went the same day ("remove this"), and so did the
 * History tab ("Remove the history feature, we dont need it since we already
 * have versions"). Each field saves
 * on its own, so there is no Save button.
 */
function TaskMenu({
  side,
  open,
  onOpenChange,
  notes,
  onDelete,
  onMove,
  onAskTime,
  onCloseAutoFocus,
}: {
  side: TaskSide
  open: boolean
  onOpenChange: (open: boolean) => void
  notes: React.RefObject<NotesHandle | null>
  onDelete: (() => void) | null
  onMove: () => void
  onAskTime: () => void
  onCloseAutoFocus: (event: Event) => void
}) {
  function close() {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
    onOpenChange(false)
  }
  const row = "w-full justify-start font-normal"

  const general = (
    <div className="grid [&_[data-slot=select-trigger]]:w-full">
      <div className="px-4 py-3">{side.settings}</div>
      <div className="grid gap-1 px-2 pb-2 empty:hidden [&_[data-slot=button]]:font-normal">
        {side.review}
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
        {side.readOnly ? null : <TaskMoreRows detail={side.detail} onMove={onMove} onAskTime={onAskTime} onPicked={close} />}
        {onDelete ? (
          <>
            <div className="-mx-2 my-1 border-t" />
            <Button type="button" variant="ghost" className="justify-start text-destructive hover:text-destructive" onClick={onDelete}>
              <Trash2Icon className="size-4" />
              Delete task
            </Button>
          </>
        ) : null}
      </div>
    </div>
  )

  return (
    <TabbedMenu
      label="Task menu"
      align="end"
      // 10% narrower than My settings (Tyler, 6 Nov 2026: "reduce the width of the dropdown by 10%").
      width="20.4rem"
      open={open}
      onOpenChange={(next) => (next ? onOpenChange(true) : close())}
      onCloseAutoFocus={onCloseAutoFocus}
      tabs={[
        { value: "general", label: "General", content: general },
        { value: "versions", label: "Versions", content: <div className="px-4 py-3">{side.versions}</div> },
      ]}
    />
  )
}

/**
 * Add to task, a row of icons just above the panel's footer (Tyler, 6 Nov
 * 2026: "Move tasks action row down to the footer"; it was the top of the ⋮
 * menu): Tags, Comment (only while the chat is empty), Files, Steps and Time.
 * The one picked opens above the row in a box of its own, titled, with the
 * same insides it had in the menu.
 */
function TaskAddRow({ side }: { side: TaskSide }) {
  const [adding, setAdding] = React.useState<Adding | null>(null)
  const canChat = side.chat.count === 0 && !side.readOnly
  const filesCount = side.files.count
  // The first message sent: the Chat card takes over in the panel, so the box closes.
  if (adding === "chat" && !canChat) setAdding(null)
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

  return (
    <Popover
      open={Boolean(picked)}
      onOpenChange={(open) => {
        if (open) return
        // Leaving a field saves it, so closing first leaves the field being typed in.
        if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
        setAdding(null)
      }}
    >
      <PopoverPrimitive.Anchor asChild>
        {/* In a panel too narrow for five words, the icons stay and the words go, each
            named on hover instead. */}
        <div className="@container shrink-0 border-t px-2 py-1.5" role="group" aria-label="Add to task">
          <div className="grid auto-cols-fr grid-flow-col">
            {tiles.map((tile) => (
              <Tooltip key={tile.key}>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    aria-label={tile.label}
                    aria-pressed={adding === tile.key}
                    className="h-auto min-w-0 flex-col gap-1 px-1 py-1.5 text-xs font-normal [&_svg:not([class*='size-'])]:size-5"
                    onClick={() => setAdding(adding === tile.key ? null : tile.key)}
                  >
                    {tile.icon}
                    <span className="@max-[20rem]:hidden">{tile.label}</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{tile.title}</TooltipContent>
              </Tooltip>
            ))}
          </div>
        </div>
      </PopoverPrimitive.Anchor>
      <PopoverContent
        side="top"
        align="center"
        collisionPadding={16}
        aria-label={picked?.title}
        className="grid w-[min(22.7rem,calc(100vw-2rem))] gap-3 p-3 [&_.text-sm]:!text-[13px] [&_.text-xs]:!text-[11.5px] [&_[data-slot=button]]:text-[13px]"
      >
        {picked ? (
          <>
            <h2 className="text-sm font-medium">{picked.title}</h2>
            <ScrollArea className="min-h-0" viewportClassName="max-h-[min(60vh,32rem)]">
              {adding === "files" ? (
                <div className="grid gap-3">
                  <p className="text-xs text-muted-foreground">
                    Up to {LIMITS.filesPerTask} files on a task. Only people who can see the task can download them.
                  </p>
                  {side.files.content}
                </div>
              ) : adding === "tags" ? (
                side.tags
              ) : adding === "steps" ? (
                side.steps.add
              ) : adding === "time" ? (
                side.time?.content
              ) : (
                side.chat.content
              )}
            </ScrollArea>
          </>
        ) : null}
      </PopoverContent>
    </Popover>
  )
}
