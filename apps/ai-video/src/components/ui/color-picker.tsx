import * as React from "react"
import { HexColorInput, HexColorPicker } from "react-colorful"

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { cn } from "@/lib/utils"

// Quick-pick swatches for common text colors (white/black + a bright palette).
const PRESET_COLORS = [
  "#ffffff",
  "#000000",
  "#ef4444",
  "#f97316",
  "#facc15",
  "#22c55e",
  "#3b82f6",
  "#a855f7",
  "#ec4899",
]

type ColorSwatch = {
  value: string
}

// Compare colors case-insensitively — react-colorful emits lowercase #rrggbb,
// but a stored value might be uppercase.
function normalizeHex(value: string) {
  return value.trim().toLowerCase()
}

// shadcn-style color picker: a swatch+hex button (styled like an Input) that
// opens a Popover with react-colorful's saturation/hue picker, a typeable hex
// field, and preset swatches. Controlled via `value`/`onChange` (a hex string
// like "#ffffff").
export function ColorPicker({
  value,
  onChange,
  id,
  className,
  swatches,
  disabled = false,
  "aria-label": ariaLabel,
}: {
  value: string
  onChange: (value: string) => void
  id?: string
  className?: string
  swatches?: ColorSwatch[]
  disabled?: boolean
  "aria-label"?: string
}) {
  const [open, setOpen] = React.useState(false)
  const hex = normalizeHex(value)
  const presetColors = swatches?.length
    ? swatches.map((color) => color.value)
    : PRESET_COLORS

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => !disabled && setOpen(nextOpen)}
    >
      <PopoverTrigger asChild>
        <button
          id={id}
          type="button"
          disabled={disabled}
          aria-label={ariaLabel ?? "Pick a color"}
          className={cn(
            // Mirrors the shadcn Input look so it sits naturally among fields.
            "flex h-8 w-full min-w-0 items-center gap-2 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base transition-colors outline-none hover:bg-accent/40 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-input/30",
            className
          )}
        >
          <span
            className="size-4 shrink-0 rounded-sm border"
            style={{ backgroundColor: hex }}
          />
          <span className="font-mono uppercase">{hex}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className={cn(
          "w-60 space-y-3 p-3",
          disabled && "pointer-events-none opacity-60"
        )}
      >
        {/* Saturation square + hue slider. Inline width/height beat
            react-colorful's injected fixed 200×200, so it fills the popover and
            its right edge lines up with the hex field + presets below. */}
        <HexColorPicker
          color={hex}
          onChange={onChange}
          style={{ width: "100%", height: 180 }}
        />

        {/* Typeable hex — HexColorInput only emits valid colors. */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Hex</span>
          <HexColorInput
            color={hex}
            onChange={onChange}
            prefixed
            disabled={disabled}
            spellCheck={false}
            aria-label="Hex color value"
            className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 font-mono text-sm uppercase outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
          />
        </div>

        {/* Preset swatches */}
        <div className="flex flex-wrap gap-1.5">
          {presetColors.map((preset, index) => (
            <button
              key={`${preset}-${index}`}
              type="button"
              disabled={disabled}
              onClick={() => onChange(preset)}
              aria-label={`Use ${preset}`}
              className={cn(
                "size-6 rounded-md border transition-transform hover:scale-110 disabled:cursor-not-allowed disabled:hover:scale-100",
                normalizeHex(preset) === hex &&
                  "ring-2 ring-ring ring-offset-1 ring-offset-background"
              )}
              style={{ backgroundColor: preset }}
            />
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}
