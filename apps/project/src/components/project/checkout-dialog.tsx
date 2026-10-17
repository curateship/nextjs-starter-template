import * as React from "react"
import { useRouter } from "@tanstack/react-router"
import { Loader2Icon } from "lucide-react"

import { StatusBadge } from "@/components/project/task-bits"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import {
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { FormDialog } from "@/components/ui/form-dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { checkOutForTheDay, type CheckinPage } from "@/lib/api/project/checkins"
import { plural } from "@/lib/format/plural"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { clockIn, longDayLabel } from "@/lib/project/days"
import { getProjectErrorMessage } from "@/lib/project/errors"
import { LIMITS } from "@/lib/project/rules"
import { todaysPicks } from "@/lib/project/todays-picks"

/**
 * The optional evening check-out, a window opened from My dashboard after
 * checking in. Today's picks are listed with their status, and ticking one
 * marks it Done on Check out. "Plan your next check-in" ticks open tasks
 * that the next check-in starts with already picked, and "What's left"
 * starts tomorrow's Yesterday box for me to change. Tyler's rule: it is optional. Nothing reminds anyone, and
 * nobody else sees it.
 */
export function CheckoutDialog({
  page,
  open,
  onClose,
}: {
  page: CheckinPage
  open: boolean
  onClose: () => void
}) {
  const router = useRouter()
  const [run, busy] = useAsyncAction(getProjectErrorMessage)
  const picks = todaysPicks(page)
  const savedNote = page.checkout?.noteLeft ?? ""
  const savedPlan = page.checkout?.tomorrowTaskIds ?? []
  const [done, setDone] = React.useState<Set<string>>(() => new Set())
  const [note, setNote] = React.useState(savedNote)
  const [plan, setPlan] = React.useState<Set<string>>(() => new Set(savedPlan))
  // Everything still open and mine, the same list the check-in offers.
  const openTasks = page.groups.flatMap((group) => group.tasks).filter((task) => task.status !== "done")

  // Each opening starts from what is saved.
  const [wasOpen, setWasOpen] = React.useState(open)
  if (wasOpen !== open) {
    setWasOpen(open)
    if (open) {
      setDone(new Set())
      setNote(savedNote)
      setPlan(new Set(savedPlan))
    }
  }
  const planChanged = plan.size !== savedPlan.length || savedPlan.some((id) => !plan.has(id))
  const dirty = done.size > 0 || note !== savedNote || planChanged

  async function save() {
    const tomorrowTaskIds = [...plan].filter((id) => !done.has(id))
    const ok = await run(
      () => checkOutForTheDay({ doneTaskIds: [...done], noteLeft: note, tomorrowTaskIds }),
      tomorrowTaskIds.length
        ? `Checked out. Your next check-in starts with ${tomorrowTaskIds.length} ${plural(tomorrowTaskIds.length, "task")} picked.`
        : "Checked out. What's left starts tomorrow's check-in."
    )
    if (!ok) return
    await router.invalidate()
    onClose()
  }

  return (
    <FormDialog open={open} dirty={dirty} busy={busy} onClose={onClose}>
      {(requestClose) => (
        <DialogContent variant="admin" className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Check out · {longDayLabel(page.today.day)}</DialogTitle>
            <DialogDescription>
              {page.checkout?.at
                ? `You checked out at ${clockIn(page.checkout.at, page.clock.zone)}. You can change it until the day ends.`
                : "Optional. Only you and the site admin see this, and nothing reminds you to do it."}
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <Card size="sm">
              <CardHeader>
                <CardTitle>Today's picks</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3">
                {picks.length === 0 ? (
                  <p className="text-sm text-muted-foreground">You picked nothing today.</p>
                ) : (
                  <>
                    <p className="text-sm text-muted-foreground">
                      Tick what you finished. It's marked Done when you check out.
                    </p>
                    <ul className="grid gap-2">
                      {picks.map((task) => {
                        const id = `checkout-${task.id}`
                        const finished = task.status === "done"
                        return (
                          <li key={task.id} className="flex items-start gap-3 rounded-lg border p-3">
                            <Checkbox
                              id={id}
                              className="mt-0.5"
                              checked={finished || done.has(task.id)}
                              disabled={finished || busy}
                              onCheckedChange={(value) =>
                                setDone((current) => {
                                  const next = new Set(current)
                                  if (value === true) next.add(task.id)
                                  else next.delete(task.id)
                                  return next
                                })
                              }
                            />
                            <div className="grid min-w-0 flex-1 gap-1">
                              <Label htmlFor={id} className="font-medium break-words">
                                {task.title}
                              </Label>
                              <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                {task.projectName}
                                <StatusBadge status={task.status} />
                              </span>
                            </div>
                          </li>
                        )
                      })}
                    </ul>
                  </>
                )}
              </CardContent>
            </Card>
            <Card size="sm">
              <CardHeader>
                <CardTitle>Plan your next check-in</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3">
                {openTasks.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nothing else is open for you.</p>
                ) : (
                  <>
                    <p className="text-sm text-muted-foreground">
                      Tick what you'll work on next. Your next check-in opens with them already picked,
                      and you can still change them then.
                    </p>
                    <ul className="grid gap-2">
                      {openTasks.map((task) => {
                        const id = `checkout-plan-${task.id}`
                        const finishing = done.has(task.id)
                        return (
                          <li key={task.id} className="flex items-start gap-3 rounded-lg border p-3">
                            <Checkbox
                              id={id}
                              className="mt-0.5"
                              checked={!finishing && plan.has(task.id)}
                              disabled={finishing || busy}
                              onCheckedChange={(value) =>
                                setPlan((current) => {
                                  const next = new Set(current)
                                  if (value === true) next.add(task.id)
                                  else next.delete(task.id)
                                  return next
                                })
                              }
                            />
                            <div className="grid min-w-0 flex-1 gap-1">
                              <Label htmlFor={id} className="font-medium break-words">
                                {task.title}
                              </Label>
                              <span className="text-xs text-muted-foreground">
                                {finishing ? "Being marked Done today" : task.projectName}
                              </span>
                            </div>
                          </li>
                        )
                      })}
                    </ul>
                  </>
                )}
              </CardContent>
            </Card>
            <Card size="sm">
              <CardHeader>
                <CardTitle>What's left</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4">
                <p className="text-sm text-muted-foreground">
                  It starts tomorrow's {page.questions.yesterday} box, for you to change.
                </p>
                <div className="grid gap-2">
                  <Label htmlFor="checkout-note-left">Note for tomorrow</Label>
                  <Textarea
                    id="checkout-note-left"
                    rows={1}
                    value={note}
                    maxLength={LIMITS.checkinNote}
                    placeholder="Contact form half done"
                    onChange={(event) => setNote(event.target.value)}
                  />
                </div>
              </CardContent>
            </Card>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={requestClose} disabled={busy}>
              Cancel
            </Button>
            <Button type="button" disabled={busy} onClick={() => void save()}>
              {busy ? <Loader2Icon className="size-4 animate-spin" /> : null}
              Check out
            </Button>
          </DialogFooter>
        </DialogContent>
      )}
    </FormDialog>
  )
}
