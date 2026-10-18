import * as React from "react"
import { useRouter } from "@tanstack/react-router"
import { Loader2Icon } from "lucide-react"
import { toast } from "sonner"

import { draftOf, type ExerciseDraft } from "@/components/fitness/exercises/exercise-draft"
import { ExerciseFields } from "@/components/fitness/exercises/exercise-fields"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import {
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { FieldLabel } from "@/components/ui/field-label"
import { FormDialog } from "@/components/ui/form-dialog"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { changeExercise, type Exercise } from "@/lib/api/fitness/exercises"
import { EQUIPMENT_LABELS, MOVEMENT_LABELS, MUSCLE_LABELS } from "@/lib/fitness/exercise-catalog"
import { reportFitnessError } from "@/lib/fitness/report-error"
import { routineTypeLabel, type RoutineTypeId } from "@/lib/fitness/routine-types"
import { showErrorToast } from "@/lib/toast/error-toast"

/**
 * One lift, opened from the Exercises dashboard. Three ways in:
 *
 * - A built-in lift reads only, with Done. Its "Painful lift" switch still works.
 * - One of the person's own lifts can be changed (Save changes) or deleted.
 * - New exercise opens it empty, with the dashboard's routine type picked.
 *
 * The painful switch saves the moment it flips and its note when the field is
 * left, because marking a lift painful is its own act, not part of the form.
 */
export function ExerciseDialog({
  open,
  exercise,
  newRoutineType,
  onClose,
  onCreated,
}: {
  open: boolean
  /** The lift to show, or null for New exercise. */
  exercise: Exercise | null
  /** The routine type a new lift starts with: the one the dashboard is filtered to. */
  newRoutineType: RoutineTypeId
  onClose: () => void
  onCreated: (exerciseId: string) => void
}) {
  const router = useRouter()
  const blank = React.useMemo(() => draftOf(exercise, newRoutineType), [exercise, newRoutineType])
  const [draft, setDraft] = React.useState<ExerciseDraft>(blank)
  const [shown, setShown] = React.useState({ open, blank })
  if (shown.open !== open || shown.blank !== blank) {
    setShown({ open, blank })
    if (open) setDraft(blank)
  }
  const [nameInvalid, setNameInvalid] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [confirmingDelete, setConfirmingDelete] = React.useState(false)
  const builtIn = exercise?.builtIn ?? false
  const dirty = !builtIn && JSON.stringify(draft) !== JSON.stringify(blank)

  async function save() {
    const name = draft.name.trim()
    if (!name) {
      setNameInvalid(true)
      showErrorToast("Give the exercise a name.")
      return
    }
    setBusy(true)
    try {
      const input = { ...draft, name, pictureUrl: draft.pictureUrl || null }
      if (exercise) {
        await changeExercise({ action: "update", exerciseId: exercise.id, input })
        toast.success(`Saved ${name}.`)
        await router.invalidate()
        onClose()
      } else {
        const { id } = await changeExercise({ action: "create", input })
        toast.success(`Added ${name} to your library.`)
        await router.invalidate()
        onCreated(id as string)
      }
    } catch (error) {
      reportFitnessError(error)
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!exercise) return
    setBusy(true)
    try {
      await changeExercise({ action: "delete", exerciseId: exercise.id })
      toast.success(`Deleted ${exercise.name}.`)
      setConfirmingDelete(false)
      await router.invalidate()
      onClose()
    } catch (error) {
      setConfirmingDelete(false)
      reportFitnessError(error)
    } finally {
      setBusy(false)
    }
  }

  const title = exercise ? exercise.name : "New exercise"
  const description = !exercise
    ? "A lift of your own. Only you see it."
    : builtIn
      ? `Built in. ${routineTypeLabel(exercise.routineType)}.`
      : `Yours. ${routineTypeLabel(exercise.routineType)}.`

  return (
    <>
      <FormDialog open={open} dirty={dirty} busy={busy} onClose={onClose}>
        {(requestClose) => (
          <DialogContent variant="admin">
            <DialogHeader>
              <DialogTitle>{title}</DialogTitle>
              <DialogDescription>{description}</DialogDescription>
            </DialogHeader>
            <DialogBody className="grid gap-6">
              <Card size="sm">
                <CardHeader>
                  <CardTitle>Exercise</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4">
                  {exercise && builtIn ? (
                    <BuiltInFacts exercise={exercise} />
                  ) : (
                    <ExerciseFields
                      draft={draft}
                      nameInvalid={nameInvalid}
                      onChange={(next) => {
                        if (next.name.trim()) setNameInvalid(false)
                        setDraft(next)
                      }}
                    />
                  )}
                </CardContent>
              </Card>
              {exercise ? <PainCard exercise={exercise} /> : null}
            </DialogBody>
            <DialogFooter>
              {exercise && !builtIn ? (
                <Button
                  type="button"
                  variant="destructive"
                  size="lg"
                  className="sm:mr-auto"
                  disabled={busy}
                  onClick={() => setConfirmingDelete(true)}
                >
                  Delete
                </Button>
              ) : null}
              {builtIn ? (
                <Button type="button" size="lg" onClick={requestClose}>
                  Done
                </Button>
              ) : (
                <>
                  <Button type="button" variant="outline" size="lg" onClick={requestClose}>
                    Cancel
                  </Button>
                  <Button type="button" size="lg" disabled={busy} onClick={() => void save()}>
                    {busy ? <Loader2Icon className="animate-spin" /> : null}
                    {exercise ? "Save changes" : "Create exercise"}
                  </Button>
                </>
              )}
            </DialogFooter>
          </DialogContent>
        )}
      </FormDialog>
      <ConfirmDialog
        open={confirmingDelete}
        onOpenChange={setConfirmingDelete}
        title={`Delete ${exercise?.name ?? "this exercise"}?`}
        description="It leaves your library and any program that uses it. A lift with logged sets can't be deleted, so its history stays."
        confirmLabel="Delete exercise"
        destructive
        loading={busy}
        onConfirm={() => void remove()}
      />
    </>
  )
}

function BuiltInFacts({ exercise }: { exercise: Exercise }) {
  return (
    <>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
        <dt className="text-muted-foreground">Muscles</dt>
        <dd>{exercise.muscles.map((muscle) => MUSCLE_LABELS[muscle]).join(", ")}</dd>
        <dt className="text-muted-foreground">Equipment</dt>
        <dd>{exercise.equipment.map((item) => EQUIPMENT_LABELS[item]).join(", ")}</dd>
        <dt className="text-muted-foreground">Movement</dt>
        <dd>{MOVEMENT_LABELS[exercise.movement]}</dd>
        <dt className="text-muted-foreground">Weight</dt>
        <dd>{exercise.isBodyweight ? "Your bodyweight, plus anything added" : "The bar or the weights"}</dd>
      </dl>
      <p className="text-xs text-muted-foreground">
        Built-in lifts can't be changed. Add your own with New exercise for anything different.
      </p>
    </>
  )
}

/**
 * Marks a lift as painful. Swaps stop offering it until the mark comes off.
 * The switch saves at once; the note saves when its field is left.
 */
function PainCard({ exercise }: { exercise: Exercise }) {
  const router = useRouter()
  const [avoided, setAvoided] = React.useState(exercise.avoided)
  const [note, setNote] = React.useState(exercise.avoidNote)
  const [saving, setSaving] = React.useState(false)
  const switchId = React.useId()
  const noteId = React.useId()

  async function save(nextAvoided: boolean, nextNote: string) {
    const before = avoided
    setAvoided(nextAvoided)
    setSaving(true)
    try {
      if (nextAvoided) await changeExercise({ action: "avoid", exerciseId: exercise.id, note: nextNote })
      else await changeExercise({ action: "unavoid", exerciseId: exercise.id })
      toast.success(nextAvoided ? `${exercise.name} is marked painful.` : `${exercise.name} is no longer marked painful.`)
      await router.invalidate()
    } catch (error) {
      setAvoided(before)
      reportFitnessError(error)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Painful lift
          {avoided ? <Badge variant="outline">Marked</Badge> : null}
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        <p className="text-sm text-muted-foreground">
          If this lift hurts, mark it. Swaps stop offering it until you take the mark off.
        </p>
        <div className="flex items-center justify-between gap-4">
          <Label htmlFor={switchId}>This lift hurts</Label>
          <span className="flex items-center gap-2">
            {saving ? <Loader2Icon className="size-4 animate-spin text-muted-foreground" aria-label="Saving" /> : null}
            <Switch
              id={switchId}
              checked={avoided}
              disabled={saving}
              onCheckedChange={(next) => void save(next, note)}
            />
          </span>
        </div>
        {avoided ? (
          <div className="grid gap-2">
            <FieldLabel htmlFor={noteId}>What hurts</FieldLabel>
            <Textarea
              id={noteId}
              rows={1}
              maxLength={300}
              placeholder="Left knee at the bottom"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              onBlur={() => {
                if (note.trim() !== exercise.avoidNote) void save(true, note)
              }}
            />
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
