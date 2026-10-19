import { ToggleGroup } from "radix-ui"

import { slidingPillMotionClassName, useSlidingPill } from "@/lib/hooks/use-sliding-pill"
import { cn } from "@/lib/utils"

/**
 * One answer out of a few, as a row of equal parts on a grey track with the
 * chosen one raised, the way Tyler drew the goal, experience and rest
 * choices on 18 Oct 2026. The same track, raised look and sliding pill as the
 * shell's tabs (`use-sliding-pill.ts`), so a new pick slides across rather than
 * blinking, but it is a choice, not navigation, so it is a radio group to a
 * screen reader. Picking the chosen one again keeps it chosen.
 */
export function SegmentedChoice<T extends string>({
  id,
  label,
  value,
  options,
  disabled = false,
  className,
  onChange,
}: {
  id?: string
  /** Read out for the group; pair with a visible label through `id`. */
  label: string
  value: T | null
  options: readonly { value: T; label: string }[]
  disabled?: boolean
  className?: string
  onChange: (value: T) => void
}) {
  const { trackRef, trackProps, pillProps } = useSlidingPill<HTMLDivElement>({
    selected: '[data-slot="segment"][data-state="on"]',
    observe: '[data-slot="segment"]',
    attributes: ["data-state"],
    className: "rounded-md",
  })

  return (
    <ToggleGroup.Root
      ref={trackRef}
      {...trackProps}
      id={id}
      type="single"
      aria-label={label}
      value={value ?? ""}
      disabled={disabled}
      onValueChange={(next) => {
        if (next) onChange(next as T)
      }}
      className={cn("relative flex h-8 w-full items-center rounded-lg bg-muted/60 p-0.5", className)}
    >
      <span {...pillProps} />
      {options.map((option) => (
        <ToggleGroup.Item
          key={option.value}
          value={option.value}
          data-slot="segment"
          className={cn(
            "relative z-10 flex h-7 min-w-0 flex-1 items-center justify-center truncate rounded-md px-2 text-sm font-medium text-muted-foreground transition-colors",
            slidingPillMotionClassName,
            "hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
            "disabled:pointer-events-none disabled:opacity-50",
            "data-[state=on]:text-foreground",
            // Before the pill is measured, the chosen part wears the raised look itself.
            "in-data-[pill=pending]:data-[state=on]:bg-background in-data-[pill=pending]:data-[state=on]:shadow-sm"
          )}
        >
          {option.label}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  )
}
