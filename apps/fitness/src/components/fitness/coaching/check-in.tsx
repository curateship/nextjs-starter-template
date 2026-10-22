import * as React from "react"
import { useRouter } from "@tanstack/react-router"
import { ClipboardListIcon, Loader2Icon, SendIcon } from "lucide-react"
import { toast } from "sonner"

import { WeightInput } from "@/components/fitness/weight-input"
import { EffortPicker } from "@/components/fitness/workout/finish-dialogs"
import { DashboardCardHeader } from "@/components/shared/dashboard-card-header"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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
import { Textarea } from "@/components/ui/textarea"
import { checkInsSeen, sendCheckIn, type CheckIn } from "@/lib/api/fitness/check-ins"
import { CHECK_IN_SCORES, type CheckInScoreKey } from "@/lib/fitness/check-in"
import { addDays, formatDay, type Day } from "@/lib/fitness/dates"
import { reportFitnessError } from "@/lib/fitness/report-error"
import { formatWeight, type WeightUnit } from "@/lib/fitness/weights"

type Scores = Record<CheckInScoreKey, number | null>

const NO_SCORES: Scores = { sleep: null, stress: null, training: null }

/** "Mon, Oct 19 to Sun, Oct 25", the week a check-in answers for. */
function weekWords(week: Day) {
  return `${formatDay(week)} to ${formatDay(addDays(week, 6))}`
}

/**
 * The weekly check-in's card at the top of a coached person's Programs
 * dashboard, from Sunday until it's sent (Tyler, 21 Oct 2026: bodyweight,
 * sleep, stress and how training felt, each 1 to 5, and a note). Send your
 * check-in opens the window.
 */
export function CheckInCard({ week, unit }: { week: Day; unit: WeightUnit }) {
  const [open, setOpen] = React.useState(false)
  return (
    <Card className="gap-0 py-0">
      <DashboardCardHeader>
        <ClipboardListIcon className="size-4 text-muted-foreground" aria-hidden />
        <h2 className="text-sm font-semibold">Weekly check-in</h2>
      </DashboardCardHeader>
      <div className="flex flex-wrap items-center justify-between gap-2 p-3">
        <p className="text-sm">
          Tell your coach how {weekWords(week)} went. Every answer can stay empty.
        </p>
        <Button type="button" onClick={() => setOpen(true)}>
          <SendIcon />
          Send your check-in
        </Button>
      </div>
      <CheckInDialog open={open} week={week} unit={unit} onClose={() => setOpen(false)} />
    </Card>
  )
}

