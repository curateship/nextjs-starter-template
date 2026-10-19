import * as React from "react"
import { useRouter } from "@tanstack/react-router"
import { LockIcon, PlusIcon, SettingsIcon, SquareMousePointerIcon, Trash2Icon } from "lucide-react"
import { toast } from "sonner"

import { PanelCard } from "@/components/fitness/panel-card"
import { CompareView } from "@/components/fitness/photos/compare-view"
import { PHOTO_MEASUREMENTS } from "@/components/fitness/photos/measurements"
import { PhotoDayDialog } from "@/components/fitness/photos/photo-day-dialog"
import { PhotoSlot } from "@/components/fitness/photos/photo-slot"
import { PanelBody, PanelHeader } from "@/components/fitness/dashboard/panel-parts"
import type { ProgramViewProps } from "@/components/fitness/dashboard/view-props"
import { SegmentedChoice } from "@/components/fitness/segmented-choice"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { changePhotoSession, type PhotoSession, type PhotoSlot as Slot } from "@/lib/api/fitness/photos"
import { formatDay, todayIn } from "@/lib/fitness/dates"
import { reportFitnessError } from "@/lib/fitness/report-error"
import { formatWeight, formatWeightNumber, fromKg, type WeightUnit } from "@/lib/fitness/weights"
import { showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"

const SLOTS: Slot[] = ["front", "side", "back"]

function newestFirst(sessions: readonly PhotoSession[]) {
  return [...sessions].sort((a, b) => b.day.localeCompare(a.day))
}

const SHORT_DAY = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric" })

const VIEW_CHOICES = [
  { value: "timeline", label: "Timeline" },
  { value: "compare", label: "Compare" },
] as const

/** A day's figures that were filled in, as label and value: Waist, "84 cm". */
function figuresOf(session: PhotoSession, unit: WeightUnit) {
  return [
    session.bodyweightKg !== null ? { label: "Bodyweight", value: formatWeight(session.bodyweightKg, unit) } : null,
    ...PHOTO_MEASUREMENTS.map(({ key, label }) =>
      session[key] !== null ? { label, value: `${roundCm(session[key])} cm` } : null
    ),
  ].filter((entry): entry is { label: string; value: string } => entry !== null)
}

function roundCm(value: number) {
  return String(Math.round(value * 10) / 10)
}

/**
 * Before and after in the middle panel, as Tyler drew it on 18 Oct 2026: the
 * privacy line, Timeline or Compare, and New photo day; then every photo day
 * newest first as a card with its three photo boxes (click to browse, or drop
 * a file on one) and its figures as tags, or two days compared while
 * `?compare=` is set. Clicking a day opens it on the right. Only the owner sees any of it, and
 * a coach they switched photos on for.
 */
export function PhotosMiddle({ page, search, go }: ProgramViewProps) {
  const router = useRouter()
  const [creating, setCreating] = React.useState(false)
  if (page.viewData.view !== "photos") return null
  const { sessions, preferences } = page.viewData.photos
  const unit = preferences.unit
  const canEdit = page.program.mine
  const sorted = newestFirst(sessions)
  const pair = search.compare?.split(",") as [string, string] | undefined

  function startCompare() {
    if (sorted.length < 2) {
      showErrorToast("Add a second photo day to compare two of them.")
      return
    }
    const later = search.pick && sorted.some((session) => session.id === search.pick) ? search.pick : sorted[0].id
    const earlier = sorted[sorted.length - 1].id === later ? sorted[sorted.length - 2].id : sorted[sorted.length - 1].id
    go({ compare: `${earlier},${later}` })
  }

  return (
    <>
      {/* The privacy line takes its own row when the panel is too narrow to
          hold it beside the buttons on one line. */}
      <div className="@container shrink-0 px-3 pb-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="flex min-w-0 basis-full items-center gap-2 text-[13px] text-muted-foreground @4xl:flex-1 @4xl:basis-0">
          <LockIcon className="size-3.5 shrink-0" aria-hidden />
          {canEdit
            ? "Only you can see these photos. A coach sees them only if you switch that on for them."
            : "Your client switched photos on for you. Nobody else can see them."}
        </p>
        <SegmentedChoice
          label="Show"
          value={pair ? "compare" : "timeline"}
          options={VIEW_CHOICES}
          className="w-auto [&>button]:flex-none [&>button]:px-3"
          onChange={(next) => (next === "compare" ? startCompare() : go({ compare: undefined }))}
        />
        {canEdit ? (
          <Button type="button" onClick={() => setCreating(true)}>
            <PlusIcon />
            New photo day
          </Button>
        ) : null}
      </div>
      </div>
      <PanelBody>
        {pair ? (
          <CompareView
            sessions={sorted}
            firstId={pair[0]}
            secondId={pair[1]}
            unit={unit}
            onPick={(first, second) => go({ compare: `${first},${second}` }, { replace: true })}
          />
        ) : sorted.length === 0 ? (
          <p className="rounded-xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
            {canEdit
              ? "Take front, side and back photos every few weeks. Side by side, a month apart, they show what the mirror doesn't."
              : "No photo days yet."}
          </p>
        ) : (
          <ul className="grid gap-3">
            {sorted.map((session) => {
              const figures = figuresOf(session, unit)
              const picked = session.id === search.pick
              return (
                <li
                  key={session.id}
                  className={cn(
                    "cursor-pointer rounded-xl border bg-muted/40 transition-colors hover:border-foreground/30",
                    picked && "border-foreground hover:border-foreground"
                  )}
                  onClick={() => go({ pick: session.id })}
                >
                  <div className="flex items-baseline justify-between gap-2 px-4 pt-3 pb-3">
                    <h3 className="text-[15px] font-semibold">
                      <button
                        type="button"
                        aria-current={picked ? "true" : undefined}
                        className="rounded-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                        onClick={(event) => {
                          event.stopPropagation()
                          go({ pick: session.id })
                        }}
                      >
                        {formatDay(session.day)}
                      </button>
                    </h3>
                    <span className="text-[13px] text-muted-foreground">
                      {SLOTS.filter((slot) => session.photos[slot]).length} of 3 photos
                    </span>
                  </div>
                  <div className="grid max-w-lg grid-cols-3 gap-2 px-3 pb-3">
                    {SLOTS.map((slot) => (
                      <PhotoSlot
                        key={slot}
                        session={session}
                        slot={slot}
                        size="large"
                        canEdit={canEdit}
                        onChange={() => void router.invalidate()}
                      />
                    ))}
                  </div>
                  {figures.length > 0 ? (
                    <ul className="flex flex-wrap gap-2 border-t px-4 py-3" aria-label="Measurements">
                      {figures.map((figure) => (
                        <li
                          key={figure.label}
                          className="rounded-md border bg-background px-2 py-0.5 text-[13px] text-muted-foreground"
                        >
                          {figure.label} <span className="font-semibold text-foreground">{figure.value}</span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              )
            })}
          </ul>
        )}
      </PanelBody>
      {canEdit ? (
        <PhotoDayDialogFor
          open={creating}
          session={null}
          today={todayIn(preferences.timeZone)}
          unit={unit}
          onClose={() => setCreating(false)}
          onSaved={(saved) => {
            setCreating(false)
            go({ pick: saved.id, compare: undefined })
            toast.success("Photo day made. Add its photos on the right.")
          }}
        />
      ) : null}
    </>
  )
}

/** The shared window, reloading the page's data once a day is saved. */
function PhotoDayDialogFor(props: React.ComponentProps<typeof PhotoDayDialog>) {
  const router = useRouter()
  return (
    <PhotoDayDialog
      {...props}
      onSaved={(saved) => {
        void router.invalidate()
        props.onSaved(saved)
      }}
    />
  )
}

/** "up 2 cm", "down 0.5 kg", "no change". */
function changeWords(change: number, unit: string) {
  if (Math.abs(change) < 0.05) return "No change"
  return `${change > 0 ? "Up" : "Down"} ${roundCm(Math.abs(change))} ${unit}`
}

/**
 * The picked photo day on the right, as Tyler drew it on 18 Oct 2026: the date
 * large with "Photo day" under it, its three photos added one at a time, and
 * its measurements as figures two by two, each with what changed since the
 * day before, then its note.
 */
export function PhotosRight({ page, search, go }: ProgramViewProps) {
  const router = useRouter()
  const [editing, setEditing] = React.useState(false)
  const [deleting, setDeleting] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  if (page.viewData.view !== "photos") return null
  const { sessions, preferences } = page.viewData.photos
  const unit = preferences.unit
  const canEdit = page.program.mine
  const sorted = newestFirst(sessions)
  const index = sorted.findIndex((session) => session.id === search.pick)
  const session = index >= 0 ? sorted[index] : null

  if (!session) {
    return (
      <>
        <PanelHeader>
          <h2 className="text-sm font-semibold">Photo day</h2>
        </PanelHeader>
        <div className="grid flex-1 content-center justify-items-center gap-2 p-6 text-center">
          <SquareMousePointerIcon className="size-5 text-muted-foreground" aria-hidden />
          <p className="max-w-56 text-sm text-muted-foreground">
            {sorted.length ? "Click a photo day to see it here." : "Make a photo day, then add its photos here."}
          </p>
        </div>
      </>
    )
  }

  const previous = sorted[index + 1] ?? null

  async function remove() {
    if (!session) return
    setBusy(true)
    try {
      await changePhotoSession({ action: "delete", sessionId: session.id })
      setDeleting(false)
      go({ pick: undefined, compare: undefined })
      await router.invalidate()
      toast.success(`Deleted ${formatDay(session.day)} and its photos.`)
    } catch (error) {
      reportFitnessError(error)
    } finally {
      setBusy(false)
    }
  }

  const filled = SLOTS.filter((slot) => session.photos[slot]).length
  const cells: { label: string; value: number | null; unit: string; change: string | null }[] = [
    {
      label: "Bodyweight",
      value: session.bodyweightKg === null ? null : Number(formatWeightNumber(session.bodyweightKg, unit)),
      unit,
      change:
        previous && previous.bodyweightKg !== null && session.bodyweightKg !== null
          ? changeWords(fromKg(session.bodyweightKg - previous.bodyweightKg, unit), unit)
          : null,
    },
    ...PHOTO_MEASUREMENTS.map(({ key, label }) => {
      const before = previous?.[key] ?? null
      const after = session[key]
      return {
        label,
        value: after,
        unit: "cm",
        change: before !== null && after !== null ? changeWords(after - before, "cm") : null,
      }
    }),
  ]

  return (
    <>
      <PanelHeader plain>
        <div className="grid min-w-0 flex-1">
          <h2 className="truncate text-lg font-semibold tracking-tight">{formatDay(session.day)}</h2>
          <span className="text-[13px] text-muted-foreground">Photo day</span>
        </div>
        {canEdit ? (
          <>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button type="button" variant="ghost" size="icon" aria-label="Edit date and measurements" onClick={() => setEditing(true)}>
                  <SettingsIcon />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Edit date and measurements</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button type="button" variant="ghost" size="icon" aria-label="Delete this photo day" onClick={() => setDeleting(true)}>
                  <Trash2Icon />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Delete this photo day</TooltipContent>
            </Tooltip>
          </>
        ) : null}
      </PanelHeader>
      <PanelBody>
        <PanelCard storageId="fitness-right-photos" title="Photos" meta={`${filled} of 3`}>
          <div className="grid grid-cols-3 gap-2">
            {SLOTS.map((slot) => (
              <PhotoSlot
                key={slot}
                session={session}
                slot={slot}
                canEdit={canEdit}
                onChange={() => void router.invalidate()}
              />
            ))}
          </div>
        </PanelCard>
        <PanelCard storageId="fitness-right-photo-numbers" title="Measurements" flush>
          <dl className="grid grid-cols-2 [&>div]:grid [&>div]:content-start [&>div]:gap-0.5 [&>div]:border-b [&>div]:p-4 [&>div:nth-child(odd)]:border-r">
            {cells.map((cell) => (
              <div key={cell.label}>
                <dt className="text-[13px] text-muted-foreground">{cell.label}</dt>
                <dd className={cn("text-2xl font-semibold tabular-nums", cell.value === null && "text-muted-foreground")}>
                  {cell.value === null ? (
                    "\u2013"
                  ) : (
                    <>
                      {cell.value}
                      <span className="text-base font-normal text-muted-foreground"> {cell.unit}</span>
                    </>
                  )}
                </dd>
                {cell.change ? (
                  <dd className="text-xs text-muted-foreground">
                    {cell.change} since {SHORT_DAY.format(new Date(`${previous!.day}T00:00:00Z`))}
                  </dd>
                ) : null}
              </div>
            ))}
          </dl>
          <div className="grid gap-1 p-4">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Note</p>
            <p className={cn("text-sm whitespace-pre-line", !session.note && "text-muted-foreground")}>
              {session.note || "No note."}
            </p>
          </div>
        </PanelCard>
      </PanelBody>
      {canEdit ? (
        <PhotoDayDialogFor
          open={editing}
          session={session}
          today={todayIn(preferences.timeZone)}
          unit={unit}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false)
            toast.success("Photo day saved.")
          }}
        />
      ) : null}
      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title="Delete this photo day?"
        description={`${formatDay(session.day)}, its measurements and its photos are deleted for good.`}
        confirmLabel="Delete photo day"
        destructive
        loading={busy}
        onConfirm={() => void remove()}
      />
    </>
  )
}
