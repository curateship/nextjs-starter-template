import * as React from "react"
import { useRouter } from "@tanstack/react-router"
import { Loader2Icon } from "lucide-react"

import { DueDayPicker } from "@/components/project/due-day-picker"
import { DueDate } from "@/components/project/task-bits"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import { changeTasks, type TaskCard } from "@/lib/api/project/tasks"
import { plural } from "@/lib/format/plural"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { reportBulkOutcome } from "@/lib/project/bulk-outcome"
import { getProjectErrorMessage } from "@/lib/project/errors"
import { showErrorToast } from "@/lib/toast/error-toast"

/**
 * My overdue tasks in one window, all ticked, moved to one day or left with
 * no date. It is the bulk bar's due date change, so each move is checked on
 * its own and counts toward "Date moved 3 times" (Tyler, 13 Oct 2026).
 */
export function CatchUpDialog({
  open,
  tasks,
  onClose,
}: {
  open: boolean
  tasks: TaskCard[]
  onClose: () => void
}) {
  const router = useRouter()
  const [run, busy] = useAsyncAction(getProjectErrorMessage)
  const [unticked, setUnticked] = React.useState<ReadonlySet<string>>(() => new Set())
  const [day, setDay] = React.useState<string | null>(null)
  const [dayMissing, setDayMissing] = React.useState(false)
  const ticked = tasks.filter((task) => !unticked.has(task.id))

  function close() {
    setUnticked(new Set())
    setDay(null)
    setDayMissing(false)
    onClose()
  }

  async function apply(dueDate: string | null) {
    if (ticked.length === 0) {
      showErrorToast("Tick at least one task.")
      return
    }
    let outcome = { changed: [] as string[], refused: [] as { title: string; reason: string }[] }
    const ok = await run(async () => {
      outcome = await changeTasks({ taskIds: ticked.map((task) => task.id), change: { kind: "due", dueDate } })
    })
    if (!ok) return
    reportBulkOutcome(outcome, dueDate ? "moved" : "left with no date")
    await router.invalidate()
    close()
  }

  function move() {
    if (!day) {
      setDayMissing(true)
      showErrorToast("Pick the day to move them to.")
      return
    }
    void apply(day)
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (!next && !busy ? close() : undefined)}>
      <DialogContent variant="admin" className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Catch up on overdue</DialogTitle>
          <DialogDescription>
            Untick any you'll still finish today, then move the rest to one day or leave them with no date.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <Card size="sm">
            <CardHeader>
              <CardTitle>
                {ticked.length} of {tasks.length} {plural(tasks.length, "task")} ticked
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea viewportClassName="max-h-72">
                <ul className="grid gap-2 pr-3">
                  {tasks.map((task) => {
                    const boxId = `catch-up-${task.id}`
                    return (
                      <li key={task.id} className="flex items-start gap-3">
                        <Checkbox
                          id={boxId}
                          className="mt-0.5"
                          checked={!unticked.has(task.id)}
                          disabled={busy}
                          onCheckedChange={(value) =>
                            setUnticked((current) => {
                              const next = new Set(current)
                              if (value === true) next.delete(task.id)
                              else next.add(task.id)
                              return next
                            })
                          }
                        />
                        <div className="grid min-w-0 flex-1 gap-0.5">
                          <Label htmlFor={boxId} className="font-medium break-words">
                            {task.title}
                          </Label>
                          <span className="flex flex-wrap gap-x-3 text-xs">
                            <span className="text-muted-foreground">{task.projectName}</span>
                            <DueDate dueDate={task.dueDate} dueAt={task.dueAt} status={task.status} />
                          </span>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </ScrollArea>
            </CardContent>
          </Card>
          <Card size="sm">
            <CardHeader>
              <CardTitle>Move them to</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="catch-up-day">New due date</Label>
                <DueDayPicker
                  id="catch-up-day"
                  value={day}
                  disabled={busy}
                  aria-invalid={dayMissing}
                  onChange={(next) => {
                    setDay(next)
                    setDayMissing(false)
                  }}
                />
              </div>
            </CardContent>
          </Card>
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={close} disabled={busy}>
            Cancel
          </Button>
          <Button type="button" variant="outline" onClick={() => void apply(null)} disabled={busy}>
            Leave with no date
          </Button>
          <Button type="button" onClick={move} disabled={busy}>
            {busy ? <Loader2Icon className="size-4 animate-spin" /> : null}
            Move {ticked.length} {plural(ticked.length, "task")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
