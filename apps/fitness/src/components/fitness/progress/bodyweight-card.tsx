import * as React from "react"
import { Loader2Icon, PlusIcon, TargetIcon, Trash2Icon } from "lucide-react"
import { useRouter } from "@tanstack/react-router"
import { CartesianGrid, ComposedChart, Line, ReferenceLine, Scatter, XAxis, YAxis } from "recharts"
import { toast } from "sonner"

import { ChartLegend } from "@/components/fitness/progress/chart-legend"
import { WeightInput } from "@/components/fitness/weight-input"
import { PanelCard } from "@/components/fitness/panel-card"
import { NewRecordDropdown } from "@/components/shared/new-record-dropdown"
import { Button } from "@/components/ui/button"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { DatePicker } from "@/components/ui/date-picker"
import { FieldLabel } from "@/components/ui/field-label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { changeWeighIn, saveTarget } from "@/lib/api/fitness/progress"
import { bodyweightPace, type BodyweightPace } from "@/lib/fitness/bodyweight-target"
import { seriesColour } from "@/lib/dashboard/chart-colours"
import { formatDay, todayIn } from "@/lib/fitness/dates"
import { reportFitnessError } from "@/lib/fitness/report-error"
import { formatWeight, formatWeightNumber, fromKg, type WeightUnit } from "@/lib/fitness/weights"
import { showErrorToast } from "@/lib/toast/error-toast"

type WeighInPoint = { day: string; weightKg: number; averageKg: number }

const config: ChartConfig = {
  weight: { label: "Weigh-in", color: seriesColour(3) },
  average: { label: "7-day average", color: seriesColour(0) },
  target: { label: "Target", color: seriesColour(1) },
}

/**
 * The pace line under the chart: "Losing 0.4 kg a week, about 9 weeks to go",
 * read from the seven-day average over the last four weeks.
 */
function paceWords(pace: BodyweightPace, unit: WeightUnit) {
  switch (pace.kind) {
    case "onTarget":
      return "On target."
    case "tooSoon":
      return "Weigh in for two weeks to see a pace."
    case "steady":
      return "Holding steady, not moving toward the target."
    case "away":
      return "Heading away from the target."
    case "toward": {
      const rate = formatWeight(Math.abs(pace.kgPerWeek), unit)
      const weeks = pace.weeks === 1 ? "about a week to go" : `about ${pace.weeks} weeks to go`
      return `${pace.kgPerWeek < 0 ? "Losing" : "Gaining"} ${rate} a week, ${weeks}.`
    }
  }
}

/**
 * The Bodyweight card's own button: the person's target bodyweight, set,
 * changed or removed in a small dropdown, the card's own small option (UI
 * standard, "Settings"). It is the person's, so every
 * program shows the same one.
 */
function TargetButton({ targetKg, unit }: { targetKg: number | null; unit: WeightUnit }) {
  const router = useRouter()
  const id = React.useId()
  const [open, setOpen] = React.useState(false)
  const [value, setValue] = React.useState<number | null>(targetKg)
  const [busy, setBusy] = React.useState(false)

  async function save(next: number | null) {
    setBusy(true)
    try {
      await saveTarget(next)
      await router.invalidate()
      toast.success(next === null ? "Target removed." : `Target set at ${formatWeight(next, unit)}.`)
      setOpen(false)
    } catch (error) {
      reportFitnessError(error)
    } finally {
      setBusy(false)
    }
  }

  const label = targetKg === null ? "Set a target" : "Change the target"
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (next) setValue(targetKg)
        setOpen(next)
      }}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button type="button" variant="ghost" size="icon-sm" aria-label={label}>
              <TargetIcon />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
      <PopoverContent align="end" className="w-72 p-3">
        <form
          className="grid gap-4"
          aria-label="Target bodyweight"
          onSubmit={(event) => {
            event.preventDefault()
            if (value === null) {
              showErrorToast("Type the weight you're aiming for.")
              return
            }
            void save(value)
          }}
        >
          <div className="grid gap-2">
            <FieldLabel htmlFor={id}>Target weight</FieldLabel>
            <WeightInput id={id} valueKg={value} unit={unit} showUnit placeholder={"\u2013"} onCommit={setValue} />
          </div>
          <div className="flex items-center justify-end gap-2">
            {targetKg !== null ? (
              <Button type="button" variant="ghost" className="mr-auto" disabled={busy} onClick={() => void save(null)}>
                Remove target
              </Button>
            ) : null}
            <Button type="submit" disabled={busy}>
              {busy ? <Loader2Icon className="animate-spin" /> : null}
              {targetKg === null ? "Create target" : "Save target"}
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  )
}

