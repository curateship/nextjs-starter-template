import type * as React from "react"


/**
 * Writes a field's unit inside its box at the right, "kg" or "cm", the way
 * Tyler drew the weight and body fields on 18 Oct 2026, so the label above
 * can be the plain word. The unit is read out with the field's label rather
 * than twice, so it is hidden from screen readers here.
 */
export function UnitSuffix({ unit, children }: { unit?: string; children: React.ReactNode }) {
  if (!unit) return children
  return (
    <div className="relative">
      {children}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground"
      >
        {unit}
      </span>
    </div>
  )
}
