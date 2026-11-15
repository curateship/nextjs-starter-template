import * as React from "react"

import { Card } from "@/components/ui/card"
import { FieldLabel } from "@/components/ui/field-label"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"

/**
 * The Public navigation tab's layout (Tyler, 9 Nov 2026: "redesign the public
 * page", with a drawing, `workspace/docs/assets/pasted-image-1794280958417214000.png`).
 *
 * - A **card** of rows, each row a name and a line on the left and its
 *   controls on the right, with a faint line between rows.
 * - A **tile** is one control in a small bordered box: its name (with the
 *   hint behind an info mark), then the field.
 * - **Choice tiles** pick one of a few looks by a small drawing of each.
 *
 * Lines and edges are a light grey of their own, as the drawing has them, not
 * the Divider lines setting.
 */

const EDGE = "border-zinc-200/80 dark:border-zinc-700"

/** A card of rows, lines between them. */
export function SettingsRowsCard({ children }: { children: React.ReactNode }) {
  return (
    <Card className="gap-0 divide-y divide-zinc-100 px-7 py-0 dark:divide-zinc-800">{children}</Card>
  )
}

/** One row: its name and line on the left, its controls on the right. */
export function SettingsRow({
  title,
  description,
  children,
}: {
  title: string
  description?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="grid gap-4 py-6 lg:grid-cols-[minmax(0,17rem)_minmax(0,1fr)] lg:gap-10">
      <div className="grid content-start gap-1">
        <h3 className="text-[0.9375rem] font-medium">{title}</h3>
        {description ? <p className="max-w-md text-sm text-muted-foreground">{description}</p> : null}
      </div>
      <div className="flex min-w-0 flex-wrap items-start gap-2">{children}</div>
    </section>
  )
}

/** One control in a small bordered box. */
export function SettingsTile({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("grid gap-2 rounded-xl border bg-background px-3.5 py-3", EDGE, className)}>{children}</div>
}

/** A switch in a tile: the name on the left, the switch on the right. */
export function SwitchTile({
  id,
  label,
  hint,
  checked,
  onCheckedChange,
}: {
  id: string
  label: string
  hint?: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
}) {
  return (
    <SettingsTile className="flex w-52 items-center justify-between gap-3 py-2.5">
      <FieldLabel htmlFor={id} hint={hint} className="min-w-0 font-normal">
        {label}
      </FieldLabel>
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} />
    </SettingsTile>
  )
}

/**
 * Pick one of a few looks, each drawn small: a grey strip with the look in
 * it, and its name under it. The one picked has a dark edge.
 */
export function ChoiceTiles<T extends string>({
  id,
  label,
  hint,
  value,
  options,
  onChange,
}: {
  id: string
  label: string
  hint?: string
  value: T
  options: { value: T; label: string; drawing: React.ReactNode }[]
  onChange: (value: T) => void
}) {
  return (
    <SettingsTile>
      <FieldLabel id={`${id}-label`} hint={hint} className="font-normal">
        {label}
      </FieldLabel>
      <div role="radiogroup" aria-labelledby={`${id}-label`} className="flex flex-wrap gap-1.5">
        {options.map((option) => {
          const picked = option.value === value
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={picked}
              onClick={() => onChange(option.value)}
              className={cn(
                "grid w-[8.5rem] gap-1.5 rounded-lg border bg-background p-1.5 pb-2 text-xs transition-colors",
                picked
                  ? "border-zinc-600 text-foreground ring-1 ring-zinc-600 dark:border-zinc-300 dark:ring-zinc-300"
                  : cn(EDGE, "text-muted-foreground hover:border-zinc-300")
              )}
            >
              <span aria-hidden className="flex h-7 items-center rounded-md bg-muted/70 px-2">
                {option.drawing}
              </span>
              {option.label}
            </button>
          )
        })}
      </div>
    </SettingsTile>
  )
}

/** The three short dashes that stand for a menu in the drawings. */
export function MenuDashes() {
  return (
    <span className="flex gap-0.5">
      <span className="h-[2px] w-1.5 rounded-full bg-zinc-500" />
      <span className="h-[2px] w-1.5 rounded-full bg-zinc-500" />
      <span className="h-[2px] w-1.5 rounded-full bg-zinc-500" />
    </span>
  )
}

/** A logo of a given size, for the drawings. */
export function LogoMark({ size }: { size: "small" | "standard" | "large" }) {
  return (
    <span
      className={cn(
        "shrink-0 rounded-[2px] bg-zinc-500",
        size === "small" ? "size-1.5" : size === "standard" ? "size-2" : "size-2.5"
      )}
    />
  )
}

/** Lines of text set left or centred, for the footer's drawings. */
export function TextLines({ align, faint = false }: { align: "left" | "center"; faint?: boolean }) {
  return (
    <span className={cn("grid w-full gap-[3px]", align === "center" ? "justify-items-center" : "justify-items-start")}>
      {["w-6", "w-8", "w-5"].map((width, at) => (
        <span key={at} className={cn("h-[2px] rounded-full", width, faint ? "bg-zinc-400/70" : "bg-zinc-500")} />
      ))}
    </span>
  )
}