/** "2026-10-19" from a picked calendar date, read as the day it shows. */
function dayOf(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${date.getFullYear()}-${month}-${day}`
}

/**
 * Progress's "New …" in the middle header: one weigh-in, the day first, then
 * the weight, with Create weigh-in at the bottom. One weigh-in per day: a
 * second one on the same day replaces the first. Clicking away keeps what was
 * typed for the next opening.
 */
export function NewWeighIn({ unit, timeZone }: { unit: WeightUnit; timeZone: string }) {
  const router = useRouter()
  const today = todayIn(timeZone)
  const dayId = React.useId()
  const weightId = React.useId()
  const [open, setOpen] = React.useState(false)
  const [day, setDay] = React.useState(today)
  const [weightKg, setWeightKg] = React.useState<number | null>(null)
  const [saving, setSaving] = React.useState(false)
  const [year, month, date] = day.split("-").map(Number)

  async function save() {
    if (weightKg === null) {
      showErrorToast("Type your weight first.")
      return
    }
    setSaving(true)
    try {
      await changeWeighIn({ action: "save", day, weightKg })
      await router.invalidate()
      toast.success(`Saved ${formatWeight(weightKg, unit)} for ${formatDay(day)}.`)
      setWeightKg(null)
      setDay(today)
      setOpen(false)
    } catch (error) {
      reportFitnessError(error)
    } finally {
      setSaving(false)
    }
  }

  return (
    <NewRecordDropdown
      label="New weigh-in"
      open={open}
      onOpenChange={setOpen}
      submitLabel="Create weigh-in"
      busy={saving}
      onSubmit={() => void save()}
      trigger={
        <Button type="button" variant="outline" className="@max-3xl:size-8 @max-3xl:px-0" aria-label="New weigh-in">
          <PlusIcon />
          <span className="@max-3xl:hidden">New weigh-in</span>
        </Button>
      }
    >
      <div className="grid gap-2">
        <FieldLabel htmlFor={dayId}>Day</FieldLabel>
        <DatePicker
          id={dayId}
          value={new Date(year, month - 1, date)}
          onChange={(picked) => setDay(picked ? dayOf(picked) : today)}
        />
      </div>
      <div className="grid gap-2">
        <FieldLabel htmlFor={weightId}>Weight</FieldLabel>
        <WeightInput id={weightId} valueKg={weightKg} unit={unit} showUnit placeholder={"\u2013"} onCommit={setWeightKg} />
      </div>
    </NewRecordDropdown>
  )
}

/**
 * Daily bodyweight. Weight moves a kilogram or more from one morning to the
 * next with water and food, so each weigh-in is a dot and the line is the
 * average of the seven days ending on it, which shows the real direction.
 * Weigh-ins are added from New weigh-in in the middle header.
 *
 * A card on the right of the Progress view. A save or a delete reloads the
 * page's data, so the Bodyweight tile in the middle moves with it.
 */
export function BodyweightCard({
  weighIns,
  targetKg,
  unit,
  canEdit,
}: {
  weighIns: readonly WeighInPoint[]
  /** The person's target bodyweight, drawn as a dashed line with the pace under the chart. */
  targetKg: number | null
  unit: WeightUnit
  /** False when a coach is looking: they read the line but don't weigh in for the client. */
  canEdit: boolean
}) {
  const router = useRouter()
  const [deleting, setDeleting] = React.useState<string | null>(null)
  const [confirming, setConfirming] = React.useState<string | null>(null)

  async function remove(target: string) {
    setDeleting(target)
    try {
      await changeWeighIn({ action: "delete", day: target })
      await router.invalidate()
      setConfirming(null)
      toast.success(`Deleted the weigh-in for ${formatDay(target)}.`)
    } catch (error) {
      reportFitnessError(error)
    } finally {
      setDeleting(null)
    }
  }

  const recent = [...weighIns].reverse().slice(0, 10)
  const latest = weighIns[weighIns.length - 1]
  const pace = targetKg === null ? null : bodyweightPace(weighIns, targetKg)

  return (
    <PanelCard
      storageId="fitness-right-bodyweight"
      title="Bodyweight"
      meta={latest ? formatWeight(latest.weightKg, unit) : undefined}
      action={canEdit ? <TargetButton targetKg={targetKg} unit={unit} /> : undefined}
    >
        {weighIns.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {canEdit
              ? "Press New weigh-in on a few mornings and the line shows which way you're going."
              : "No weigh-ins yet."}
          </p>
        ) : (
          <WeightChart weighIns={weighIns} unit={unit} targetKg={targetKg} />
        )}
        {targetKg !== null ? (
          <p className="text-[13px]">
            <span className="text-muted-foreground">Target {formatWeight(targetKg, unit)}. </span>
            {pace ? paceWords(pace, unit) : "Weigh in to see how far there is to go."}
          </p>
        ) : canEdit && weighIns.length > 0 ? (
          <p className="text-[13px] text-muted-foreground">
            Set a target weight from the target button in this card&apos;s heading to see the pace to it.
          </p>
        ) : null}

        {recent.length > 0 ? (
          <ul className="divide-y rounded-lg border bg-background">
            {recent.map((entry) => (
              <li key={entry.day} className="flex items-center gap-2 py-1.5 pr-1 pl-3">
                <span className="grid min-w-0 flex-1">
                  <span className="truncate text-[13px]">{formatDay(entry.day)}</span>
                  <span className="truncate text-xs text-muted-foreground tabular-nums">
                    Average {formatWeight(entry.averageKg, unit)}
                  </span>
                </span>
                <span className="text-[13px] whitespace-nowrap tabular-nums">{formatWeight(entry.weightKg, unit)}</span>
                {canEdit ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Delete the weigh-in for ${formatDay(entry.day)}`}
                        onClick={() => setConfirming(entry.day)}
                      >
                        <Trash2Icon />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Delete</TooltipContent>
                  </Tooltip>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
      <ConfirmDialog
        open={confirming !== null}
        onOpenChange={(open) => {
          if (!open) setConfirming(null)
        }}
        title="Delete this weigh-in?"
        description={confirming ? `The weigh-in for ${formatDay(confirming)} goes, and the average line is worked out without it.` : ""}
        confirmLabel="Delete weigh-in"
        destructive
        loading={deleting !== null}
        onConfirm={() => {
          if (confirming) void remove(confirming)
        }}
      />
    </PanelCard>
  )
}

