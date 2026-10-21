import * as React from "react"
import { ChevronDownIcon } from "lucide-react"

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { focusRingInset } from "@/lib/layout/focus-ring"
import { collapseStorageKey, useRememberedCollapse } from "@/lib/remembered-choice"
import { cn } from "@/lib/utils"

/** Hidden until the section is pointed at or focused; always on a screen with no pointer. */
const onHover =
  "opacity-0 transition-opacity group-hover/section:opacity-100 group-has-[:focus-visible]/section:opacity-100 [@media(hover:none)]:opacity-100"

/**
 * One folding section of the Dating dashboard's left panel, as Tyler's mock
 * of 20 Oct 2026 draws it (`workspace/docs/assets/pasted-image-1792550342758871000.png`):
 * no box and no grey, a 15px heading with a muted note, and a divider line
 * under it running to the panel's edges. Copied from Video's Viral project
 * (`apps/video/src/components/video-viral/flat-section.tsx`), which drew it
 * first; Date owns this copy. Its own buttons and its arrow show only on
 * hover (Tyler, 20 Oct 2026: "all these should be hover to show only"), and
 * open or shut is remembered in this browser.
 */
export function FlatSection({
  storageId,
  title,
  meta,
  action,
  actionOpen = false,
  children,
}: {
  storageId: string
  title: string
  /** Muted, after a dot: "3", "12 of 40". */
  meta?: React.ReactNode
  /** Buttons of the section's own beside the arrow, such as a +. */
  action?: React.ReactNode
  /** The action's dropdown or row is open, so it stays in view. */
  actionOpen?: boolean
  children: React.ReactNode
}) {
  const [open, setOpen, noFlashKey] = useRememberedCollapse(collapseStorageKey.settingsCard(storageId))
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="group/section min-w-0 border-b px-4 py-3">
      <div className="flex min-h-7 items-center gap-1">
        <h2 className="min-w-0 flex-1 text-[15px] font-semibold">
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className={cn("flex w-full cursor-pointer items-center rounded-md text-left select-none", focusRingInset)}
            >
              <span className="min-w-0 flex-1 truncate">
                {title}
                {meta !== undefined ? <span className="font-normal text-muted-foreground"> · {meta}</span> : null}
              </span>
            </button>
          </CollapsibleTrigger>
        </h2>
        {action ? <span className={cn("flex items-center", !actionOpen && onHover)}>{action}</span> : null}
        {/* The heading is the button that folds it; the arrow is the same
            press for the pointer, and left out of the keyboard's way. */}
        <CollapsibleTrigger asChild>
          <button
            type="button"
            tabIndex={-1}
            aria-hidden
            className={cn("flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md", onHover)}
          >
            <ChevronDownIcon className="size-4 text-muted-foreground transition-transform duration-200 group-data-[state=open]/section:rotate-180" />
          </button>
        </CollapsibleTrigger>
      </div>
      <CollapsibleContent data-collapse-key={noFlashKey}>
        <div className="mt-3 grid gap-3">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  )
}
