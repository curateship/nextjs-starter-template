import * as React from "react"
import { Loader2Icon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { DatePicker } from "@/components/ui/date-picker"
import { DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { FormDialog } from "@/components/ui/form-dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { showErrorToast } from "@/lib/toast/error-toast"

export type DatePlanTarget = { matchId: string; theirName: string; dateAt: Date | null; datePlace: string; sample: boolean }

function timeOf(at: Date | null): string {
  if (!at) return "19:00"
  return `${String(at.getHours()).padStart(2, "0")}:${String(at.getMinutes()).padStart(2, "0")}`
}

/**
 * Add to calendar: the date's day, time and place, typed by the member. The
 * AI never sets these (Tyler's rule, 17 Oct 2026: a firm time and place wait
 * for him). Saving also writes it to Google Calendar when that is connected.
 */
export function DatePlanDialog({
  target,
  busy,
  onClose,
  onSave,
}: {
  target: DatePlanTarget | null
  busy: boolean
  onClose: () => void
  /** Resolves true once saved, so the window closes. */
  onSave: (plan: { dateAt: Date | null; place: string }) => Promise<boolean>
}) {
  return target ? <PlanWindow key={target.matchId} target={target} busy={busy} onClose={onClose} onSave={onSave} /> : null
}

function PlanWindow({
  target,
  busy,
  onClose,
  onSave,
}: {
  target: DatePlanTarget
  busy: boolean
  onClose: () => void
  onSave: (plan: { dateAt: Date | null; place: string }) => Promise<boolean>
}) {
  const [day, setDay] = React.useState<Date | undefined>(target.dateAt ?? undefined)
  const [time, setTime] = React.useState(timeOf(target.dateAt))
  const [place, setPlace] = React.useState(target.datePlace)
  const [dayInvalid, setDayInvalid] = React.useState(false)
  const dayId = React.useId()
  const timeId = React.useId()
  const placeId = React.useId()
  const dirty = (day?.toDateString() ?? "") !== (target.dateAt?.toDateString() ?? "") || time !== timeOf(target.dateAt) || place !== target.datePlace

  function save() {
    if (!day) {
      setDayInvalid(true)
      showErrorToast("Pick the day of the date first.")
      return
    }
    const [hours, minutes] = time.split(":").map(Number)
    const at = new Date(day)
    at.setHours(Number.isFinite(hours) ? hours : 19, Number.isFinite(minutes) ? minutes : 0, 0, 0)
    void onSave({ dateAt: at, place }).then((ok) => ok && onClose())
  }

  return (
    <FormDialog open dirty={dirty} busy={busy} onClose={onClose}>
      {(requestClose) => (
        <DialogContent variant="admin" className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Your date with {target.theirName}</DialogTitle>
            <DialogDescription>
              {target.sample ? "This is a sample, so saving changes nothing." : "Only you set the day, time and place. Date never agrees them for you."}
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="grid gap-6">
            <Card size="sm">
              <CardHeader>
                <CardTitle>When and where</CardTitle>
                <CardDescription>It shows on the Calendar screen under Dating, and in Google Calendar when that is connected in Settings.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="grid gap-2">
                    <Label htmlFor={dayId}>Day</Label>
                    <DatePicker
                      id={dayId}
                      value={day}
                      aria-invalid={dayInvalid || undefined}
                      onChange={(next) => {
                        setDay(next)
                        setDayInvalid(false)
                      }}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor={timeId}>Time</Label>
                    <Input id={timeId} type="time" value={time} onChange={(event) => setTime(event.target.value)} />
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor={placeId}>Place</Label>
                  <Input id={placeId} value={place} maxLength={300} placeholder="Bar Raval, College St" onChange={(event) => setPlace(event.target.value)} />
                </div>
              </CardContent>
            </Card>
          </DialogBody>
          <DialogFooter>
            {target.dateAt ? (
              <Button
                type="button"
                variant="destructive"
                className="sm:mr-auto"
                disabled={busy}
                onClick={() => void onSave({ dateAt: null, place: "" }).then((ok) => ok && onClose())}
              >
                Clear the time
              </Button>
            ) : null}
            <Button type="button" variant="outline" onClick={requestClose}>
              Cancel
            </Button>
            <Button type="button" disabled={busy} onClick={save}>
              {busy ? <Loader2Icon className="animate-spin" /> : null}
              {target.dateAt ? "Save changes" : "Add to calendar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      )}
    </FormDialog>
  )
}
