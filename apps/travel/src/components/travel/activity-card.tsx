import { BedDoubleIcon, ClockIcon, MoonIcon, StarIcon, SunIcon, SunriseIcon, SunsetIcon, type LucideIcon } from "lucide-react"

import { ActivityTypeIcon } from "@/components/travel/type-icon"
import type { Activity } from "@/lib/api/travel/trips"
import type { ActivityType } from "@/lib/travel/activity-types"
import { formatTimeRange } from "@/lib/travel/board"
import { DAY_PART_LABEL, type DayPart } from "@/lib/travel/rules"
import { formatMoney } from "@/lib/travel/rules"
import { cn } from "@/lib/utils"

/** The icon beside a part of the day on a card with no start time (Travel features part 2). */
const DAY_PART_ICON: Record<DayPart, LucideIcon> = {
  morning: SunriseIcon,
  afternoon: SunIcon,
  evening: SunsetIcon,
  night: MoonIcon,
}

export const CARD_CLASS = "grid w-full gap-1.5 rounded-lg border bg-card p-2.5 text-left text-sm shadow-xs"

/**
 * What a card shows (Tyler, 2 Nov 2026: "Everything"): the photo on top, then
 * the type icon and title, the start and end time, the nights of a stay, the
 * cost and the rating. A stay is one card on its check-in day (Tyler, 2 Nov
 * 2026: "Move to hotel stays into its individual cards"). Compact cards (task part 13) keep the icon, time and title on
 * one line and leave the rest off.
 */
export function ActivityCardContent({
  activity,
  type,
  currency,
  compact = false,
  roomForMenu = false,
  warning,
}: {
  activity: Activity
  type: ActivityType | null
  currency: string
  compact?: boolean
  roomForMenu?: boolean
  /** Such as "Closed at this time", from the opening hours (task part 21). */
  warning?: string | null
}) {
  const time = formatTimeRange(activity.startTime, activity.durationMinutes)
  // A card with no start time may carry a part of the day instead.
  const part = activity.startTime ? null : activity.dayPart
  const PartIcon = part ? DAY_PART_ICON[part] : null
  if (compact) {
    return (
      <span className={cn("flex min-w-0 items-center gap-2", roomForMenu && "pr-6", activity.done && "opacity-60")}>
        <ActivityTypeIcon type={type} />
        {activity.startTime ? (
          <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{time?.split(" to ")[0]}</span>
        ) : part ? (
          <span className="shrink-0 text-xs text-muted-foreground">{DAY_PART_LABEL[part]}</span>
        ) : null}
        <span className={cn("truncate font-medium", activity.done && "line-through")}>{activity.title}</span>
      </span>
    )
  }
  const nights = activity.nights && activity.nights > 1 ? activity.nights : null
  const marks = activity.costCents !== null || activity.rating
  return (
    <span className={cn("grid gap-1.5", activity.done && "opacity-60")}>
      {activity.photoUrl ? (
        <img
          src={activity.photoUrl}
          alt=""
          loading="lazy"
          className="-mx-2.5 -mt-2.5 mb-0.5 aspect-[16/9] w-[calc(100%+1.25rem)] max-w-none rounded-t-lg object-cover"
        />
      ) : null}
      <span className={cn("flex min-w-0 items-start gap-2", roomForMenu && "pr-6")}>
        <ActivityTypeIcon type={type} className="mt-0.5" />
        <span className={cn("min-w-0 font-medium break-words", activity.done && "line-through")}>
          {activity.title}
        </span>
      </span>
      {time || part || warning || nights ? (
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          {time ? (
            <span className="flex items-center gap-1 tabular-nums">
              <ClockIcon className="size-3" aria-hidden />
              {time}
            </span>
          ) : null}
          {part && PartIcon ? (
            <span className="flex items-center gap-1">
              <PartIcon className="size-3" aria-hidden />
              {DAY_PART_LABEL[part]}
            </span>
          ) : null}
          {nights ? (
            <span className="flex items-center gap-1">
              <BedDoubleIcon className="size-3" aria-hidden />
              {nights} nights
            </span>
          ) : null}
          {warning ? <span className="text-destructive">{warning}</span> : null}
        </span>
      ) : null}
      {marks ? (
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
          {activity.costCents !== null ? (
            <span className="text-muted-foreground tabular-nums">{formatMoney(activity.costCents, currency)}</span>
          ) : null}
          {activity.rating ? (
            <span className="flex items-center gap-0.5 text-muted-foreground" aria-label={`Rated ${activity.rating} out of 5`}>
              {Array.from({ length: activity.rating }, (_, index) => (
                <StarIcon key={index} className="size-3 fill-current" aria-hidden />
              ))}
            </span>
          ) : null}
        </span>
      ) : null}
    </span>
  )
}
