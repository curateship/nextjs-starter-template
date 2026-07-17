import * as React from "react"
import { CircleHelpIcon, Loader2Icon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  EMA_LINES,
  INDICATOR_LABELS,
  INDICATOR_PARAM_FIELDS,
  PRICE_ACTION_PATTERNS,
  indicatorColor,
  indicatorDisplayName,
  primaryColorSlot,
  type IndicatorConfig,
} from "@/lib/trading/indicators-config"
import { SESSION_OPTIONS, type SessionKey } from "@/lib/trading/sessions"
import { cn } from "@/lib/utils"

/**
 * Shared editor for one overlay indicator's settings (name, params, session,
 * color) — used by both the Indicators dashboard and the chart's Indicators
 * dropdown. Saving is delegated to `onSave` so each caller can persist and
 * update its own local state.
 */
export function OverlaySettingsDialog({
  indicator,
  open,
  draggable = false,
  onOpenChange,
  onSave,
}: {
  indicator: IndicatorConfig
  open: boolean
  /** Only chart overlays need a movable, non-blocking settings window. */
  draggable?: boolean
  onOpenChange: (open: boolean) => void
  onSave: (next: IndicatorConfig) => Promise<void>
}) {
  const [name, setName] = React.useState("")
  const [params, setParams] = React.useState<Record<string, string>>({})
  const [session, setSession] = React.useState<SessionKey>("nyse")
  const [color, setColor] = React.useState<string | undefined>(undefined)
  const [colors, setColors] = React.useState<Record<string, string>>({})
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const positionRef = React.useRef({ x: 0, y: 0 })
  const dragRef = React.useRef<{
    startX: number
    startY: number
    x: number
    y: number
  } | null>(null)

  // Seed the draft whenever the dialog (re)opens or targets another indicator.
  const [prevSeed, setPrevSeed] = React.useState<IndicatorConfig | null>(null)
  const seed = open ? indicator : null
  if (prevSeed !== seed) {
    setPrevSeed(seed)
    if (seed) {
      setName(seed.name ?? "")
      setParams(
        Object.fromEntries(
          [
            ...INDICATOR_PARAM_FIELDS[seed.type].map((field) => field.key),
            ...(seed.type === "priceAction"
              ? PRICE_ACTION_PATTERNS.map((pattern) => pattern.key)
              : []),
            ...(seed.type === "ema"
              ? EMA_LINES.flatMap((line) => [line.periodKey, line.toggleKey])
              : []),
          ].map((key) => [key, String(seed.params[key] ?? "")])
        )
      )
      setSession(seed.session ?? "nyse")
      setColor(seed.color)
      setColors(seed.colors ?? {})
      setBusy(false)
      setError(null)
    }
  }

  const fields = INDICATOR_PARAM_FIELDS[indicator.type]
  const isDark =
    typeof document !== "undefined" &&
    document.documentElement.classList.contains("dark")
  const defaultLabel =
    indicator.type === "ema"
      ? indicatorDisplayName({ ...indicator, name: undefined })
      : INDICATOR_LABELS[indicator.type]

  async function submit() {
    const nextParams: Record<string, number> = { ...indicator.params }
    if (indicator.type === "priceAction") {
      for (const pattern of PRICE_ACTION_PATTERNS) {
        nextParams[pattern.key] = Number(params[pattern.key] ?? 1)
      }
    }
    if (indicator.type === "ema") {
      for (const line of EMA_LINES) {
        nextParams[line.toggleKey] =
          (params[line.toggleKey] || "1") !== "0" ? 1 : 0
        const period = Number(params[line.periodKey])
        if (!Number.isFinite(period) || period < 2) {
          setError(`${line.label} period must be 2 or more.`)
          return
        }
        nextParams[line.periodKey] = period
      }
    }
    for (const field of fields) {
      // Select stores the chosen option's index; boolean stores 0/1. Both can
      // legitimately be 0, so only plain numeric fields require a positive value.
      if (field.kind === "select") {
        nextParams[field.key] = Number(params[field.key] ?? 0)
        continue
      }
      if (field.kind === "boolean") {
        nextParams[field.key] = (params[field.key] ?? "1") !== "0" ? 1 : 0
        continue
      }
      const value = Number(params[field.key])
      if (!Number.isFinite(value) || value <= 0) {
        setError(`${field.label} must be a positive number.`)
        return
      }
      nextParams[field.key] = value
    }
    const next: IndicatorConfig = {
      ...indicator,
      name: name.trim() || undefined,
      params: nextParams,
      color: indicator.type === "priceAction" ? undefined : color,
    }
    if (indicator.type === "ema") {
      next.colors = Object.keys(colors).length > 0 ? colors : undefined
    }
    if (indicator.type === "session") next.session = session
    setBusy(true)
    setError(null)
    try {
      await onSave(next)
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      modal={!draggable}
      open={open}
      onOpenChange={(next) => (busy ? null : onOpenChange(next))}
    >
      <DialogContent
        variant="admin"
        showOverlay={!draggable}
        className={cn("sm:max-w-md", draggable && "sm:will-change-transform")}
        onInteractOutside={
          draggable ? (event) => event.preventDefault() : undefined
        }
      >
        <DialogHeader
          className={cn(
            draggable && "sm:cursor-move sm:touch-none sm:select-none"
          )}
          onPointerDown={(event) => {
            if (!draggable || event.button !== 0 || window.innerWidth < 640)
              return
            dragRef.current = {
              startX: event.clientX,
              startY: event.clientY,
              ...positionRef.current,
            }
            event.currentTarget.setPointerCapture(event.pointerId)
          }}
          onPointerMove={(event) => {
            if (!draggable) return
            const drag = dragRef.current
            if (!drag) return
            positionRef.current = {
              x: drag.x + event.clientX - drag.startX,
              y: drag.y + event.clientY - drag.startY,
            }
            const dialog = event.currentTarget.closest<HTMLElement>(
              '[data-slot="dialog-content"]'
            )
            if (dialog) {
              dialog.style.transform = `translate3d(${positionRef.current.x}px, ${positionRef.current.y}px, 0)`
            }
          }}
          onPointerUp={(event) => {
            if (!draggable) return
            dragRef.current = null
            event.currentTarget.releasePointerCapture(event.pointerId)
          }}
          onPointerCancel={() => {
            if (!draggable) return
            dragRef.current = null
          }}
        >
          <DialogTitle>{defaultLabel} settings</DialogTitle>
          <DialogDescription>
            Rename the indicator and tune its settings.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          {indicator.type === "priceAction"
            ? (["bull", "bear"] as const).map((side) => (
                <Card key={side} size="sm">
                  <CardHeader>
                    <CardTitle>
                      {side === "bull" ? "Bullish" : "Bearish"}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-3">
                    {PRICE_ACTION_PATTERNS.filter(
                      (pattern) => pattern.side === side
                    ).map((pattern) => (
                      <label
                        key={pattern.key}
                        className="flex items-center gap-2 text-sm"
                      >
                        <Checkbox
                          checked={Number(params[pattern.key] ?? 1) !== 0}
                          onCheckedChange={(checked) =>
                            setParams((prev) => ({
                              ...prev,
                              [pattern.key]: checked === true ? "1" : "0",
                            }))
                          }
                        />
                        {pattern.label}
                        {pattern.key === "bearShootingStar" ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                type="button"
                                aria-label="About Shooting Star"
                                onClick={(event) => {
                                  event.preventDefault()
                                  event.stopPropagation()
                                }}
                              >
                                <CircleHelpIcon className="size-3.5 text-muted-foreground" />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent side="right" sideOffset={6}>
                              Shooting Star is the standard name for the
                              bearish reverse-Hammer shape.
                            </TooltipContent>
                          </Tooltip>
                        ) : null}
                      </label>
                    ))}
                  </CardContent>
                </Card>
              ))
            : null}
          <Card size="sm">
            <CardHeader>
              <CardTitle>
                {indicator.type === "priceAction" ? "General" : "Settings"}
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="indicator-name">Name</Label>
                <Input
                  id="indicator-name"
                  value={name}
                  placeholder={defaultLabel}
                  maxLength={80}
                  onChange={(event) => setName(event.target.value)}
                />
              </div>
              {indicator.type !== "priceAction"
                ? fields.map((field) =>
                    field.kind === "boolean" ? (
                      <label
                        key={field.key}
                        className="flex items-center gap-2 text-sm"
                      >
                        <Checkbox
                          checked={(params[field.key] ?? "1") !== "0"}
                          onCheckedChange={(checked) =>
                            setParams((prev) => ({
                              ...prev,
                              [field.key]: checked === true ? "1" : "0",
                            }))
                          }
                        />
                        {field.label}
                      </label>
                    ) : (
                      <div key={field.key} className="grid gap-2">
                        <Label htmlFor={`indicator-param-${field.key}`}>
                          {field.label}
                          {field.description ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  type="button"
                                  aria-label={`About ${field.label}`}
                                  onClick={(event) => {
                                    event.preventDefault()
                                    event.stopPropagation()
                                  }}
                                >
                                  <CircleHelpIcon className="ml-1 inline size-3.5 text-muted-foreground" />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent side="right" sideOffset={6}>
                                {field.description}
                              </TooltipContent>
                            </Tooltip>
                          ) : null}
                        </Label>
                        {field.kind === "select" && field.options ? (
                          <Select
                            value={params[field.key] ?? "0"}
                            onValueChange={(value) =>
                              setParams((prev) => ({ ...prev, [field.key]: value }))
                            }
                          >
                            <SelectTrigger className="h-8 w-full">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {field.options.map((option, index) => (
                                <SelectItem key={option} value={String(index)}>
                                  {option}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <Input
                            id={`indicator-param-${field.key}`}
                            type="number"
                            step={field.step ?? 1}
                            min={0}
                            value={params[field.key] ?? ""}
                            onChange={(event) =>
                              setParams((prev) => ({
                                ...prev,
                                [field.key]: event.target.value,
                              }))
                            }
                          />
                        )}
                      </div>
                    )
                  )
                : null}
              {indicator.type === "session" ? (
                <div className="grid gap-2">
                  <Label>Session</Label>
                  <Select
                    value={session}
                    onValueChange={(value) => setSession(value as SessionKey)}
                  >
                    <SelectTrigger className="h-8 w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SESSION_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
              {indicator.type !== "priceAction" && indicator.type !== "ema" ? (
                <div className="grid gap-2">
                  <Label htmlFor="indicator-color">Color</Label>
                  <input
                    id="indicator-color"
                    type="color"
                    className="h-8 w-16 cursor-pointer rounded border-0 bg-transparent p-0"
                    value={
                      color ??
                      indicatorColor(primaryColorSlot(indicator), isDark)
                    }
                    onChange={(event) => setColor(event.target.value)}
                  />
                </div>
              ) : null}
            </CardContent>
          </Card>
          {indicator.type === "ema"
            ? EMA_LINES.map((line) => (
                <Card key={line.key} size="sm">
                  <CardHeader>
                    <CardTitle>{line.label}</CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-4">
                    <label className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={(params[line.toggleKey] || "1") !== "0"}
                        onCheckedChange={(checked) =>
                          setParams((prev) => ({
                            ...prev,
                            [line.toggleKey]: checked === true ? "1" : "0",
                          }))
                        }
                      />
                      Show on chart
                    </label>
                    <div className="grid gap-2">
                      <Label htmlFor={`indicator-param-${line.periodKey}`}>
                        Period
                      </Label>
                      <Input
                        id={`indicator-param-${line.periodKey}`}
                        type="number"
                        step={1}
                        min={2}
                        value={params[line.periodKey] ?? ""}
                        onChange={(event) =>
                          setParams((prev) => ({
                            ...prev,
                            [line.periodKey]: event.target.value,
                          }))
                        }
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor={`indicator-color-${line.key}`}>
                        Color
                      </Label>
                      <input
                        id={`indicator-color-${line.key}`}
                        type="color"
                        className="h-8 w-16 cursor-pointer rounded border-0 bg-transparent p-0"
                        value={
                          colors[line.key] ??
                          (line.key === "fast" ? color : undefined) ??
                          indicatorColor(line.slot, isDark)
                        }
                        onChange={(event) =>
                          setColors((prev) => ({
                            ...prev,
                            [line.key]: event.target.value,
                          }))
                        }
                      />
                    </div>
                  </CardContent>
                </Card>
              ))
            : null}
          {indicator.type === "priceAction"
            ? [
                {
                  title: "Hammer & Shooting Star",
                  keys: ["wickBodyRatio", "extremeLookback"],
                },
                { title: "Liquidity Sweep", keys: ["sweepLookback"] },
                { title: "Break of Structure", keys: ["swingLookback"] },
              ].map((group) => (
                <Card key={group.title} size="sm">
                  <CardHeader>
                    <CardTitle>{group.title}</CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-4">
                    {fields
                      .filter((field) => group.keys.includes(field.key))
                      .map((field) => (
                        <div key={field.key} className="grid gap-2">
                          <Label htmlFor={`indicator-param-${field.key}`}>
                            {field.label}
                            {field.description ? (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button
                                    type="button"
                                    aria-label={`About ${field.label}`}
                                    onClick={(event) => {
                                      event.preventDefault()
                                      event.stopPropagation()
                                    }}
                                  >
                                    <CircleHelpIcon className="ml-1 inline size-3.5 text-muted-foreground" />
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent side="right" sideOffset={6}>
                                  {field.description}
                                </TooltipContent>
                              </Tooltip>
                            ) : null}
                          </Label>
                          <Input
                            id={`indicator-param-${field.key}`}
                            type="number"
                            step={field.step ?? 1}
                            min={0}
                            value={params[field.key] ?? ""}
                            onChange={(event) =>
                              setParams((prev) => ({
                                ...prev,
                                [field.key]: event.target.value,
                              }))
                            }
                          />
                        </div>
                      ))}
                  </CardContent>
                </Card>
              ))
            : null}
          {error ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          ) : null}
        </DialogBody>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button type="button" disabled={busy} onClick={() => void submit()}>
            {busy ? <Loader2Icon className="size-4 animate-spin" /> : null}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
