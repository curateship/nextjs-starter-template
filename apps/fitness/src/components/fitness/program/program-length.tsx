import * as React from "react"
import { useRouter } from "@tanstack/react-router"
import { ArchiveIcon, FlagIcon, Loader2Icon, RotateCcwIcon } from "lucide-react"
import { toast } from "sonner"

import { calendarChanged } from "@/components/fitness/program/calendar-version"
import { useAutoSave, type ProgramPageData } from "@/components/fitness/program/program-data"
import { CollapsibleSettingsCard } from "@/components/settings/collapsible-settings-card"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Meter } from "@/components/ui/meter"
import { NumberField } from "@/components/ui/number-field"
import { changeProgram } from "@/lib/api/fitness/programs"
import { formatDay, weekStart } from "@/lib/fitness/dates"
import { reportFitnessError } from "@/lib/fitness/report-error"
import { programEndDay, programWeekOf } from "@/lib/fitness/schedule"

/**
 * How long a program runs. A program can run for a set number of weeks,
 * counted from its start day, the same day training blocks count from. Left
 * at 0 it runs for good, as every program did before 21 Oct 2026.
 */
function lengthOf(data: ProgramPageData) {
  const weeks = data.program.weeks
  const end = programEndDay(data.strength.startDay, weeks)
  if (!weeks || !end) return null
  const week = programWeekOf(data.strength.startDay, data.today)
  return { weeks, end, week, over: data.today > end, started: week >= 1 }
}

/**
 * The left panel's line for a program with a length: "Week 5 of 12" with a
 * thin bar. After the last week it becomes the card that asks what's next:
 * run it again with the weights where they are, or end it, which archives it.
 */
export function ProgramLengthLine({ data }: { data: ProgramPageData }) {
  const router = useRouter()
  const [busy, setBusy] = React.useState<"again" | "end" | null>(null)
  const [ending, setEnding] = React.useState(false)
  const length = lengthOf(data)
  if (!length || data.program.archived) return null

  async function act(kind: "again" | "end") {
    setBusy(kind)
    try {
      await changeProgram(
        kind === "again"
          ? { action: "runAgain", programId: data.program.id }
          : { action: "archive", programId: data.program.id, archived: true }
      )
      const startsWhen = weekStart(data.today) === data.today ? "today" : "on Monday"
      toast.success(kind === "again" ? `Week 1 starts again ${startsWhen}.` : "Program ended and archived.")
      setEnding(false)
      calendarChanged()
      await router.invalidate()
    } catch (error) {
      reportFitnessError(error)
    } finally {
      setBusy(null)
    }
  }

  if (!length.over) {
    const shown = Math.max(1, length.week)
    return (
      <div className="grid gap-1.5 rounded-lg border p-3 text-sm">
        <div className="flex items-center justify-between gap-2">
          <span className="font-medium">{length.started ? `Week ${shown} of ${length.weeks}` : `Starts ${formatDay(data.strength.startDay)}`}</span>
          <span className="text-xs text-muted-foreground">Ends {formatDay(length.end)}</span>
        </div>
        <Meter
          value={length.started ? shown : 0}
          max={length.weeks}
          size="sm"
          label="Weeks of the program"
          valueText={`Week ${shown} of ${length.weeks}`}
        />
      </div>
    )
  }

  return (
    <div className="grid gap-3 rounded-lg border p-3 text-sm">
      <div className="flex items-start gap-2">
        <FlagIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
        <div className="grid gap-0.5">
          <p className="font-medium">{length.weeks} weeks done</p>
          <p className="text-muted-foreground">
            The last week ended {formatDay(length.end)}, so nothing more is planned. Run it again or end it.
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" disabled={busy !== null} onClick={() => void act("again")}>
          {busy === "again" ? <Loader2Icon className="animate-spin" /> : <RotateCcwIcon />}
          Run it again
        </Button>
        <Button type="button" variant="outline" disabled={busy !== null} onClick={() => setEnding(true)}>
          <ArchiveIcon />
          End program
        </Button>
      </div>
      <ConfirmDialog
        open={ending}
        onOpenChange={setEnding}
        title={`End ${data.program.name}?`}
        description="It's archived. Its workouts stay in History and keep counting toward records. You can bring it back from the program's actions."
        confirmLabel="End program"
        loading={busy === "end"}
        onConfirm={() => void act("end")}
      />
    </div>
  )
}

/** The Program length card in the program's settings window. 0 weeks runs for good. */
export function ProgramLengthCard({ data }: { data: ProgramPageData }) {
  const router = useRouter()
  const autoSave = useAutoSave()
  const [weeks, setWeeks] = React.useState(data.program.weeks ?? 0)
  const [shownWeeks, setShownWeeks] = React.useState(data.program.weeks)
  if (shownWeeks !== data.program.weeks) {
    setShownWeeks(data.program.weeks)
    setWeeks(data.program.weeks ?? 0)
  }
  const id = `program-weeks-${data.program.id}`

  function save(value: number, at: "soon" | "now") {
    setWeeks(value)
    autoSave[at]("program-weeks", async () => {
      await changeProgram({ action: "weeks", programId: data.program.id, weeks: value > 0 ? value : null })
      calendarChanged()
      await router.invalidate()
    })
  }

  const end = programEndDay(data.strength.startDay, weeks > 0 ? weeks : null)
  return (
    <CollapsibleSettingsCard storageId="fitness-program-length" title="Program length" size="sm" contentClassName="grid gap-4">
      <fieldset disabled={data.program.archived} className="contents">
        <NumberField
          id={id}
          label="Weeks it runs, 0 for no end"
          hint={`Counted from ${formatDay(data.strength.startDay)}, the day it started. After the last week nothing more is planned, and you pick between running it again and ending it.`}
          value={weeks}
          min={0}
          max={104}
          onChange={(value) => save(value, "soon")}
          onCommit={() => save(weeks, "now")}
        />
        {end ? <p className="text-[13px] text-muted-foreground">The last day is {formatDay(end)}.</p> : null}
      </fieldset>
    </CollapsibleSettingsCard>
  )
}
