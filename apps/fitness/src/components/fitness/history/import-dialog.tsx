import * as React from "react"
import { FileTextIcon, Loader2Icon } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { Exercise } from "@/lib/api/fitness/exercises"
import { previewWorkoutImport, runWorkoutImport, type ImportPreview } from "@/lib/api/fitness/sharing"
import { formatDay } from "@/lib/fitness/dates"
import { reportFitnessError } from "@/lib/fitness/report-error"
import { WEIGHT_UNITS, type WeightUnit } from "@/lib/fitness/weights"
import { plural } from "@/lib/format/plural"
import { showErrorToast } from "@/lib/toast/error-toast"

const MAX_BYTES = 5 * 1024 * 1024
const OWN = "own"

/**
 * Reads a workout history exported from Strong or Hevy. The file is read in
 * the browser and checked by the server first, which says what it holds and
 * which library lift each exercise name matches. The person fixes any match,
 * or keeps a name as a lift of their own, and then imports. A second import
 * of the same file adds nothing. Every workout lands in the program the
 * window was opened from.
 */
export function ImportDialog({
  open,
  programId,
  unit: defaultUnit,
  exercises,
  onClose,
  onImported,
}: {
  open: boolean
  programId: string
  unit: WeightUnit
  exercises: Exercise[]
  onClose: () => void
  onImported: () => Promise<void>
}) {
  const [file, setFile] = React.useState<{ name: string; text: string } | null>(null)
  const [unit, setUnit] = React.useState<WeightUnit>(defaultUnit)
  const [preview, setPreview] = React.useState<ImportPreview | null>(null)
  const [matches, setMatches] = React.useState<Record<string, string>>({})
  const [busy, setBusy] = React.useState(false)
  const [wasOpen, setWasOpen] = React.useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setFile(null)
      setPreview(null)
      setMatches({})
      setUnit(defaultUnit)
    }
  }
  const fileInput = React.useRef<HTMLInputElement>(null)
  const unitId = React.useId()

  async function readFile(picked: File) {
    if (picked.size > MAX_BYTES) {
      showErrorToast("That file is over 5 MB. Export a shorter date range.")
      return
    }
    const text = await picked.text()
    setFile({ name: picked.name, text })
    await check(text, unit)
  }

  async function check(text: string, chosenUnit: WeightUnit) {
    setBusy(true)
    setPreview(null)
    try {
      const found = await previewWorkoutImport(text, chosenUnit, programId)
      setPreview(found)
      setMatches(Object.fromEntries(found.names.map((entry) => [entry.name, entry.exerciseId ?? OWN])))
    } catch (error) {
      reportFitnessError(error)
    } finally {
      setBusy(false)
    }
  }

  async function runImport() {
    if (!file || !preview) {
      showErrorToast("Pick an export file first.")
      return
    }
    setBusy(true)
    try {
      const result = await runWorkoutImport({
        text: file.text,
        unit,
        programId,
        matches: Object.entries(matches).map(([name, choice]) => ({
          name,
          exerciseId: choice === OWN ? null : choice,
        })),
      })
      toast.success(
        `Imported ${result.imported} ${plural(result.imported, "workout")}.${
          result.skipped ? ` ${result.skipped} ${plural(result.skipped, "was", "were")} already here.` : ""
        }`
      )
      await onImported()
    } catch (error) {
      reportFitnessError(error)
    } finally {
      setBusy(false)
    }
  }

  const unmatched = preview ? Object.values(matches).filter((choice) => choice === OWN).length : 0

  return (
    <FormDialog open={open} dirty={file !== null} busy={busy} onClose={onClose}>
      {(requestClose) => (
        <DialogContent variant="admin">
          <DialogHeader>
            <DialogTitle>Import from Strong or Hevy</DialogTitle>
            <DialogDescription>
              Export your workouts as a .csv file from the app's settings, then pick it here.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="grid gap-6">
            <Card size="sm">
              <CardHeader>
                <CardTitle>The file</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4">
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    ref={fileInput}
                    type="file"
                    accept=".csv,text/csv"
                    className="sr-only"
                    aria-label="Export file"
                    onChange={(event) => {
                      const picked = event.target.files?.[0]
                      event.target.value = ""
                      if (picked) void readFile(picked)
                    }}
                  />
                  <Button type="button" variant="outline" onClick={() => fileInput.current?.click()}>
                    <FileTextIcon className="size-4" />
                    {file ? "Pick another file" : "Pick a file"}
                  </Button>
                  {file ? <span className="truncate text-sm text-muted-foreground">{file.name}</span> : null}
                </div>
                <div className="grid gap-2">
                  <Label htmlFor={unitId}>Weights in the file are in</Label>
                  <Select
                    value={unit}
                    onValueChange={(value) => {
                      const next = value as WeightUnit
                      setUnit(next)
                      if (file) void check(file.text, next)
                    }}
                  >
                    <SelectTrigger id={unitId} className="sm:w-40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {WEIGHT_UNITS.map((entry) => (
                        <SelectItem key={entry} value={entry}>
                          {entry === "kg" ? "Kilograms" : "Pounds"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Only used when the file doesn't say. Hevy and newer Strong files say it themselves.
                  </p>
                </div>
              </CardContent>
            </Card>

            {busy && !preview ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
                <Loader2Icon className="size-4 animate-spin" />
                Reading the file
              </p>
            ) : null}

            {preview ? (
              <>
                <Card size="sm">
                  <CardHeader>
                    <CardTitle>What's in it</CardTitle>
                    <CardDescription>
                      From {preview.source === "strong" ? "Strong" : "Hevy"}, {formatDay(preview.firstDay)} to{" "}
                      {formatDay(preview.lastDay)}.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ul className="grid gap-1">
                      <li>
                        {preview.workouts} {plural(preview.workouts, "workout")} with {preview.sets}{" "}
                        {plural(preview.sets, "set")}.
                      </li>
                      {preview.alreadyImported ? (
                        <li>
                          {preview.alreadyImported} {plural(preview.alreadyImported, "is", "are")} already here and
                          won't be added again.
                        </li>
                      ) : null}
                    </ul>
                  </CardContent>
                </Card>
                <Card size="sm">
                  <CardHeader>
                    <CardTitle>Match the exercises</CardTitle>
                    <CardDescription>
                      {unmatched
                        ? `${unmatched} ${plural(unmatched, "name")} didn't match a lift in the library. Pick one, or keep it as your own.`
                        : "Every name matched a lift in the library. Change any that look wrong."}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-4">
                    {preview.names.map((entry) => (
                      <MatchRow
                        key={entry.name}
                        name={entry.name}
                        value={matches[entry.name] ?? OWN}
                        choices={exercises}
                        onChange={(value) => setMatches((current) => ({ ...current, [entry.name]: value }))}
                      />
                    ))}
                  </CardContent>
                </Card>
              </>
            ) : null}
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={requestClose}>
              Cancel
            </Button>
            <Button type="button" disabled={busy} onClick={() => void runImport()}>
              {busy && preview ? <Loader2Icon className="size-4 animate-spin" /> : null}
              {preview
                ? `Import ${preview.workouts - preview.alreadyImported} ${plural(preview.workouts - preview.alreadyImported, "workout")}`
                : "Import"}
            </Button>
          </DialogFooter>
        </DialogContent>
      )}
    </FormDialog>
  )
}

function MatchRow({
  name,
  value,
  choices,
  onChange,
}: {
  name: string
  value: string
  choices: Exercise[]
  onChange: (value: string) => void
}) {
  const id = React.useId()
  return (
    <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] sm:items-center sm:gap-4">
      <Label htmlFor={id} className="truncate">
        {name}
      </Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={OWN}>Add as my own</SelectItem>
          {choices.map((exercise) => (
            <SelectItem key={exercise.id} value={exercise.id}>
              {exercise.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
