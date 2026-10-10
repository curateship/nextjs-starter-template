import * as React from "react"
import { SettingsIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  START_DELAYS,
  START_DELAY_LABELS,
  type StartDelay,
} from "@/lib/pomodoro/room-countdown"

/** The people limits a host can pick; "none" leaves only the site's own. */
const PEOPLE_LIMITS = [2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 30, 40, 50] as const
const NO_LIMIT = "none"

/**
 * The cog on the room card, for the host: the countdown before a focus
 * starts and how many people the room holds (Tyler, 10 Oct 2026: "Add a cog
 * icon here to open a dropdown ... move countdown option and room users
 * limit here"). Each saves the moment it is picked.
 */
export function RoomSettingsCog({
  startDelaySeconds,
  maxPeople,
  disabled,
  onDelay,
  onPeopleLimit,
}: {
  startDelaySeconds: number
  maxPeople: number | null
  disabled: boolean
  onDelay: (seconds: StartDelay) => void
  onPeopleLimit: (maxPeople: number | null) => void
}) {
  const delayId = React.useId()
  const limitId = React.useId()
  const limits =
    maxPeople !== null && !PEOPLE_LIMITS.includes(maxPeople as (typeof PEOPLE_LIMITS)[number])
      ? [...PEOPLE_LIMITS, maxPeople].sort((a, b) => a - b)
      : PEOPLE_LIMITS
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="icon-lg"
          className="rounded-full"
          aria-label="Room settings"
          title="Room settings"
        >
          <SettingsIcon aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="grid w-72 gap-4 p-4">
        <strong className="text-sm font-semibold">Room settings</strong>
        <div className="grid gap-2">
          <Label htmlFor={delayId}>Countdown before a focus</Label>
          <Select
            value={String(startDelaySeconds)}
            disabled={disabled}
            onValueChange={(value) => onDelay(Number(value) as StartDelay)}
          >
            <SelectTrigger id={delayId} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {START_DELAYS.map((seconds) => (
                <SelectItem key={seconds} value={String(seconds)}>
                  {START_DELAY_LABELS[seconds]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-2">
          <Label htmlFor={limitId}>People in the room</Label>
          <Select
            value={maxPeople === null ? NO_LIMIT : String(maxPeople)}
            disabled={disabled}
            onValueChange={(value) => onPeopleLimit(value === NO_LIMIT ? null : Number(value))}
          >
            <SelectTrigger id={limitId} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_LIMIT}>No limit</SelectItem>
              {limits.map((limit) => (
                <SelectItem key={limit} value={String(limit)}>
                  Up to {limit} people
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            You always count, and lowering it takes nobody out.
          </p>
        </div>
      </PopoverContent>
    </Popover>
  )
}
