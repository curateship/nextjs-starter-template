import { PinIcon } from "lucide-react"

import { DisabledReason } from "@/components/ui/disabled-reason"
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
  const disabled = !loaded || busy
  const button = (
    <MarketHeaderIconButton
      type="button"
      aria-label={label}
      aria-pressed={pinned}
      disabled={disabled}
      onClick={() => void store.setPin(marketKey, !pinned)}
    >
      <PinIcon className={marketHeaderIconClassName(pinned)} />
    </MarketHeaderIconButton>
  )
  // The button fades while it waits. A faded button cannot hold a tooltip, so
  // the reason hangs on DisabledReason's wrapper instead.
  if (disabled)
    return (
      <DisabledReason
        disabled
        reason={
          busy
            ? "Saving header pins. Try again once it finishes."
            : "Reading header pins. The pin works once they load."
        }
      >
        {button}
      </DisabledReason>
    )
  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}
