import { PinIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { usePinnedMarkets } from "@/lib/trade/use-pinned-markets"

export function PinnedMarketButton({ marketKey }: { marketKey: string }) {
  const { pins, loaded, busy, store } = usePinnedMarkets()
  const pinned = pins.includes(marketKey)
  const label = pinned ? "Unpin from header" : "Pin to header"
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label={label}
          aria-pressed={pinned}
          disabled={!loaded || busy}
          onClick={() => void store.setPin(marketKey, !pinned)}
        >
          <PinIcon className="size-4" fill={pinned ? "currentColor" : "none"} />
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        {busy ? "Saving header pins" : !loaded ? "Reading header pins" : label}
      </TooltipContent>
    </Tooltip>
  )
}
