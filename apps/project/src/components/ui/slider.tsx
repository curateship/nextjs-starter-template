import * as React from "react"
import { Slider as SliderPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

function Slider({
  className,
  defaultValue,
  value,
  min = 0,
  max = 100,
  id,
  thumbRef,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
  "aria-describedby": ariaDescribedBy,
  "aria-valuetext": ariaValueText,
  ...props
}: React.ComponentProps<typeof SliderPrimitive.Root> & {
  /** The thumb, so a caption sitting above it can hand it focus. */
  thumbRef?: React.Ref<HTMLSpanElement>
}) {
  const values = React.useMemo(
    () =>
      Array.isArray(value)
        ? value
        : Array.isArray(defaultValue)
          ? defaultValue
          : [min, max],
    [value, defaultValue, min, max]
  )

  // The thumb is the element carrying role="slider", so the id and everything
  // that names, describes or reads out the value has to go there — left on the
  // root it reaches nothing, and a screen reader announces an unnamed slider.
  // A two-thumb range has no single control to name, so it keeps whatever
  // names its own thumbs already carry.
  const single = values.length === 1

  return (
    <SliderPrimitive.Root
      data-slot="slider"
      defaultValue={defaultValue}
      value={value}
      min={min}
      max={max}
      className={cn(
        "relative flex w-full touch-none items-center select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        className
      )}
      {...props}
    >
      <SliderPrimitive.Track
        data-slot="slider-track"
        className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-muted"
      >
        <SliderPrimitive.Range
          data-slot="slider-range"
          className="absolute h-full bg-foreground"
        />
      </SliderPrimitive.Track>
      {Array.from({ length: values.length }, (_, index) => (
        <SliderPrimitive.Thumb
          data-slot="slider-thumb"
          key={index}
          ref={single ? thumbRef : undefined}
          id={single ? id : undefined}
          aria-label={single ? ariaLabel : undefined}
          aria-labelledby={single ? ariaLabelledBy : undefined}
          aria-describedby={single ? ariaDescribedBy : undefined}
          aria-valuetext={single ? ariaValueText : undefined}
          className="block size-4 shrink-0 rounded-full border border-foreground bg-background shadow-sm transition-[color,box-shadow] hover:ring-4 hover:ring-foreground/20 focus-visible:ring-4 focus-visible:ring-foreground/30 focus-visible:outline-hidden"
        />
      ))}
    </SliderPrimitive.Root>
  )
}

export { Slider }
