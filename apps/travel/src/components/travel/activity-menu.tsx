import * as React from "react"
import { CopyIcon, Trash2Icon } from "lucide-react"

import { canRate, ActivityRatingFields } from "@/components/travel/activity-rating-fields"
import { ActivityPictureFields } from "@/components/travel/activity-picture-fields"
import { ActivityPlaceFields } from "@/components/travel/activity-place-fields"
import { useBoardActions } from "@/components/travel/board-actions"
import { FoldingMenu, MenuAction, MenuLine, MenuSection, useOpenSections } from "@/components/shared/folding-menu"
import { dayLabel } from "@/components/travel/new-activity"
import { SavingInput } from "@/components/travel/saving-fields"
import { typeOf, useTrip } from "@/components/travel/trip-context"
import { ActivityTypeSelect } from "@/components/travel/type-icon"
import { useSaveActivity } from "@/components/travel/use-save-activity"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { Activity } from "@/lib/api/travel/trips"
import { formatTime } from "@/lib/travel/board"
import { formatMoney, parseMoney } from "@/lib/travel/rules"
import type { UpdateActivityInput } from "@/lib/travel/schemas"
import { showErrorToast } from "@/lib/toast/error-toast"

const IDEAS = "ideas"

type Section = "name" | "when" | "place" | "cost" | "picture" | "rating"

/**
 * The open activity's ⋮ menu (Tyler, 2 Nov 2026: "All of these are
 * collapsible cards in a 3 dot dropdown ... and move delete there too"):
 * one folding row per part of the activity, each with what it holds now on
 * the right. Every field saves itself. Duplicate and Delete activity end it.
 * Its look is Travel's one ⋮ menu, `FoldingMenu`, shared with the trip's.
 */
export function ActivityMenu({ activity }: { activity: Activity }) {
  const { page, typesById } = useTrip()
  const { trip } = page
  const [open, setOpen] = React.useState(false)
  const [shown, toggle] = useOpenSections<Section>()
  const actions = useBoardActions()
  const type = typeOf(activity, typesById)

  const when =
    activity.day === null
      ? "Ideas"
      : [`Day ${activity.day}`, activity.startTime ? formatTime(activity.startTime) : null].filter(Boolean).join(" · ")

  return (
    <FoldingMenu label="More for this activity" busy={actions.busy} open={open} onOpenChange={setOpen}>
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
      <MenuLine />
      <MenuAction
        icon={<CopyIcon className="size-4" />}
        disabled={actions.busy}
        onClick={() => {
          setOpen(false)
          void actions.duplicate(activity)
        }}
      >
        Duplicate activity
      </MenuAction>
      <MenuAction
        icon={<Trash2Icon className="size-4" />}
        destructive
        disabled={actions.busy}
        onClick={() => {
          setOpen(false)
          void actions.remove([activity.id])
        }}
      >
        Delete activity
      </MenuAction>
    </FoldingMenu>
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
