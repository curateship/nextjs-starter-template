import { TradeBadge } from "@/components/trade/trade-badge"
import { formatSize } from "@/lib/trade/format"
import type { TradePosition } from "@/lib/trade/paper"

/**
 * "Long 5×" — direction and leverage, the two things that set the risk. A
 * coin that is simply owned has neither, so its badge says how many are
 * held instead: "Owned 1,125.37".
 */
export function PositionSideBadge({ position }: { position: TradePosition }) {
  if (position.owned) {
    return <TradeBadge tone="made">Owned {formatSize(position.szi)}</TradeBadge>
  }
  const long = position.szi > 0
  return (
    <TradeBadge tone={long ? "made" : "lost"}>
      {long ? "Long" : "Short"} {position.leverage}×
    </TradeBadge>
  )
}
