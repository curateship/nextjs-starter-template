import { PinIcon } from "lucide-react"

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { usePinnedMarkets } from "@/lib/trade/use-pinned-markets"

import {
  marketHeaderIconClassName,
  MarketHeaderIconButton,
} from "./market-header-icon-style"

export function PinnedMarketButton({ marketKey }: { marketKey: string }) {
  const { pins, loaded, busy, store } = usePinnedMarkets()
  const pinned = pins.includes(marketKey)
  const label = pinned ? "Unpin from header" : "Pin to header"
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <MarketHeaderIconButton
          type="button"
          aria-label={label}
          aria-pressed={pinned}
          disabled={!loaded || busy}
          onClick={() => void store.setPin(marketKey, !pinned)}
        >
          <PinIcon className={marketHeaderIconClassName(pinned)} />
        </MarketHeaderIconButton>
      </TooltipTrigger>
      <TooltipContent>
        {busy ? "Saving header pins" : !loaded ? "Reading header pins" : label}
      </TooltipContent>
    </Tooltip>
  )
}
