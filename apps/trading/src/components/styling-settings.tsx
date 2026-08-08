import * as React from "react"

import { CollapsibleSettingsCard } from "@/components/collapsible-settings-card"
import {
  Card,
  CardContent,
  CardDescription,
  CardGroup,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Slider } from "@/components/ui/slider"
import {
  MAX_CARD_BORDER_WIDTH,
  MAX_CONTENT_GUTTER,
  MAX_MODAL_PADDING,
  MIN_CONTENT_GUTTER,
  resolveBackground,
  type ShellBackground,
  type ShellBackgroundMode,
  type ShellConfig,
  type ShellModalStyling,
  type ShellStyling,
} from "@/lib/custom-shell"
import { cn } from "@/lib/utils"

type StylingSettingsProps = {
  config: ShellConfig
  onConfigChange: (config: ShellConfig) => void
}

export function StylingSettings({
  config,
  onConfigChange,
}: StylingSettingsProps) {
  const styling = config.styling
  const isFlat = styling.gutter === 0

  const update = (patch: Partial<ShellStyling>) =>
    onConfigChange({ ...config, styling: { ...styling, ...patch } })
  const updateContent = (patch: Partial<ShellBackground>) =>
    update({ content: { ...styling.content, ...patch } })
  const updateChrome = (patch: Partial<ShellBackground>) =>
    update({ chrome: { ...styling.chrome, ...patch } })
  const updateBorderColor = (patch: Partial<ShellBackground>) =>
    update({ cardBorderColor: { ...styling.cardBorderColor, ...patch } })
  const updateDividerColor = (patch: Partial<ShellBackground>) =>
    update({ dividerColor: { ...styling.dividerColor, ...patch } })

  const modal = styling.modal
  const updateModal = (patch: Partial<ShellModalStyling>) =>
    update({ modal: { ...modal, ...patch } })
  const updateModalBackground = (patch: Partial<ShellBackground>) =>
    updateModal({ background: { ...modal.background, ...patch } })
  const updateModalBorderColor = (patch: Partial<ShellBackground>) =>
    updateModal({ borderColor: { ...modal.borderColor, ...patch } })
  const updateModalCardBackground = (patch: Partial<ShellBackground>) =>
    updateModal({ cardBackground: { ...modal.cardBackground, ...patch } })
  const updateModalCardBorderColor = (patch: Partial<ShellBackground>) =>
    updateModal({ cardBorderColor: { ...modal.cardBorderColor, ...patch } })

  const contentBackground = resolveBackground(styling.content)
  const borderColor = resolveBackground(styling.cardBorderColor, {
    base: "--muted-foreground",
  })

  return (
    <CardGroup>
      <CollapsibleSettingsCard
        storageId="styling-spacing"
        title="Spacing & borders"
        description="Adjust the content gutter and card borders for this workspace. Changes preview live and save themselves."
        contentClassName="space-y-6"
      >
        <SliderRow
          label="Content spacing"
          value={styling.gutter}
          min={MIN_CONTENT_GUTTER}
          max={MAX_CONTENT_GUTTER}
          valueLabel={`${styling.gutter}px`}
          onChange={(gutter) => update({ gutter })}
          help="The outer padding and the gap between cards. Set to 0 for a flat layout with no card borders, rounded corners, or spacing."
        />

        <SliderRow
          label="Card border"
          value={styling.cardBorderWidth}
          min={0}
          max={MAX_CARD_BORDER_WIDTH}
          valueLabel={
            isFlat || styling.cardBorderWidth === 0
              ? "Off"
              : `${styling.cardBorderWidth}px`
          }
          disabled={isFlat}
          onChange={(cardBorderWidth) => update({ cardBorderWidth })}
          help={
            isFlat
              ? "Card and table borders are off while content spacing is 0 (flat mode)."
              : "Border thickness around cards and tables. 0 removes the border."
          }
        />

        <div className="grid gap-3">
          <div className="grid gap-0.5">
            <Label>Border color</Label>
            <p className="text-xs text-muted-foreground">
              The color of card and table borders.
            </p>
          </div>
          <BackgroundField
            idPrefix="card-border-color"
            value={styling.cardBorderColor}
            disabled={isFlat}
            defaultHint="A subtle default border that adapts to light and dark."
            onChange={updateBorderColor}
          />
        </div>

        <div className="grid gap-2">
          <Label>Preview</Label>
          <div
            data-content-styling=""
            data-flat={isFlat ? "true" : undefined}
            className={cn(
              "flex max-w-lg flex-col overflow-hidden rounded-lg border border-border",
              contentBackground ? undefined : "bg-muted/60"
            )}
            style={
              {
                padding: styling.gutter,
                gap: styling.gutter,
                backgroundColor: contentBackground,
                "--shell-card-border-width": String(styling.cardBorderWidth),
                ...(borderColor
                  ? { "--shell-card-border-color": borderColor }
                  : {}),
              } as React.CSSProperties
            }
          >
            <Card size="sm">
              <CardHeader>
                <CardTitle>Card title</CardTitle>
                <CardDescription>Sample content card</CardDescription>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                Spacing, borders, and background update as you change the
                settings above.
              </CardContent>
            </Card>
            <Card size="sm">
              <CardContent className="text-sm text-muted-foreground">
                A second card shows the gap between cards.
              </CardContent>
            </Card>
          </div>
        </div>
      </CollapsibleSettingsCard>

      <CollapsibleSettingsCard
        storageId="styling-divider"
        title="Divider lines"
        description="The thin lines inside cards and tables, and the sidebar edge. The whole admin area recolors live as you adjust this."
        contentClassName="space-y-6"
      >
        <BackgroundField
          idPrefix="divider-color"
          value={styling.dividerColor}
          defaultHint="Uses the theme's own divider color (adapts to light and dark)."
          onChange={updateDividerColor}
        />

        <div className="grid gap-2">
          <Label>Preview</Label>
          <div className="max-w-lg overflow-hidden rounded-lg border">
            <div className="border-b bg-muted/30 px-4 py-2 text-sm font-medium">
              Section header
            </div>
            <div className="border-b px-4 py-2 text-sm text-muted-foreground">
              A row, separated by a divider.
            </div>
            <div className="px-4 py-2 text-sm text-muted-foreground">
              The last row has no divider under it.
            </div>
          </div>
        </div>
      </CollapsibleSettingsCard>

      <CollapsibleSettingsCard
        storageId="styling-content"
        title="Main content area"
        description="The background behind your pages and cards."
      >
        <BackgroundField
          idPrefix="content-bg"
          value={styling.content}
          defaultHint="Uses the standard muted canvas (adapts to light and dark)."
          onChange={updateContent}
        />
      </CollapsibleSettingsCard>

      <CollapsibleSettingsCard
        storageId="styling-chrome"
        title="Sidebar & sticky bar"
        description="The background of the sidebar rail and the sticky top bar."
      >
        <BackgroundField
          idPrefix="chrome-bg"
          value={styling.chrome}
          defaultHint="Uses the theme's sidebar color (adapts to light and dark)."
          onChange={updateChrome}
        />
      </CollapsibleSettingsCard>

      <CollapsibleSettingsCard
        storageId="styling-modal"
        title="Modal"
        description="Dialogs like Send Feedback. Changes apply to any open modal live."
        contentClassName="space-y-6"
      >
        <SliderRow
          label="Backdrop dimming"
          value={modal.overlayOpacity}
          min={0}
          max={100}
          valueLabel={`${modal.overlayOpacity}%`}
          onChange={(overlayOpacity) => updateModal({ overlayOpacity })}
          help="How dark the area outside the modal gets."
        />

        <SliderRow
          label="Inner spacing"
          value={modal.padding}
          min={0}
          max={MAX_MODAL_PADDING}
          valueLabel={`${modal.padding}px`}
          onChange={(padding) => updateModal({ padding })}
          help="Padding between the modal edge and its content."
        />

        <div className="grid gap-3">
          <Label>Background</Label>
          <BackgroundField
            idPrefix="modal-bg"
            value={modal.background}
            defaultHint="Uses the theme's popover surface."
            onChange={updateModalBackground}
          />
        </div>

        <SliderRow
          label="Border"
          value={modal.borderWidth}
          min={0}
          max={MAX_CARD_BORDER_WIDTH}
          valueLabel={modal.borderWidth === 0 ? "Off" : `${modal.borderWidth}px`}
          onChange={(borderWidth) => updateModal({ borderWidth })}
          help="Modal border thickness. 0 removes it."
        />

        <div className="grid gap-3">
          <div className="grid gap-0.5">
            <Label>Border color</Label>
          </div>
          <BackgroundField
            idPrefix="modal-border"
            value={modal.borderColor}
            disabled={modal.borderWidth === 0}
            defaultHint="A subtle default border."
            onChange={updateModalBorderColor}
          />
        </div>

        <ModalPreview modal={modal} />
      </CollapsibleSettingsCard>

      <CollapsibleSettingsCard
        storageId="styling-modal-cards"
        title="Cards inside modals"
        description="The bordered sections within a modal (like the feedback list)."
        contentClassName="space-y-6"
      >
        <div className="grid gap-3">
          <Label>Background</Label>
          <BackgroundField
            idPrefix="modal-card-bg"
            value={modal.cardBackground}
            defaultHint="Uses the theme's card surface."
            onChange={updateModalCardBackground}
          />
        </div>

        <SliderRow
          label="Border"
          value={modal.cardBorderWidth}
          min={0}
          max={MAX_CARD_BORDER_WIDTH}
          valueLabel={
            modal.cardBorderWidth === 0 ? "Off" : `${modal.cardBorderWidth}px`
          }
          onChange={(cardBorderWidth) => updateModal({ cardBorderWidth })}
          help="Border thickness of cards inside the modal. 0 removes it."
        />

        <div className="grid gap-3">
          <div className="grid gap-0.5">
            <Label>Border color</Label>
          </div>
          <BackgroundField
            idPrefix="modal-card-border"
            value={modal.cardBorderColor}
            disabled={modal.cardBorderWidth === 0}
            defaultHint="A subtle default border."
            onChange={updateModalCardBorderColor}
          />
        </div>

        <ModalPreview modal={modal} />
      </CollapsibleSettingsCard>
    </CardGroup>
  )
}

