import * as React from "react"
import { Loader2Icon } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { FormDialog } from "@/components/ui/form-dialog"
import { Label } from "@/components/ui/label"
import { LoadingRow } from "@/components/ui/loading-row"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import type { Exercise } from "@/lib/api/fitness/exercises"
import { changeExercise } from "@/lib/api/fitness/exercises"
import { changeWorkoutExercise, loadSwaps } from "@/lib/api/fitness/workouts"
import { EQUIPMENT_LABELS, MUSCLE_LABELS } from "@/lib/fitness/exercise-catalog"
import { getFitnessErrorMessage } from "@/lib/fitness/errors"
import { reportFitnessError } from "@/lib/fitness/report-error"

export type SwapTarget = { position: number; exerciseId: string; name: string; fromPlan: boolean }

/**
 * Swaps the lift at one place in today's workout for another that works the
 * same main muscle with the equipment the person has, never one on their
 * pain list. "Change the plan too" makes later workouts use it as well.
 */
export function SwapDialog({
  workoutId,
  target,
  equipment,
  onClose,
  onSwapped,
}: {
  workoutId: string
  target: SwapTarget | null
  equipment: string[]
  onClose: () => void
  onSwapped: () => Promise<void>
}) {
  const [options, setOptions] = React.useState<Exercise[] | null>(null)
  const [failure, setFailure] = React.useState<string | null>(null)
  const [changePlan, setChangePlan] = React.useState(false)
  const [busyId, setBusyId] = React.useState<string | null>(null)
  const [loadedFor, setLoadedFor] = React.useState<string | null>(null)
  const switchId = React.useId()

  const wanted = target ? `${target.position}:${target.exerciseId}` : null
  if (wanted !== loadedFor) {
    setLoadedFor(wanted)
    setOptions(null)
    setFailure(null)
    setChangePlan(false)
  }

  const exerciseId = target?.exerciseId ?? null
  const equipmentKey = equipment.join(",")
  React.useEffect(() => {
    if (!exerciseId) return
    let current = true
    loadSwaps(exerciseId, equipmentKey ? equipmentKey.split(",") : []).then(
      (found) => {
        if (current) setOptions(found)
      },
      (error: unknown) => {
        if (current) setFailure(getFitnessErrorMessage(error))
      }
    )
    return () => {
      current = false
    }
  }, [exerciseId, equipmentKey])

  async function pick(exercise: Exercise) {
    if (!target) return
    setBusyId(exercise.id)
    try {
      await changeWorkoutExercise({
        action: "swap",
        workoutId,
        position: target.position,
        exerciseId: exercise.id,
        changePlan,
      })
      toast.success(`Swapped ${target.name} for ${exercise.name}.`)
      await onSwapped()
      onClose()
    } catch (error) {
      reportFitnessError(error)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <Dialog open={Boolean(target)} onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent variant="admin">
        <DialogHeader>
          <DialogTitle>Swap {target?.name}</DialogTitle>
          <DialogDescription>Lifts for the same muscle that fit your equipment.</DialogDescription>
        </DialogHeader>
        <DialogBody className="grid gap-6">
          {target?.fromPlan ? (
            <div className="flex items-center justify-between gap-4">
              <Label htmlFor={switchId}>Change the plan too</Label>
              <Switch id={switchId} checked={changePlan} onCheckedChange={setChangePlan} />
            </div>
          ) : null}
          {failure ? (
            <p className="text-sm text-destructive">{failure}</p>
          ) : options === null ? (
            <LoadingRow label="Finding swaps" />
          ) : options.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nothing else in the library works that muscle with your equipment. Add a lift of your own on the
              Exercises dashboard.
            </p>
          ) : (
            <ul className="divide-y rounded-lg border">
              {options.map((exercise) => (
                <li key={exercise.id}>
                  <button
                    type="button"
                    className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
                    onClick={() => void pick(exercise)}
                    disabled={busyId !== null}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{exercise.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {exercise.muscles.map((muscle) => MUSCLE_LABELS[muscle]).join(", ")}
                        {exercise.equipment.length
                          ? ` · ${exercise.equipment.map((item) => EQUIPMENT_LABELS[item]).join(", ")}`
                          : ""}
                      </span>
                    </span>
                    {busyId === exercise.id ? <Loader2Icon className="size-4 animate-spin" /> : null}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * "This hurts": puts the lift on the person's pain list with a note, so swaps
 * stop offering it, then offers a swap for today.
 */
export function HurtsDialog({
  target,
  onClose,
  onSaved,
}: {
  target: SwapTarget | null
  onClose: () => void
  onSaved: (target: SwapTarget) => void
}) {
  const [note, setNote] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const [openFor, setOpenFor] = React.useState<SwapTarget | null>(null)
  if (target !== openFor) {
    setOpenFor(target)
    setNote("")
  }
  const noteId = React.useId()

  async function save() {
    if (!target) return
    setBusy(true)
    try {
      await changeExercise({ action: "avoid", exerciseId: target.exerciseId, note })
      toast.success(`${target.name} is on your pain list. Swaps won't offer it.`)
      onSaved(target)
    } catch (error) {
      reportFitnessError(error)
    } finally {
      setBusy(false)
    }
  }

  return (
    <FormDialog open={Boolean(target)} dirty={note.trim() !== ""} busy={busy} onClose={onClose}>
      {(requestClose) => (
        <DialogContent variant="admin">
          <DialogHeader>
            <DialogTitle>{target?.name} hurts</DialogTitle>
            <DialogDescription>
              It goes on your pain list. Swaps stop offering it until you take it off on the Exercises dashboard.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="grid gap-6">
            <Card size="sm">
              <CardHeader>
                <CardTitle>What happened</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4">
                <div className="grid gap-2">
                  <Label htmlFor={noteId}>Note</Label>
                  <Textarea
                    id={noteId}
                    rows={1}
                    maxLength={300}
                    placeholder="Left shoulder clicked on the way down"
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                  />
                </div>
              </CardContent>
            </Card>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={requestClose}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void save()} disabled={busy}>
              {busy ? <Loader2Icon className="size-4 animate-spin" /> : null}
              Add to pain list
            </Button>
          </DialogFooter>
        </DialogContent>
      )}
    </FormDialog>
  )
}
