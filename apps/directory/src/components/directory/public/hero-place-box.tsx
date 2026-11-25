import { Loader2Icon, LocateFixedIcon, MapPinIcon } from "lucide-react"

import type { useNearPlace } from "@/components/directory/public/use-near-place"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"

/**
 * The "where" box of a search band and the "Use my location" button after it,
 * shared by the Directory, Events and Deals bands.
 *
 * The two sit in one row of their own. A phone stacks the band's parts one
 * under the other, and with the button as a separate part it took a whole row
 * to itself, which made the band about 270px tall before a single result.
 * Kept together, a phone shows the button at the end of the box's line, and a
 * wide screen draws exactly what it did before.
 */
export function HeroPlaceBox({
  id,
  picker,
}: {
  id: string
  picker: ReturnType<typeof useNearPlace>
}) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <div className="relative min-w-0 flex-1">
        <MapPinIcon
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          id={id}
          value={picker.place}
          onChange={(event) => picker.setPlace(event.target.value)}
          placeholder="Town, city, or postcode"
          aria-label="Near"
          className="border-0 pl-9 text-base shadow-none focus-visible:ring-0"
        />
      </div>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={picker.useMyLocation}
            disabled={picker.locating}
            aria-label="Use my location"
          >
            {picker.locating ? (
              <Loader2Icon className="animate-spin" />
            ) : (
              <LocateFixedIcon />
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent>Use my location</TooltipContent>
      </Tooltip>
    </div>
  )
}