function WeightChart({
  weighIns,
  unit,
  targetKg,
}: {
  weighIns: readonly WeighInPoint[]
  unit: WeightUnit
  targetKg: number | null
}) {
  const round = (kg: number) => Math.round(fromKg(kg, unit) * 10) / 10
  const target = targetKg === null ? null : round(targetKg)
  const data = weighIns.map((entry) => ({
    label: formatDay(entry.day),
    weight: round(entry.weightKg),
    average: round(entry.averageKg),
  }))
  return (
    <div className="grid gap-3">
      <ChartLegend
        items={[
          { key: "weight", label: "Weigh-in", color: seriesColour(3), mark: "dot" },
          { key: "average", label: "7-day average", color: seriesColour(0), mark: "line" },
          ...(targetKg === null
            ? []
            : [{ key: "target", label: `Target ${formatWeightNumber(targetKg, unit)} ${unit}`, color: seriesColour(1), mark: "dashed" as const }]),
        ]}
      />
      <div className="h-48 w-full min-w-0">
        <ChartContainer config={config} className="h-full w-full">
          <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 10 }} minTickGap={24} />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 10 }}
              width={40}
              domain={[
                (min: number) => Math.floor(Math.min(min, target ?? min) - 1),
                (max: number) => Math.ceil(Math.max(max, target ?? max) + 1),
              ]}
            />
            {target === null ? null : (
              <ReferenceLine y={target} stroke="var(--color-target)" strokeDasharray="6 4" strokeWidth={1.5} ifOverflow="extendDomain" />
            )}
            <ChartTooltip
              content={
                <ChartTooltipContent
                  formatter={(value, name) => (
                    <span className="flex w-full justify-between gap-3">
                      <span className="text-muted-foreground">{String(config[String(name)]?.label ?? name)}</span>
                      <span className="font-medium text-foreground tabular-nums">
                        {String(value)} {unit}
                      </span>
                    </span>
                  )}
                />
              }
            />
            <Scatter dataKey="weight" fill="var(--color-weight)" isAnimationActive={false} />
            <Line
              dataKey="average"
              type="monotone"
              stroke="var(--color-average)"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ChartContainer>
      </div>
    </div>
  )
}
