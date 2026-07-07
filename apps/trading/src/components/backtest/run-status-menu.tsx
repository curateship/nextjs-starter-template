import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  PinIcon,
  PinOffIcon,
} from "lucide-react"

import {
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"

export type RunStatusPatch = {
  reviewStatus?: "review" | "archived"
  pinned?: boolean
}

/**
 * The shared Pin / Unpin / Archive / Review actions used by both the dashboard's
 * bulk status menu and the Edit Run modal's status control. Render inside a
 * `DropdownMenuContent`.
 */
export function RunStatusMenuItems({
  onApply,
}: {
  onApply: (patch: RunStatusPatch) => void
}) {
  return (
    <>
      <DropdownMenuItem onClick={() => onApply({ pinned: true })}>
        <PinIcon className="size-4" />
        Pin
      </DropdownMenuItem>
      <DropdownMenuItem onClick={() => onApply({ pinned: false })}>
        <PinOffIcon className="size-4" />
        Unpin
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem onClick={() => onApply({ reviewStatus: "archived" })}>
        <ArchiveIcon className="size-4" />
        Archive
      </DropdownMenuItem>
      <DropdownMenuItem onClick={() => onApply({ reviewStatus: "review" })}>
        <ArchiveRestoreIcon className="size-4" />
        Move to review
      </DropdownMenuItem>
    </>
  )
}
