import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

// Compact structure-tag row used by the template and viral-archive cards.
export function StructureTagList({
  tags,
  className,
  maxVisibleTags = 4,
}: {
  tags: readonly string[]
  className?: string
  maxVisibleTags?: number
}) {
  if (!tags.length) {
    return <span className="text-xs text-muted-foreground">No tags</span>
  }
  const visibleTags = tags.slice(0, maxVisibleTags)
  const hiddenTagCount = tags.length - visibleTags.length

  return (
    <div
      className={cn(
        "flex max-h-11 min-w-0 max-w-full flex-wrap gap-1 overflow-hidden",
        className
      )}
    >
      {visibleTags.map((tag) => (
        <Badge key={tag} variant="outline" className="shrink-0 text-[10px]">
          {tag}
        </Badge>
      ))}
      {hiddenTagCount > 0 ? (
        <Badge variant="outline" className="shrink-0 text-[10px]">
          +{hiddenTagCount}
        </Badge>
      ) : null}
    </div>
  )
}
