import { PinIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { usePinnedMarkets } from "@/lib/trade/use-pinned-markets"
import { WARNING } from "@/lib/trade/money-tone"
import { cn } from "@/lib/utils"

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
          className="bg-muted/60 text-amber-600 hover:text-amber-700"
          onClick={() => void store.setPin(marketKey, !pinned)}
        >
          <PinIcon
            className={cn("size-4", pinned && `fill-amber-500 ${WARNING}`)}
          />
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        {busy ? "Saving header pins" : !loaded ? "Reading header pins" : label}
      </TooltipContent>
    </Tooltip>
  )
}
