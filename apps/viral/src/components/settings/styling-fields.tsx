import * as React from "react"

import { SettingsSliderRow as SliderRow } from "@/components/settings/settings-slider-row"
import { Card, CardContent } from "@/components/ui/card"
import { ColorSwatch } from "@/components/ui/color-swatch"
import { FieldLabel } from "@/components/ui/field-label"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  getModalStyleVars,
  type ShellBackground,
  type ShellBackgroundMode,
  type ShellModalStyling,
} from "@/lib/layout/styling-values"
import { showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"

/**
 * The controls shared by the two Styling tabs: Settings → Styling for the
 * signed-in app and Settings → Public site → Styling for the signed-out pages.
 * Both save the same `ShellBackground` and `ShellModalStyling` shapes, so the
 * colour field, the group heading and the modal preview are written once here
 * rather than copied into each tab.
 */

const BACKGROUND_MODE_LABELS: Record<ShellBackgroundMode, string> = {
  default: "Theme default",
  muted: "Muted (adjustable)",
  custom: "Custom color",
}

/** The only hex shape the colour swatch accepts. */
const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/

export function BackgroundField({
  idPrefix,
  value,
  disabled,
  defaultHint,
  onChange,
}: {
  idPrefix: string
  value: ShellBackground
  disabled?: boolean
  defaultHint: string
  onChange: (patch: Partial<ShellBackground>) => void
}) {
  // The swatch only accepts #rrggbb, so it has to fall back to white on
  // anything else. That fallback used to be the only feedback you got; the
  // error reported on blur is what makes it not a silent reset.
  const hexValid = HEX_COLOR_PATTERN.test(value.color)
  const color = hexValid ? value.color : "#ffffff"

  return (
    <div className="grid gap-6">
      <div className="grid gap-2">
        <FieldLabel
          htmlFor={`${idPrefix}-mode`}
          hint={value.mode === "default" ? defaultHint : undefined}
        >
          Mode
        </FieldLabel>
        <Select
          value={value.mode}
          disabled={disabled}
          onValueChange={(mode) =>
            onChange({ mode: mode as ShellBackgroundMode })
          }
        >
          <SelectTrigger
            id={`${idPrefix}-mode`}
            className="w-full sm:w-fit"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="default">
              {BACKGROUND_MODE_LABELS.default}
            </SelectItem>
            <SelectItem value="muted">
              {BACKGROUND_MODE_LABELS.muted}
            </SelectItem>
            <SelectItem value="custom">
              {BACKGROUND_MODE_LABELS.custom}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      {value.mode === "muted" ? (
        <SliderRow
          label="Strength"
          value={value.strength}
          min={0}
          max={100}
          valueLabel={`${value.strength}%`}
          disabled={disabled}
          onChange={(strength) => onChange({ strength })}
          help="How strong the muted tone is. Lower is more transparent."
        />
      ) : null}

      {value.mode === "custom" ? (
        <div className="grid gap-2">
          <FieldLabel
            htmlFor={`${idPrefix}-color-hex`}
            hint="A custom color stays the same in light and dark mode."
          >
            Color
          </FieldLabel>
          <div className="flex items-center gap-2">
            <ColorSwatch
              id={`${idPrefix}-color`}
              value={color}
              disabled={disabled}
              onChange={(event) => onChange({ color: event.target.value })}
              aria-label="Pick a color"
            />
            <Input
              id={`${idPrefix}-color-hex`}
              value={value.color}
              disabled={disabled}
              onChange={(event) => onChange({ color: event.target.value })}
              placeholder="#ffffff"
              className="w-40"
              aria-invalid={!hexValid || undefined}
              onBlur={() => {
                if (!hexValid) {
                  showErrorToast(
                    "Enter a 6-digit hex code, like #3b82f6. The swatch shows white until you do."
                  )
                }
              }}
            />
          </div>
        </div>
      ) : null}
    </div>
  )
}

/**
 * A heading over a whole group of controls — "Background", "Border color",
 * "Preview". Deliberately not a `Label`: a label names one control, and a
 * `<label>` pointing at nothing is announced as nothing. Naming a set of
 * controls is what `role="group"` and `aria-labelledby` are for, and it looks
 * exactly the same on screen.
 */
export function FieldGroup({
  label,
  description,
  className,
  children,
}: {
  label: string
  description?: string
  className?: string
  children: React.ReactNode
}) {
  const labelId = React.useId()

  return (
    <div
      role="group"
      aria-labelledby={labelId}
      className={cn("grid gap-3", className)}
    >
      <div className="grid gap-0.5">
        <span id={labelId} className="text-sm leading-none font-medium">
          {label}
        </span>
        {description ? (
          <p className="text-xs text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {children}
    </div>
  )
}

/** The hairline theme.css draws when a border colour is left on "default". */
const MODAL_PREVIEW_HAIRLINE =
  "color-mix(in oklab, var(--foreground) 10%, transparent)"

/**
 * Every modal variable, with the theme token written out where the setting is
 * on "Theme default". The preview sits inside the signed-in app, which already
 * has the admin's own modal variables on the document root, so an omitted
 * variable would inherit that admin value and a public preview would show the
 * wrong colour. Writing all of them keeps the preview honest on both tabs.
 */
function modalPreviewVars(modal: ShellModalStyling): React.CSSProperties {
  const vars = getModalStyleVars(modal)
  return {
    "--shell-modal-bg": "var(--popover)",
    "--shell-modal-border-color": MODAL_PREVIEW_HAIRLINE,
    "--shell-modal-card-bg": "var(--card)",
    "--shell-modal-card-border-color": MODAL_PREVIEW_HAIRLINE,
    ...vars,
  } as React.CSSProperties
}

export function ModalPreview({ modal }: { modal: ShellModalStyling }) {
  return (
    <FieldGroup label="Preview" className="gap-2">
      <div
        className="relative max-w-lg overflow-hidden rounded-lg bg-muted/40 p-4"
        style={modalPreviewVars(modal)}
      >
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundColor: `color-mix(in oklab, black ${modal.overlayOpacity}%, transparent)`,
          }}
        />
        {/* Mimics the real dialog structure so the modal CSS variables preview here. */}
        <div
          data-slot="dialog-content"
          data-variant="admin"
          className="relative mx-auto flex max-w-sm flex-col overflow-hidden rounded-xl"
        >
          <div data-slot="dialog-header" className="flex flex-col gap-1 text-left">
            <div className="text-base leading-none font-medium">Send Feedback</div>
            <div className="text-sm text-muted-foreground">
              Share a request, report, question, or win.
            </div>
          </div>
          <div data-slot="dialog-body" className="grid gap-4">
            <Card size="sm">
              <CardContent className="text-sm text-muted-foreground">
                What&apos;s on your mind?
              </CardContent>
            </Card>
            <Card size="sm">
              <CardContent className="text-sm text-muted-foreground">
                Feedback
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </FieldGroup>
  )
}
