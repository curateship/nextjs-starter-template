import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

/**
 * Says the made-up video is made up, in words rather than a shade, so it reads
 * the same in greyscale and to a screen reader. Drawn exactly as the shell's
 * `SampleBadge` in `src/components/shared/feed-card.tsx`, which the shell does
 * not export, less its browser `title` hover.
 */
export function SampleBadge({ className }: { className?: string }) {
  return (
    <Badge variant="outline" className={cn("shrink-0 border-dashed font-normal", className)}>
      Sample
    </Badge>
  )
}