function ModalPreview({ modal }: { modal: ShellModalStyling }) {
  return (
    <div className="grid gap-2">
      <Label>Preview</Label>
      <div className="relative max-w-lg overflow-hidden rounded-lg bg-muted/40 p-4">
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
    </div>
  )
}

const BACKGROUND_MODE_LABELS: Record<ShellBackgroundMode, string> = {
  default: "Theme default",
  muted: "Muted (adjustable)",
  custom: "Custom color",
}

function BackgroundField({
  idPrefix,
  value,
  disabled,
  defaultHint,
  onChange,
}: {
  idPrefix: string
  value: ShellBackground
  /** Greyed out when the thing it colors is switched off (flat mode, no border). */
  disabled?: boolean
  defaultHint: string
  onChange: (patch: Partial<ShellBackground>) => void
}) {
  const color = /^#[0-9a-fA-F]{6}$/.test(value.color) ? value.color : "#ffffff"

  return (
    <div className="grid gap-6">
      <div className="grid gap-2">
        <Label htmlFor={`${idPrefix}-mode`}>Mode</Label>
        <Select
          value={value.mode}
          disabled={disabled}
          onValueChange={(mode) =>
            onChange({ mode: mode as ShellBackgroundMode })
          }
        >
          <SelectTrigger id={`${idPrefix}-mode`} className="w-48">
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
        {value.mode === "default" ? (
          <p className="text-xs text-muted-foreground">{defaultHint}</p>
        ) : null}
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
          <Label htmlFor={`${idPrefix}-color`}>Color</Label>
          <div className="flex items-center gap-2">
            <input
              id={`${idPrefix}-color`}
              type="color"
              value={color}
              disabled={disabled}
              onChange={(event) => onChange({ color: event.target.value })}
              className="h-8 w-12 cursor-pointer rounded-md border border-border bg-background p-1 disabled:cursor-not-allowed disabled:opacity-50"
              aria-label="Pick a color"
            />
            <Input
              value={value.color}
              disabled={disabled}
              onChange={(event) => onChange({ color: event.target.value })}
              placeholder="#ffffff"
              className="w-40"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            A custom color stays the same in light and dark mode.
          </p>
        </div>
      ) : null}
    </div>
  )
}

function SliderRow({
  label,
  value,
  min,
  max,
  step = 1,
  valueLabel,
  disabled,
  onChange,
  help,
}: {
  label: string
  value: number
  min: number
  max: number
  step?: number
  valueLabel: string
  disabled?: boolean
  onChange: (value: number) => void
  help?: string
}) {
  return (
    <div className="grid gap-2">
      <div className="grid max-w-sm gap-2">
        <div className="flex items-center justify-between">
          <Label>{label}</Label>
          <span className="text-xs tabular-nums text-muted-foreground">
            {valueLabel}
          </span>
        </div>
        <Slider
          min={min}
          max={max}
          step={step}
          value={[value]}
          disabled={disabled}
          onValueChange={(next) => onChange(next[0] ?? min)}
        />
      </div>
      {help ? <p className="text-xs text-muted-foreground">{help}</p> : null}
    </div>
  )
}