function CheckInDialog({
  open,
  week,
  unit,
  onClose,
}: {
  open: boolean
  week: Day
  unit: WeightUnit
  onClose: () => void
}) {
  const router = useRouter()
  const [weightKg, setWeightKg] = React.useState<number | null>(null)
  const [scores, setScores] = React.useState<Scores>(NO_SCORES)
  const [note, setNote] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const ids = { weight: React.useId(), note: React.useId(), sleep: React.useId(), stress: React.useId(), training: React.useId() }
  const dirty = weightKg !== null || Object.values(scores).some((value) => value !== null) || note.trim() !== ""

  function close() {
    onClose()
    setWeightKg(null)
    setScores(NO_SCORES)
    setNote("")
  }

  async function send() {
    setBusy(true)
    try {
      await sendCheckIn({ weightKg, ...scores, note })
      toast.success("Check-in sent to your coach.")
      close()
      await router.invalidate()
    } catch (error) {
      reportFitnessError(error)
    } finally {
      setBusy(false)
    }
  }

  return (
    <FormDialog open={open} dirty={dirty} busy={busy} onClose={close}>
      {(requestClose) => (
        <DialogContent variant="admin">
          <form
            className="contents"
            onSubmit={(event) => {
              event.preventDefault()
              void send()
            }}
          >
            <DialogHeader>
              <DialogTitle>Weekly check-in</DialogTitle>
              <DialogDescription>For {weekWords(week)}. Your coach gets it straight away.</DialogDescription>
            </DialogHeader>
            <DialogBody className="grid gap-6">
              <Card size="sm">
                <CardHeader>
                  <CardTitle>Bodyweight</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-2">
                  <FieldLabel htmlFor={ids.weight} hint="It's saved as today's weigh-in too.">
                    {`This morning (${unit})`}
                  </FieldLabel>
                  <WeightInput id={ids.weight} valueKg={weightKg} unit={unit} onCommit={setWeightKg} />
                </CardContent>
              </Card>
              <Card size="sm">
                <CardHeader>
                  <CardTitle>The week</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4">
                  {CHECK_IN_SCORES.map((question) => (
                    <div key={question.key} className="grid gap-2">
                      <span id={ids[question.key]} className="text-sm font-medium">
                        {question.label}
                      </span>
                      <EffortPicker
                        max={5}
                        labelId={ids[question.key]}
                        value={scores[question.key]}
                        onChange={(value) => setScores((current) => ({ ...current, [question.key]: value }))}
                      />
                      <p className="flex justify-between text-xs text-muted-foreground">
                        <span>1 is {question.low.toLowerCase()}</span>
                        <span>5 is {question.high.toLowerCase()}</span>
                      </p>
                    </div>
                  ))}
                </CardContent>
              </Card>
              <Card size="sm">
                <CardHeader>
                  <CardTitle>Note</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-2">
                  <Label htmlFor={ids.note}>Anything your coach should know</Label>
                  <Textarea
                    id={ids.note}
                    rows={1}
                    maxLength={1000}
                    placeholder="Knee felt better by Thursday"
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                  />
                </CardContent>
              </Card>
            </DialogBody>
            <DialogFooter>
              <Button type="button" variant="outline" size="lg" onClick={requestClose}>
                Cancel
              </Button>
              <Button type="submit" size="lg" disabled={busy}>
                {busy ? <Loader2Icon className="animate-spin" /> : null}
                Send check-in
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      )}
    </FormDialog>
  )
}

/**
 * A client's check-ins on their Programs dashboard, for their coach: newest
 * first, each week's scores side by side so a trend shows. Showing them takes
 * the New mark off the Clients table.
 */
export function ClientCheckIns({
  checkIns,
  unit,
  name,
  clientId,
}: {
  checkIns: CheckIn[]
  unit: WeightUnit
  name: string
  clientId: string
}) {
  const newest = checkIns[0]?.id
  // Once they're on screen, the coach has read them: the Clients table's New mark goes.
  React.useEffect(() => {
    if (newest) void checkInsSeen(clientId).catch(() => undefined)
  }, [clientId, newest])
  return (
    <Card className="gap-0 py-0">
      <DashboardCardHeader>
        <ClipboardListIcon className="size-4 text-muted-foreground" aria-hidden />
        <h2 className="text-sm font-semibold">Check-ins</h2>
      </DashboardCardHeader>
      {checkIns.length === 0 ? (
        <p className="p-3 text-sm text-muted-foreground">
          {name} hasn't sent a check-in yet. They're asked every Sunday.
        </p>
      ) : (
        <ul className="divide-y">
          {checkIns.map((checkIn) => (
            <li key={checkIn.id} className="grid gap-2 p-3">
              <p className="text-sm font-medium">{weekWords(checkIn.week)}</p>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-[13px] sm:grid-cols-4">
                <div className="grid">
                  <dt className="text-muted-foreground">Bodyweight</dt>
                  <dd className="tabular-nums">{checkIn.weightKg === null ? "Not given" : formatWeight(checkIn.weightKg, unit)}</dd>
                </div>
                {CHECK_IN_SCORES.map((question) => (
                  <div key={question.key} className="grid">
                    <dt className="text-muted-foreground">{question.label}</dt>
                    <dd className="tabular-nums">
                      {checkIn[question.key] === null
                        ? "Not given"
                        : // Stress runs the other way from sleep and training, so each score says what 5 means.
                          `${checkIn[question.key]} of 5 (5 is ${question.high.toLowerCase()})`}
                    </dd>
                  </div>
                ))}
              </dl>
              {checkIn.note ? <p className="text-sm whitespace-pre-line">{checkIn.note}</p> : null}
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
