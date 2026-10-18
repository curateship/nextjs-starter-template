import * as React from "react"
import { useRouter } from "@tanstack/react-router"
import { ColumnsIcon, LockIcon, PlusIcon, SettingsIcon, SquareMousePointerIcon, Trash2Icon } from "lucide-react"
import { toast } from "sonner"

import { PanelCard } from "@/components/fitness/panel-card"
import { CompareView } from "@/components/fitness/photos/compare-view"
import { describeChanges, PHOTO_MEASUREMENTS, SLOT_LABELS } from "@/components/fitness/photos/measurements"
import { PhotoDayDialog } from "@/components/fitness/photos/photo-day-dialog"
import { PhotoSlot } from "@/components/fitness/photos/photo-slot"
import { PrivatePhoto } from "@/components/fitness/photos/private-photo"
import { PanelBody, PanelHeader, PanelToolbar } from "@/components/fitness/dashboard/panel-parts"
import type { ProgramViewProps } from "@/components/fitness/dashboard/view-props"
import { DashboardToolbarButton } from "@/components/shared/dashboard-toolbar"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { FieldLabel } from "@/components/ui/field-label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { changePhotoSession, type PhotoSession, type PhotoSlot as Slot } from "@/lib/api/fitness/photos"
import { formatDay, todayIn } from "@/lib/fitness/dates"
import { reportFitnessError } from "@/lib/fitness/report-error"
import { formatWeight, type WeightUnit } from "@/lib/fitness/weights"
import { showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"

const SLOTS: Slot[] = ["front", "side", "back"]

function newestFirst(sessions: readonly PhotoSession[]) {
  return [...sessions].sort((a, b) => b.day.localeCompare(a.day))
}

function figuresOf(session: PhotoSession, unit: WeightUnit) {
  return [
    session.bodyweightKg !== null ? `Bodyweight ${formatWeight(session.bodyweightKg, unit)}` : null,
    ...PHOTO_MEASUREMENTS.map(({ key, label }) => (session[key] !== null ? `${label} ${session[key]} cm` : null)),
  ].filter((entry): entry is string => entry !== null)
}

/**
 * Before and after in the middle panel: every photo day, newest first, or
 * two of them compared while `?compare=` is set. Clicking a day opens it on
 * the right, where its photos are added. Only the owner sees any of it, and
 * a coach they switched photos on for.
 */
export function PhotosMiddle({ page, search, go }: ProgramViewProps) {
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
      <PanelToolbar>
        <DashboardToolbarButton
          type="button"
          variant="outline"
          onClick={pair ? () => go({ compare: undefined }) : startCompare}
        >
          <ColumnsIcon />
          {pair ? "Close compare" : "Compare"}
        </DashboardToolbarButton>
        {canEdit ? (
          <DashboardToolbarButton type="button" onClick={() => setCreating(true)}>
            <PlusIcon />
            New photo day
          </DashboardToolbarButton>
        ) : null}
      </PanelToolbar>
      <PanelBody padded={false}>
        <p className="flex items-center gap-2 border-b px-3 py-2 text-xs text-muted-foreground">
          <LockIcon className="size-3.5 shrink-0" aria-hidden />
          {canEdit
            ? "Only you can see these photos. A coach sees them only if you switch that on for them."
            : "Your client switched photos on for you. Nobody else can see them."}
        </p>
        {pair ? (
          <CompareView
            sessions={sorted}
            firstId={pair[0]}
            secondId={pair[1]}
            unit={unit}
            onPick={(first, second) => go({ compare: `${first},${second}` }, { replace: true })}
          />
        ) : sorted.length === 0 ? (
          <p className="p-3 text-sm text-muted-foreground">
            {canEdit
              ? "Take front, side and back photos every few weeks. Side by side, a month apart, they show what the mirror doesn't."
              : "No photo days yet."}
          </p>
        ) : (
          <ul className="divide-y">
            {sorted.map((session) => {
              const figures = figuresOf(session, unit)
              const picked = session.id === search.pick
              return (
                <li key={session.id}>
                  <button
                    type="button"
                    aria-current={picked ? "true" : undefined}
                    className={cn(
                      "grid w-full gap-2 p-3 text-left hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none",
                      picked && "bg-muted/60"
                    )}
                    onClick={() => go({ pick: session.id })}
                  >
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="text-sm font-medium">{formatDay(session.day)}</span>
                      <span className="text-xs text-muted-foreground">
                        {SLOTS.filter((slot) => session.photos[slot]).length} of 3 photos
                      </span>
                    </span>
                    <span className="grid max-w-md grid-cols-3 gap-2">
                      {SLOTS.map((slot) => (
                        <span key={slot} className="aspect-[3/4] overflow-hidden rounded-md border bg-muted/50">
                          {session.photos[slot] ? (
                            <PrivatePhoto
                              src={session.photos[slot]!}
                              alt={`${SLOT_LABELS[slot]}, ${formatDay(session.day)}`}
                              className="size-full object-cover"
                            />
                          ) : (
                            <span className="flex size-full items-center justify-center text-[11px] text-muted-foreground">
                              {SLOT_LABELS[slot]}
                            </span>
                          )}
                        </span>
                      ))}
                    </span>
                    {figures.length > 0 ? (
                      <span className="text-xs text-muted-foreground">{figures.join(" · ")}</span>
                    ) : null}
                  </button>
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

/**
 * The picked photo day on the right: its three photos, added one at a time,
 * its numbers and what changed since the day before, and a way to compare it
 * with another day.
 */
export function PhotosRight({ page, search, go }: ProgramViewProps) {
  const router = useRouter()
  const [editing, setEditing] = React.useState(false)
  const [deleting, setDeleting] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const compareId = React.useId()
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
  const figures = figuresOf(session, unit)
  const changes = previous ? describeChanges(previous, session, unit) : []
  const others = sorted.filter((entry) => entry.id !== session.id)

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

  return (
    <>
      <PanelHeader>
        <h2 className="min-w-0 flex-1 truncate text-sm font-semibold">{formatDay(session.day)}</h2>
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
        <PanelCard storageId="fitness-right-photos" title="Photos">
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
        <PanelCard storageId="fitness-right-photo-numbers" title="Measurements">
          {figures.length ? (
            <ul className="grid gap-1 text-[13px]">
              {figures.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No bodyweight or measurements on this day.</p>
          )}
          {changes.length ? (
            <div className="grid gap-1">
              <p className="text-xs font-medium text-muted-foreground">Since {formatDay(previous!.day)}</p>
              <ul className="grid gap-1 text-[13px]">
                {changes.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {session.note ? <p className="text-sm whitespace-pre-line text-muted-foreground">{session.note}</p> : null}
        </PanelCard>
        {others.length ? (
          <PanelCard storageId="fitness-right-photo-compare" title="Compare">
            <div className="grid gap-2">
              <FieldLabel htmlFor={compareId}>Compare with</FieldLabel>
              <Select value="" onValueChange={(other) => go({ compare: `${other},${session.id}` })}>
                <SelectTrigger id={compareId}>
                  <SelectValue placeholder="Pick another day" />
                </SelectTrigger>
                <SelectContent>
                  {others.map((entry) => (
                    <SelectItem key={entry.id} value={entry.id}>
                      {formatDay(entry.day)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </PanelCard>
        ) : null}
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
