import * as React from "react"
import { CheckIcon, ChevronDownIcon, ClockPlusIcon } from "lucide-react"

import { keepSpeed, readSpeed, SPEEDS } from "@/components/note-library/use-player-place"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

/**
 * What sits under a saved video or sound (Tyler's task 02, parts 3 and 5):
 * the button that puts the player's time into the note, and the speed. Where
 * the player was stopped is `use-player-place.ts`.
 */

/** The row under the player: Add time, then the speed. */
export function PlayerTools({
  playerRef,
  onAddTime,
}: {
  playerRef: React.RefObject<HTMLMediaElement | null>
  /** Absent on a note that cannot change, such as one in Trash. */
  onAddTime?: () => void
}) {
  const [speed, setSpeed] = React.useState(readSpeed)
  // A speed picked in the player's own menu shows here too.
  React.useEffect(() => {
    const player = playerRef.current
    if (!player) return
    const onRate = () => setSpeed(player.playbackRate)
    player.addEventListener("ratechange", onRate)
    return () => player.removeEventListener("ratechange", onRate)
  }, [playerRef])
  return (
    <div className="flex items-center justify-between gap-2">
      {onAddTime ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button type="button" variant="ghost" size="sm" onClick={onAddTime}>
              <ClockPlusIcon />
              Add time to note
            </Button>
          </TooltipTrigger>
          <TooltipContent>Puts the video's time into your note. Clicking it later plays from there.</TooltipContent>
        </Tooltip>
      ) : (
        <span />
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="ghost" size="sm" aria-label={`Playback speed, ${speed}x`}>
            {speed}x
            <ChevronDownIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {SPEEDS.map((each) => (
            <DropdownMenuItem
              key={each}
              onSelect={() => {
                setSpeed(each)
                keepSpeed(each)
                if (playerRef.current) playerRef.current.playbackRate = each
              }}
            >
              {each}x
              {each === speed ? <CheckIcon className="ml-auto" /> : null}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
