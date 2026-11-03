import * as React from "react"
import { ChevronRightIcon, CopyIcon, EllipsisVerticalIcon, Loader2Icon, Trash2Icon } from "lucide-react"

import { canRate, ActivityRatingFields } from "@/components/travel/activity-rating-fields"
import { ActivityPictureFields } from "@/components/travel/activity-picture-fields"
import { ActivityPlaceFields } from "@/components/travel/activity-place-fields"
import { useBoardActions } from "@/components/travel/board-actions"
import { dayLabel } from "@/components/travel/new-activity"
import { SavingInput } from "@/components/travel/saving-fields"
import { typeOf, useTrip } from "@/components/travel/trip-context"
import { ActivityTypeSelect } from "@/components/travel/type-icon"
import { useSaveActivity } from "@/components/travel/use-save-activity"
import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { Activity } from "@/lib/api/travel/trips"
import { formatTime } from "@/lib/travel/board"
import { formatMoney, parseMoney } from "@/lib/travel/rules"
import type { UpdateActivityInput } from "@/lib/travel/schemas"
import { showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"

const IDEAS = "ideas"

type Section = "name" | "when" | "place" | "cost" | "picture" | "rating"

/**
 * The open activity's ⋮ menu (Tyler, 2 Nov 2026: "All of these are
 * collapsible cards in a 3 dot dropdown ... and move delete there too"),
 * drawn like the ⋮ on a task in Project: one row per part of the activity,
 * each with what it holds now on the right, that folds open to change it.
 * Every field saves itself. Duplicate and Delete activity end it.
 */
export function ActivityMenu({ activity }: { activity: Activity }) {
  const { page, typesById } = useTrip()
  const { trip } = page
  const [open, setOpen] = React.useState(false)
  const [shown, setShown] = React.useState<ReadonlySet<Section>>(new Set())
  const actions = useBoardActions()
  const type = typeOf(activity, typesById)

  const toggle = (section: Section) =>
    setShown((was) => {
      const next = new Set(was)
      if (next.has(section)) next.delete(section)
      else next.add(section)
      return next
    })

  const when =
    activity.day === null
      ? "Ideas"
      : [`Day ${activity.day}`, activity.startTime ? formatTime(activity.startTime) : null].filter(Boolean).join(" · ")

  return (
    <Popover open={open} onOpenChange={setOpen} modal={false}>
      <PopoverTrigger asChild>
        <Button type="button" variant="ghost" size="icon" aria-label="More for this activity">
          {actions.busy ? <Loader2Icon className="size-4 animate-spin" /> : <EllipsisVerticalIcon className="size-4" />}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-[363px] max-w-[calc(100vw-1rem)] gap-0 p-0 text-[13px]"
        // The media library and Unsplash open their own windows from in here; using them isn't leaving the menu.
        onInteractOutside={(event) => {
          const target = event.target
          if (target instanceof Element && target.closest("[role=dialog], [role=alertdialog], [data-slot=select-content]")) {
            event.preventDefault()
          }
        }}
      >
        {/* The viewport holds the height, so a tall menu scrolls inside the screen rather than running off it. */}
        <ScrollArea viewportClassName="max-h-[min(75vh,40rem)]">
          <div className="grid">
            <MenuSection label="Name and type" value={type?.name ?? "No type"} open={shown.has("name")} onToggle={() => toggle("name")}>
              <NameFields activity={activity} />
            </MenuSection>
            <MenuSection label="When" value={when} open={shown.has("when")} onToggle={() => toggle("when")}>
              <WhenFields activity={activity} />
            </MenuSection>
            <MenuSection
              label="Place"
              value={activity.place?.name || activity.place?.address || "Not set"}
              open={shown.has("place")}
              onToggle={() => toggle("place")}
            >
              <ActivityPlaceFields activity={activity} />
            </MenuSection>
            <MenuSection
              label="Cost"
              value={activity.costCents === null ? "None" : formatMoney(activity.costCents, trip.currency)}
              open={shown.has("cost")}
              onToggle={() => toggle("cost")}
            >
              <CostField activity={activity} />
            </MenuSection>
            <MenuSection
              label="Picture"
              value={activity.photoUrl ? (activity.photoCredit ? "Unsplash" : "Uploaded") : "None"}
              open={shown.has("picture")}
              onToggle={() => toggle("picture")}
            >
              <ActivityPictureFields activity={activity} />
            </MenuSection>
            {canRate(activity, trip) ? (
              <MenuSection
                label="How was it"
                value={activity.rating ? `${activity.rating} of 5` : "Not rated"}
                open={shown.has("rating")}
                onToggle={() => toggle("rating")}
              >
                <ActivityRatingFields activity={activity} />
              </MenuSection>
            ) : null}
          </div>
          <div className="grid gap-0.5 p-1.5">
            <Button
              type="button"
              variant="ghost"
              className="justify-start text-[13px] font-normal"
              disabled={actions.busy}
              onClick={() => {
                setOpen(false)
                void actions.duplicate(activity)
              }}
            >
              <CopyIcon className="size-4" />
              Duplicate activity
            </Button>
          </div>
          <div className="border-t p-1.5">
            <Button
              type="button"
              variant="ghost"
              className="w-full justify-start text-[13px] font-normal text-destructive hover:text-destructive"
              disabled={actions.busy}
              onClick={() => {
                setOpen(false)
                void actions.remove([activity.id])
              }}
            >
              <Trash2Icon className="size-4" />
              Delete activity
            </Button>
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  )
}

/** One folding row: its name on the left, what it holds now on the right, the fields under it when open. */
function MenuSection({
  label,
  value,
  open,
  onToggle,
  children,
}: {
  label: string
  value: string
  open: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  return (
    <Collapsible open={open} onOpenChange={onToggle} className="border-b">
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="flex w-full min-w-0 items-center gap-2 px-4 py-2.5 text-left hover:bg-accent/50 focus-visible:bg-accent/50 focus-visible:outline-none"
        >
          <span className="shrink-0 font-medium">{label}</span>
          <span className="ml-auto min-w-0 truncate text-muted-foreground">{value}</span>
          <ChevronRightIcon
            className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")}
            aria-hidden
          />
        </button>
      </CollapsibleTrigger>
      {/* The same 16px on every side (task "Misc": "The paddings here must be all equal"). */}
      <CollapsibleContent className="p-4 text-sm">{children}</CollapsibleContent>
    </Collapsible>
  )
}

function NameFields({ activity }: { activity: Activity }) {
  const { page } = useTrip()
  const [save] = useSaveActivity(activity.id)
  const idBase = `activity-${activity.id}`
  return (
    <div className="grid gap-3">
      <div className="grid gap-2">
        <Label htmlFor={`${idBase}-title`}>Name</Label>
        <SavingInput id={`${idBase}-title`} value={activity.title} maxLength={200} onSave={(title) => save({ title })} />
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`${idBase}-type`}>Type</Label>
        <ActivityTypeSelect
          id={`${idBase}-type`}
          types={page.types}
          value={activity.typeId}
          onChange={(typeId) => void save({ typeId })}
        />
      </div>
    </div>
  )
}

/** The day, start time, length and, for a stay, its nights. Moving to another day can be undone. */
function WhenFields({ activity }: { activity: Activity }) {
  const { page, typesById } = useTrip()
  const { trip } = page
  const [save] = useSaveActivity(activity.id)
  const actions = useBoardActions()
  const idBase = `activity-${activity.id}`
  const type = typeOf(activity, typesById)
  return (
    <div className="grid gap-3">
      <div className="grid gap-2">
        <Label htmlFor={`${idBase}-day`}>Day</Label>
        <Select
          value={activity.day === null ? IDEAS : String(activity.day)}
          onValueChange={(value) => void actions.moveTo(activity, value === IDEAS ? null : Number(value))}
        >
          <SelectTrigger id={`${idBase}-day`} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={IDEAS}>Ideas</SelectItem>
            {Array.from({ length: trip.days }, (_, index) => (
              <SelectItem key={index} value={String(index + 1)}>
                {dayLabel(index + 1, trip.startDate)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <TimeFields activity={activity} save={save} />
      {type?.builtin === "hotel" || activity.nights ? (
        <div className="grid gap-2">
          <Label htmlFor={`${idBase}-nights`}>Nights</Label>
          <SavingInput
            id={`${idBase}-nights`}
            inputMode="numeric"
            className="w-20"
            value={activity.nights === null ? "" : String(activity.nights)}
            onSave={(next) => {
              const nights = next.trim() === "" ? null : Number(next)
              if (nights !== null && (!Number.isInteger(nights) || nights < 1 || nights > 60)) {
                showErrorToast("Nights is a whole number from 1 to 60.")
                return Promise.resolve(false)
              }
              return save({ nights })
            }}
          />
        </div>
      ) : null}
    </div>
  )
}

/** The cost in the trip's one currency, which the trip's Money card adds up. */
function CostField({ activity }: { activity: Activity }) {
  const { page } = useTrip()
  const currency = page.trip.currency
  const [save] = useSaveActivity(activity.id)
  const id = `activity-${activity.id}-cost`
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>Cost ({currency})</Label>
      <SavingInput
        id={id}
        inputMode="decimal"
        value={activity.costCents === null ? "" : formatMoney(activity.costCents, currency)}
        placeholder="0"
        onSave={(next) => {
          const text = next.replace(/[^\d.,]/g, "")
          if (!text) return save({ costCents: null })
          const cents = parseMoney(text)
          if (cents === null) {
            showErrorToast("Type the cost as a number, such as 1200 or 12.50.")
            return Promise.resolve(false)
          }
          return save({ costCents: cents })
        }}
      />
    </div>
  )
}

/** Start time and length (task part 4), and nights for a stay (task part 9). */
function TimeFields({
  activity,
  save,
}: {
  activity: Activity
  save: (patch: Omit<UpdateActivityInput, "activityId">) => Promise<boolean>
}) {
  const idBase = `activity-${activity.id}`
  const [time, setTime] = React.useState(activity.startTime ?? "")
  const [savedTime, setSavedTime] = React.useState(activity.startTime)
  if (activity.startTime !== savedTime) {
    setSavedTime(activity.startTime)
    setTime(activity.startTime ?? "")
  }
  const hours = activity.durationMinutes === null ? "" : String(Math.floor(activity.durationMinutes / 60))
  const minutes = activity.durationMinutes === null ? "" : String(activity.durationMinutes % 60)

  function saveLength(nextHours: string, nextMinutes: string) {
    const total = (Number(nextHours) || 0) * 60 + (Number(nextMinutes) || 0)
    const durationMinutes = nextHours === "" && nextMinutes === "" ? null : total || null
    if (durationMinutes === activity.durationMinutes) return
    void save({ durationMinutes })
  }

  return (
    <>
      <div className="grid gap-2">
        <Label htmlFor={`${idBase}-time`}>Start time</Label>
        <Input
          id={`${idBase}-time`}
          type="time"
          value={time}
          disabled={activity.day === null}
          onChange={(event) => setTime(event.target.value)}
          onBlur={() => {
            const next = time || null
            if (next !== activity.startTime) void save({ startTime: next })
          }}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`${idBase}-hours`}>Length</Label>
        <div className="flex items-center gap-2">
          <SavingInput
            id={`${idBase}-hours`}
            aria-label="Hours"
            inputMode="numeric"
            className="w-16"
            value={hours}
            onSave={async (next) => {
              saveLength(next.replace(/\D/g, ""), minutes)
              return true
            }}
          />
          <span className="text-sm text-muted-foreground">h</span>
          <SavingInput
            id={`${idBase}-minutes`}
            aria-label="Minutes"
            inputMode="numeric"
            className="w-16"
            value={minutes}
            onSave={async (next) => {
              saveLength(hours, next.replace(/\D/g, ""))
              return true
            }}
          />
          <span className="text-sm text-muted-foreground">m</span>
        </div>
      </div>
    </>
  )
}
