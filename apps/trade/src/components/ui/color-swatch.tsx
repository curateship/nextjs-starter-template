import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * The colour picker, wearing the app's clothes.
 *
 * A native `<input type="color">` draws the browser's own focus outline, which
 * next to the hex `Input` it always sits beside meant two touching controls
 * lighting up differently. Border, radius, height, focus ring and disabled
 * state are all copied from `input.tsx` so the pair reads as one field.
 *
 * The value has to be `#rrggbb` — anything else and the browser silently shows
 * black — so callers check the hex before handing it over.
 */
function ColorSwatch({
  className,
  ...props
}: Omit<React.ComponentProps<"input">, "type">) {
  return (
    <input
      type="color"
      data-slot="color-swatch"
      className={cn(
        "h-8 w-12 cursor-pointer rounded-lg border border-input bg-transparent p-1 transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 dark:bg-input/30 dark:disabled:bg-input/80",
        className
      )}
      {...props}
    />
  )
}

export { ColorSwatch }
