import { FileQuestionIcon } from "lucide-react"

import { MediaThumbnail } from "@/components/media/media-thumbnail"
import { type MediaOrphan } from "@/lib/api/media/admin-media"
import { cn } from "@/lib/utils"

/**
 * An orphan's picture, for the Media library's rows, tiles and right panel.
 * A stray file is still in storage, so it previews like any other upload. A
 * record whose file is gone has nothing to show, and says so.
 */
export function OrphanPreview({
  row,
  className,
  compact = false,
}: {
  row: MediaOrphan
  className?: string
  compact?: boolean
}) {
  return (
    <div className={cn("relative grid place-items-center overflow-hidden", className)}>
      {!row.url ? (
        <div className="grid place-items-center gap-1 p-2 text-center text-muted-foreground">
          <FileQuestionIcon className="size-6" />
          {compact ? null : <span className="text-[10px] leading-tight">No file</span>}
        </div>
      ) : row.fileType === "video" || row.fileType === "image" ? (
        <MediaThumbnail url={row.url} fileType={row.fileType} alt={row.name} className="h-full w-full" compact={compact} />
      ) : (
        <div className="grid place-items-center gap-1 p-2 text-center text-muted-foreground">
          <FileQuestionIcon className="size-6" />
          {compact ? null : <span className="text-[10px] leading-tight">No preview</span>}
        </div>
      )}
    </div>
  )
}
