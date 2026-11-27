import * as React from "react"
import { CheckIcon } from "lucide-react"

import { FieldLabel } from "@/components/broadcasts/inspector-fields"
import { cn } from "@/lib/utils"
import { TEXT_LOOK_LABELS, TEXT_LOOKS } from "@/lib/video/thumbnails"

type TextLook = (typeof TEXT_LOOKS)[number]

/**
 * The Styles card's look picker (thumbnails.md, "Text looks"): one tile per
 * look, each a small thumbnail showing "SO EASY" in that look, with its name
 * underneath. A look that is on has a dark edge and a tick. Two tiles to a
 * row at any panel width: in a narrow panel the names wrap onto two lines.
 */
export function TextLookTiles({
  isOn,
  onToggle,
}: {
  isOn: (look: TextLook) => boolean
  onToggle: (look: TextLook, on: boolean) => void
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {TEXT_LOOKS.map((look) => {
        const on = isOn(look)
        return (
          <button
            key={look}
            type="button"
            aria-pressed={on}
            onClick={() => onToggle(look, on)}
            className={cn(
              "@container flex flex-col overflow-hidden rounded-xl border bg-card text-left transition-[border-color,box-shadow] focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
              on ? "border-foreground ring-1 ring-foreground" : "hover:border-foreground/30"
            )}
          >
            <span
              aria-hidden
              className="relative flex aspect-video items-center justify-center bg-[radial-gradient(ellipse_at_30%_15%,#7d8aa3_0%,transparent_60%),linear-gradient(to_bottom,#5a6782,#2c3447)]"
            >
              <LookSample look={look} />
              {on ? (
                <span className="absolute top-[4cqw] right-[4cqw] flex size-[max(1rem,14cqw)] max-h-6 max-w-6 items-center justify-center rounded-full bg-foreground text-background">
                  <CheckIcon className="size-3/5" strokeWidth={3} />
                </span>
              ) : null}
            </span>
            <span className="line-clamp-2 border-t px-[clamp(0.5rem,7cqw,0.75rem)] py-2.5 text-[clamp(13px,10cqw,15px)] leading-snug">
              {TEXT_LOOK_LABELS[look]}
            </span>
          </button>
        )
      })}
    </div>
  )
}

/** "SO EASY" drawn in one look, sized to the tile it sits in. */
function LookSample({ look }: { look: TextLook }) {
  const base: React.CSSProperties = {
    fontFamily: "var(--app-font-sans)",
    fontWeight: 800,
    fontSize: "15cqw",
    // A little under the middle, so the tick in the corner stays clear of it.
    translate: "0 4cqw",
    lineHeight: 1,
    letterSpacing: "-0.02em",
    color: "#ffffff",
    whiteSpace: "nowrap",
  }
  if (look === "outline") {
    return (
      <span
        style={{
          ...base,
          WebkitTextStroke: "0.22em #000000",
          paintOrder: "stroke fill",
        }}
      >
        SO EASY
      </span>
    )
  }
  if (look === "accent") {
    return (
      <span style={base}>
        SO <span style={{ color: "#ffd60a" }}>EASY</span>
      </span>
    )
  }
  if (look === "shadow") {
    return <span style={{ ...base, textShadow: "0 0.12em 0.14em rgba(0,0,0,0.6)" }}>SO EASY</span>
  }
  return (
    <span
      style={{ ...base, backgroundColor: "#111111", padding: "0.18em 0.28em", borderRadius: "0.12em", transform: "rotate(-2deg)" }}
    >
      SO EASY
    </span>
  )
}

/** The colours a thumbnail's outline, box or shadow is usually in. */
const SWATCHES = [
  { value: "#ffffff", label: "White" },
  { value: "#e5e7eb", label: "Light grey" },
  { value: "#6b7280", label: "Grey" },
  { value: "#111827", label: "Navy" },
  { value: "#000000", label: "Black" },
] as const

/**
 * A colour picked from round swatches, with a last rainbow one for any other
 * colour. That last one fills with the colour once it is picked.
 */
export function SwatchField({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (value: string) => void
}) {
  const normalized = value.trim().toLowerCase()
  const custom = !SWATCHES.some((swatch) => swatch.value === normalized)
  const ring = "ring-2 ring-foreground ring-offset-2 ring-offset-background"
  return (
    <div className="grid gap-2.5">
      <FieldLabel>{label}</FieldLabel>
      <div className="grid max-w-72 grid-cols-6 gap-2.5 p-1">
        {SWATCHES.map((swatch) => (
          <button
            key={swatch.value}
            type="button"
            aria-label={`${label}: ${swatch.label}`}
            aria-pressed={normalized === swatch.value}
            onClick={() => onChange(swatch.value)}
            className={cn(
              "aspect-square w-full rounded-full border transition-shadow",
              normalized === swatch.value ? ring : "hover:border-foreground/30"
            )}
            style={{ backgroundColor: swatch.value }}
          />
        ))}
        <label
          className={cn(
            "relative aspect-square w-full cursor-pointer overflow-hidden rounded-full border transition-shadow",
            custom ? ring : "hover:border-foreground/30"
          )}
          style={{ backgroundColor: custom ? value : undefined }}
        >
          {custom ? null : (
            <span
              aria-hidden
              className="absolute inset-0 bg-[conic-gradient(#f87171,#facc15,#4ade80,#38bdf8,#a78bfa,#f87171)] opacity-70"
            />
          )}
          <input
            type="color"
            aria-label={`${label}: any other colour`}
            value={/^#[0-9a-f]{6}$/i.test(value) ? value : "#ffffff"}
            onChange={(event) => onChange(event.target.value)}
            className="absolute inset-0 cursor-pointer opacity-0"
          />
        </label>
      </div>
    </div>
  )
}
