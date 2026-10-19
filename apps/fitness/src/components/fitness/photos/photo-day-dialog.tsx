import * as React from "react"
import { Loader2Icon } from "lucide-react"

import { PHOTO_MEASUREMENTS, type PhotoMeasurementKey } from "@/components/fitness/photos/measurements"
import { WeightInput } from "@/components/fitness/weight-input"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { DatePicker } from "@/components/ui/date-picker"
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
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { changePhotoSession, type PhotoSession } from "@/lib/api/fitness/photos"
import { reportFitnessError } from "@/lib/fitness/report-error"
import type { WeightUnit } from "@/lib/fitness/weights"
import { showErrorToast } from "@/lib/toast/error-toast"

type Draft = {
  day: string
  bodyweightKg: number | null
  note: string
} & Record<PhotoMeasurementKey, number | null>

function draftOf(session: PhotoSession | null, today: string): Draft {
  return {
    day: session?.day ?? today,
    bodyweightKg: session?.bodyweightKg ?? null,
    chestCm: session?.chestCm ?? null,
    waistCm: session?.waistCm ?? null,
    hipsCm: session?.hipsCm ?? null,
    armCm: session?.armCm ?? null,
    thighCm: session?.thighCm ?? null,
    note: session?.note ?? "",
  }
}

function dayOf(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
}

/**
 * A photo day's date, bodyweight and tape measurements. The photos themselves
 * go in from the right panel once it exists, one slot at a time.
 */
export function PhotoDayDialog({
  open,
  session,
  today,
  unit,
  onClose,
  onSaved,
}: {
  open: boolean
  /** Null makes a new photo day. */
  session: PhotoSession | null
  today: string
  unit: WeightUnit
  onClose: () => void
  onSaved: (session: PhotoSession) => void
}) {
  const [draft, setDraft] = React.useState(() => draftOf(session, today))
  const [openedFor, setOpenedFor] = React.useState<{ open: boolean; id: string | null }>({
    open,
    id: session?.id ?? null,
  })
  if (openedFor.open !== open || openedFor.id !== (session?.id ?? null)) {
    setOpenedFor({ open, id: session?.id ?? null })
    if (open) setDraft(draftOf(session, today))
  }
  const [busy, setBusy] = React.useState(false)
  const original = draftOf(session, today)
  const dirty = JSON.stringify(original) !== JSON.stringify(draft)
  const [year, month, date] = draft.day.split("-").map(Number)

  async function save() {
    if (draft.day > today) {
      showErrorToast("A photo day can't be in the future.")
      return
    }
    setBusy(true)
    try {
      const input = { ...draft }
      const saved = session
        ? await changePhotoSession({ action: "update", sessionId: session.id, input })
        : await changePhotoSession({ action: "create", input })
      if (saved) onSaved(saved)
    } catch (error) {
      reportFitnessError(error)
    } finally {
      setBusy(false)
    }
  }

  return (
    <FormDialog open={open} dirty={dirty} busy={busy} onClose={onClose}>
      {(requestClose) => (
        <DialogContent variant="admin">
          <DialogHeader>
            <DialogTitle>{session ? "Edit photo day" : "New photo day"}</DialogTitle>
            <DialogDescription>
              {session
                ? "Change the date, bodyweight or measurements. Photos change on the day's card."
                : "Save the day first, then add front, side and back photos on the right."}
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="grid gap-6">
            <Card size="sm">
              <CardHeader>
                <CardTitle>Day</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <FieldLabel htmlFor="photo-day-date">Date</FieldLabel>
                  <DatePicker
                    id="photo-day-date"
                    value={new Date(year, month - 1, date)}
                    onChange={(picked) => setDraft((current) => ({ ...current, day: picked ? dayOf(picked) : today }))}
                  />
                </div>
                <div className="grid gap-2">
                  <FieldLabel htmlFor="photo-day-weight">Bodyweight ({unit})</FieldLabel>
                  <WeightInput
                    id="photo-day-weight"
                    valueKg={draft.bodyweightKg}
                    unit={unit}
                    onCommit={(bodyweightKg) => setDraft((current) => ({ ...current, bodyweightKg }))}
                  />
                </div>
              </CardContent>
            </Card>
            <Card size="sm">
              <CardHeader>
                <CardTitle>Measurements</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                {PHOTO_MEASUREMENTS.map(({ key, label }) => (
                  <div key={key} className="grid gap-2">
                    <FieldLabel htmlFor={`photo-day-${key}`} hint="Around the widest part, in centimetres.">
                      {label} (cm)
                    </FieldLabel>
                    <CentimetreInput
                      id={`photo-day-${key}`}
                      value={draft[key]}
                      onCommit={(value) => setDraft((current) => ({ ...current, [key]: value }))}
                    />
                  </div>
                ))}
              </CardContent>
            </Card>
            <Card size="sm">
              <CardHeader>
                <CardTitle>Note</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-2">
                <FieldLabel htmlFor="photo-day-note" className="sr-only">
                  Note
                </FieldLabel>
                <Textarea
                  id="photo-day-note"
                  rows={1}
                  maxLength={1000}
                  placeholder="Anything worth remembering about this day"
                  value={draft.note}
                  onChange={(event) => setDraft((current) => ({ ...current, note: event.target.value }))}
                />
              </CardContent>
            </Card>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" size="lg" onClick={requestClose}>
              Cancel
            </Button>
            <Button type="button" size="lg" disabled={busy} onClick={() => void save()}>
              {busy ? <Loader2Icon className="animate-spin" /> : null}
              {session ? "Save changes" : "Create photo day"}
            </Button>
          </DialogFooter>
        </DialogContent>
      )}
    </FormDialog>
  )
}

/** A centimetre figure, kept as typed until the field is left. Empty is null. */
function CentimetreInput({
  id,
  value,
  onCommit,
}: {
  id: string
  value: number | null
  onCommit: (value: number | null) => void
}) {
  const shown = value === null ? "" : String(value)
  const [text, setText] = React.useState(shown)
  const [lastShown, setLastShown] = React.useState(shown)
  if (shown !== lastShown) {
    setLastShown(shown)
    setText(shown)
  }
  const [invalid, setInvalid] = React.useState(false)

  function commit() {
    const trimmed = text.trim().replace(",", ".")
    if (trimmed === "") {
      setInvalid(false)
      onCommit(null)
      return
    }
    const number = Number(trimmed)
    if (!Number.isFinite(number) || number <= 0 || number > 400) {
      setInvalid(true)
      showErrorToast("Type a measurement between 1 and 400 cm.")
      return
    }
    setInvalid(false)
    onCommit(Math.round(number * 10) / 10)
  }

  return (
    <Input
      id={id}
      inputMode="decimal"
      autoComplete="off"
      value={text}
      aria-invalid={invalid || undefined}
      onChange={(event) => setText(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault()
          commit()
        }
      }}
    />
  )
}
