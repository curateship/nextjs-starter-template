import * as React from "react"
import {
  EraserIcon,
  LockIcon,
  LockOpenIcon,
  SquareMousePointerIcon,
  Trash2Icon,
} from "lucide-react"

import {
  DELETE_TASK_DETAIL,
  DELETE_TASK_QUESTION,
  TaskView,
  type TaskParts,
  type TaskSide,
} from "@/components/project/task-body"
import type { NotesHandle } from "@/components/project/task-notes"
import { ASK_TIME_DAY_ID, MOVE_PICKER_ID, TaskMoreRows } from "@/components/project/task-more-menu"
import { SidePanelCollapseButton } from "@/components/shared/three-panels"
import { DashboardCardHeader } from "@/components/shared/dashboard-card-header"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { TabbedMenu } from "@/components/shared/notes/tabbed-menu"
import { ScrollArea } from "@/components/ui/scroll-area"
import { PANEL_GUTTER } from "@/lib/layout/panel-gutter"
import { cn } from "@/lib/utils"
import { RightPanelCover, useRightCover } from "@/components/shared/notes/page-cover"

/**
 * The project page's right panel: the open task. Tyler drew it on 13 Oct
 * 2026 (`workspace/docs/assets/pasted-image-1791936316739365000.png`): the
 * status and a cog along the top, then Chat. On 20 Oct he put Add
 * note, Add comment and Add files behind a three-dot button and took the
 * cross away (`pasted-image-1792504237260017000.png`). On 23 Oct he took it off
 * My dashboard too: "There is no 'x' icon to close the right panel to show an
 * empty panel." Notes show above Chat once a task has some. On 14
 * Oct he moved Follow into the cog and gave the chat the notes' pattern: an
 * icon that opens a dropdown while it's empty.
 * Later on 20 Oct the task's name took the status's place in the header, and
 * the status moved to a footer pinned to the panel's bottom with Completed
 * (`task-footer.tsx`).
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
  const cover = useRightCover()
  if (!taskId) {
    return (
      <CoverFrame>
        <DashboardCardHeader className={cn(cover && "border-b-transparent")}>
          <h2 className="min-w-0 flex-1 text-sm font-medium">Task</h2>
          <SidePanelCollapseButton side="right" label="Hide the task" />
        </DashboardCardHeader>
        <div className="grid flex-1 content-center justify-items-center gap-2 p-6 text-center">
          <SquareMousePointerIcon className="size-5 text-muted-foreground" aria-hidden />
          <p className="max-w-56 text-sm text-muted-foreground">
            Click a task to see its notes and chat here.
          </p>
        </div>
      </CoverFrame>
    )
  }
  return (
    <TaskView key={taskId} taskId={taskId} onLoaded={onLoaded}>
      {(parts) => <SidePanel parts={parts} onClose={onClose} />}
    </TaskView>
  )
}

/**
 * The left page's cover carried on behind the right panel's header (the
 * shell's look, Tyler, 8 Nov 2026: "make it an extension of the left
 * panel"): the same picture, or the same sky with no sun or moon. The frame
 * is `isolate`, so the cover lies behind everything in it.
 */
function CoverFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative isolate flex min-h-0 flex-1 flex-col">
      <RightPanelCover />
      {children}
    </div>
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

  const cover = useRightCover()
  return (
    <div
      ref={frame}
      tabIndex={-1}
      className="relative isolate flex min-h-0 flex-1 flex-col outline-none"
      aria-label={parts.title}
      role="region"
    >
      {/* The task's name on the left, where the status was (Tyler, 20 Oct
          2026), then the one ⋮ menu, which took in the cog's on 2 Nov 2026.
          The button has no border or background (Tyler, 14 Oct 2026). The left
          page's cover lies behind it, its line see-through over it. */}
      <RightPanelCover />
      <DashboardCardHeader className={cn(cover && "border-b-transparent")}>
        {side ? (
          <div className="flex min-w-0 flex-1 items-start gap-1">
            <div className="min-w-0 flex-1">{side.title}</div>
            {/* The ⋮ and Hide the task stay together on the title's first line, so a
                title that wraps onto two never leaves one higher than the other
                (Tyler, 11 Nov 2026: "fix icon aligment"). */}
            <div className="flex shrink-0 items-center gap-2">
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
            <SidePanelCollapseButton side="right" label="Hide the task" />
            </div>
          </div>
        ) : (
          <>
            <h2 className="min-w-0 flex-1 truncate text-sm font-medium">{parts.title}</h2>
            <SidePanelCollapseButton side="right" label="Hide the task" />
          </>
        )}
      </DashboardCardHeader>
      <ScrollArea className="min-h-0 flex-1" viewportClassName="h-full">
        <div data-side-panel-body="" className={cn("grid", PANEL_GUTTER)}>
          {side ? <SideBody side={side} notes={notes} /> : parts.body}
        </div>
      </ScrollArea>
      {/* Stays at the bottom while the rest scrolls (Tyler, 20 Oct 2026), with Add to
          task just above it since 6 Nov 2026. */}
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
      {side.link}
      {side.notices}
      {/* The panel's own body under the title, always there to write in, as a
          note's words sit under its name in the Note app (Tyler, 28 Oct 2026). */}
      {side.notes.empty && side.readOnly ? null : side.notes.field({ handle: notes })}
      {/* Comments are a "/" block in the notes; with none placed they show here (Tyler, 6 Nov 2026). */}
      {side.commentsBelow}
    </>
  )
}

/**
 * The task's one ⋮ menu (Tyler, 2 Nov 2026: "the 3 dot and the cog dropdowns
 * are too redundent, combine them into one"), drawn since 6 Nov 2026 as My
 * settings is ("It needs to copy the Ui of the left panel tabs"): underlined
 * tabs from the left, 32px apart, and each tab scrolling inside it.
 * - **General** (was Details): Person, Dates and Details as grouped lists,
 *   each row its value and an arrow that opens its field (Tyler's drawing,
 *   `pick-rows.tsx`), then Needs review, Delete and Lock
 *   the notes, Ask for more time, Duplicate, Move to project, and Delete task
 *   under a line.
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
        {side.followRow}
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
