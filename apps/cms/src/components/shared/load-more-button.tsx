import * as React from "react"
import { Loader2Icon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

/** The one low-emphasis action used to extend an existing list in place. */
export function LoadMoreButton({
  loading,
  className,
  disabled,
  ...props
}: Omit<
  React.ComponentProps<typeof Button>,
  "children" | "size" | "variant"
> & {
  loading: boolean
}) {
  return (
    <Button
      {...props}
      type="button"
      variant="ghost"
      size="sm"
      aria-busy={loading || undefined}
      disabled={disabled || loading}
      className={cn("relative", className)}
    >
      <span className={cn(loading && "opacity-0")}>Load more</span>
      {loading ? (
        <Loader2Icon className="absolute size-3.5 animate-spin" aria-hidden />
      ) : null}
    </Button>
  )
}
