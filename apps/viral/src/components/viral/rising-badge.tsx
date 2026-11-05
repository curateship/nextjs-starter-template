import { TrendingUpIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { formatCount } from "@/lib/viral/creators"
import { isRising, type ViralGrowth } from "@/lib/viral/rising"

/**
 * Rising fast (`workspace/docs/sorts-and-score.md`): a video whose views at
 * least doubled since the day before. Below that it shows how many views it
 * gained, muted, or a dash before there are two daily figures.
 */
export function RisingBadge({ growth }: { growth: ViralGrowth }) {
  if (growth.gained === null) return <span className="text-muted-foreground">-</span>
  const gained = `${growth.gained >= 0 ? "+" : ""}${formatCount(growth.gained)}`
  if (!isRising(growth)) return <span className="text-muted-foreground tabular-nums">{gained}</span>
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge className="tabular-nums">
          <TrendingUpIcon />
          Rising
        </Badge>
      </TooltipTrigger>
      <TooltipContent>
        {`${gained} views since yesterday, ${Math.round((growth.times ?? 0) * 10) / 10}x as many`}
      </TooltipContent>
    </Tooltip>
  )
}
