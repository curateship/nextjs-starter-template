import { Badge } from "@/components/ui/badge"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { formatCount } from "@/lib/viral/creators"
import { outlierBadge, type ViralOutlier } from "@/lib/viral/viral"

/**
 * "40x usual": the video's views against the channel's typical video
 * (`workspace/docs/sorts-and-score.md`). Under 2x it draws nothing, so the
 * badge means something; the hover names the typical video's views.
 */
export function OutlierBadge({ outlier }: { outlier: ViralOutlier }) {
  const label = outlierBadge(outlier)
  if (!label) return <span className="text-muted-foreground">-</span>
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant="secondary" className="tabular-nums">
          {label}
        </Badge>
      </TooltipTrigger>
      <TooltipContent>
        {outlier.typicalViews === null
          ? "Against the channel's typical video"
          : `Typical video: ${formatCount(outlier.typicalViews)} views`}
      </TooltipContent>
    </Tooltip>
  )
}
