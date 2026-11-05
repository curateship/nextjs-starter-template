import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import type { MediaStorageUsed } from "@/lib/api/media/admin-media"
import { formatFileSize } from "@/lib/format/format-bytes"
import {
  R2_DOLLARS_PER_GB_MONTH,
  storageCostText,
} from "@/lib/media/storage-cost"

/** Everything the bucket holds for the library, extras included. */
function storageUsedBytes(storage: MediaStorageUsed) {
  return storage.extras.reduce(
    (total, extra) => total + extra.bytes,
    storage.libraryBytes
  )
}

/**
 * "212 GB stored, about $3.18 a month", for everybody's files or the one
 * owner picked. Pointing at it lists what makes up the total.
 */
export function StorageUsedNote({ storage }: { storage: MediaStorageUsed }) {
  const total = storageUsedBytes(storage)
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className="truncate text-sm text-muted-foreground tabular-nums"
          tabIndex={0}
        >
          {formatFileSize(total)} stored, {storageCostText(total)}
        </span>
      </TooltipTrigger>
      <TooltipContent>
        <div className="grid gap-0.5">
          <span>Library files: {formatFileSize(storage.libraryBytes)}</span>
          {storage.extras.map((extra) => (
            <span key={extra.label}>
              {extra.label}: {formatFileSize(extra.bytes)}
            </span>
          ))}
          <span>
            At Cloudflare&apos;s ${R2_DOLLARS_PER_GB_MONTH} per GB a month
          </span>
        </div>
      </TooltipContent>
    </Tooltip>
  )
}
