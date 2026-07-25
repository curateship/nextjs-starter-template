import * as React from "react"
import { InfoIcon } from "lucide-react"

import { Label } from "@/components/ui/label"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

/**
 * A field label with its help text behind an info icon.
 *
 * Guidance belongs here rather than in a paragraph under the control: helper
 * text under an input reads like an error, pushes the next field down, and
 * makes a two-column form rows of different heights.
 */
export function FieldLabel({
  htmlFor,
  hint,
  className,
  children,
  ...props
}: React.ComponentProps<typeof Label> & { hint?: React.ReactNode }) {
  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      <Label htmlFor={htmlFor} {...props}>
        {children}
      </Label>
      {hint ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              // Not a form control: it must never take focus from the field or
              // submit the form it sits in.
              tabIndex={-1}
              aria-label={
                typeof children === "string" ? `About ${children}` : "More information"
              }
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              <InfoIcon className="size-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent className="max-w-64">{hint}</TooltipContent>
        </Tooltip>
      ) : null}
    </div>
  )
}
