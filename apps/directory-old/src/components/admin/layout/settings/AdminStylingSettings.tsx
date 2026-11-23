"use client"

import * as React from "react"

import {
  Card,
  CardContent,
  CardDescription,
  CardGroup,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { HexColorInput } from "@/components/ui/hex-color-input"
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
  type AdminBackground,
  type AdminBackgroundMode,
  type AdminModalStyling,
  type AdminStyling,
} from "@/lib/utils/admin-styling"
import { cn } from "@/lib/utils/tailwind"

type AdminStylingSettingsProps = {
  styling: AdminStyling
  isSaving: boolean
  onChange: (styling: AdminStyling) => void
}

export function AdminStylingSettings({
  styling,
  isSaving,
  onChange,
}: AdminStylingSettingsProps) {
  const isFlat = styling.gutter === 0

  const update = (patch: Partial<AdminStyling>) => onChange({ ...styling, ...patch })
  const updateContent = (patch: Partial<AdminBackground>) =>
    update({ content: { ...styling.content, ...patch } })
  const updateChrome = (patch: Partial<AdminBackground>) =>
    update({ chrome: { ...styling.chrome, ...patch } })
  const updateBorderColor = (patch: Partial<AdminBackground>) =>
    update({ cardBorderColor: { ...styling.cardBorderColor, ...patch } })
  const updateDividerColor = (patch: Partial<AdminBackground>) =>
    update({ dividerColor: { ...styling.dividerColor, ...patch } })

  const modal = styling.modal
  const updateModal = (patch: Partial<AdminModalStyling>) =>
    update({ modal: { ...modal, ...patch } })
  const updateModalBackground = (patch: Partial<AdminBackground>) =>
    updateModal({ background: { ...modal.background, ...patch } })
  const updateModalBorderColor = (patch: Partial<AdminBackground>) =>
    updateModal({ borderColor: { ...modal.borderColor, ...patch } })
  const updateModalCardBackground = (patch: Partial<AdminBackground>) =>
    updateModal({ cardBackground: { ...modal.cardBackground, ...patch } })
  const updateModalCardBorderColor = (patch: Partial<AdminBackground>) =>
    updateModal({ cardBorderColor: { ...modal.cardBorderColor, ...patch } })

  const contentBackground = resolveBackground(styling.content)
  const borderColor = resolveBackground(styling.cardBorderColor, {
    base: "--muted-foreground",
  })

  return (
    <CardGroup className="grid gap-3">
      <Card>
        <CardHeader>
          <CardTitle>Spacing & borders</CardTitle>
          <CardDescription>
            Adjust the content gutter and card borders for the admin area. Changes
            preview live and persist when you save.
          </CardDescription>
        </CardHeader>
        <CardContent className="gap-6">
          <SliderRow
            label="Content spacing"
            value={styling.gutter}
            min={MIN_CONTENT_GUTTER}
            max={MAX_CONTENT_GUTTER}
            valueLabel={`${styling.gutter}px`}
            disabled={isSaving}
            onChange={(gutter) => update({ gutter })}
            help="One spacing value for the page area: the outer padding of the page canvas and the gaps between cards. Set to 0 for a flat layout with no card borders, rounded corners, or spacing. Modals have their own Inner spacing setting (in the Modal card below)."
          />

          <SliderRow
            label="Card border"
            value={styling.cardBorderWidth}
            min={0}
            max={MAX_CARD_BORDER_WIDTH}
            valueLabel={
              isFlat || styling.cardBorderWidth === 0 ? "Off" : `${styling.cardBorderWidth}px`
            }
            disabled={isSaving || isFlat}
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
              isSaving={isSaving || isFlat}
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
                  ...(borderColor ? { "--shell-card-border-color": borderColor } : {}),
                } as React.CSSProperties
              }
            >
              <Card>
                <CardHeader>
                  <CardTitle>Card title</CardTitle>
                  <CardDescription>Sample content card</CardDescription>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  Spacing, borders, and background update as you change the settings
                  above.
                </CardContent>
              </Card>
              <Card>
                <CardContent className="text-sm text-muted-foreground">
                  A second card shows the gap between cards.
                </CardContent>
              </Card>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Divider lines</CardTitle>
          <CardDescription>
            The thin lines inside cards and tables, the sidebar edge, and chart
            gridlines. The whole admin area recolors live as you adjust this.
          </CardDescription>
        </CardHeader>
        <CardContent className="gap-6">
          <BackgroundField
            idPrefix="divider-color"
            value={styling.dividerColor}
            isSaving={isSaving}
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
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Main content area</CardTitle>
          <CardDescription>The background behind your pages and cards.</CardDescription>
        </CardHeader>
        <CardContent className="gap-6">
          <BackgroundField
            idPrefix="content-bg"
            value={styling.content}
            isSaving={isSaving}
            defaultHint="Uses the standard admin canvas (adapts to light and dark)."
            onChange={updateContent}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sidebar & sticky bar</CardTitle>
          <CardDescription>
            The background of the sidebar rail and the sticky top bar.
          </CardDescription>
        </CardHeader>
        <CardContent className="gap-6">
          <BackgroundField
            idPrefix="chrome-bg"
            value={styling.chrome}
            isSaving={isSaving}
            defaultHint="Uses the theme's sidebar color (adapts to light and dark)."
            onChange={updateChrome}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Modal</CardTitle>
          <CardDescription>
            Dialogs across the admin area. Changes apply to any open modal live.
          </CardDescription>
        </CardHeader>
        <CardContent className="gap-6">
          <SliderRow
            label="Inner spacing"
            value={modal.padding}
            min={0}
            max={MAX_MODAL_PADDING}
            valueLabel={`${modal.padding}px`}
            disabled={isSaving}
            onChange={(padding) => updateModal({ padding })}
            help="Padding inside the modal and the gaps between its sections and cards."
          />

          <SliderRow
            label="Backdrop dimming"
            value={modal.overlayOpacity}
            min={0}
            max={100}
            valueLabel={`${modal.overlayOpacity}%`}
            disabled={isSaving}
            onChange={(overlayOpacity) => updateModal({ overlayOpacity })}
            help="How dark the area outside the modal gets."
          />

          <div className="grid gap-3">
            <Label>Background</Label>
            <BackgroundField
              idPrefix="modal-bg"
              value={modal.background}
              isSaving={isSaving}
              defaultHint="Uses the theme's dialog surface."
              onChange={updateModalBackground}
            />
          </div>

          <SliderRow
            label="Border"
            value={modal.borderWidth}
            min={0}
            max={MAX_CARD_BORDER_WIDTH}
            valueLabel={modal.borderWidth === 0 ? "Off" : `${modal.borderWidth}px`}
            disabled={isSaving}
            onChange={(borderWidth) => updateModal({ borderWidth })}
            help="Modal border thickness. 0 removes it."
          />

          <div className="grid gap-3">
            <Label>Border color</Label>
            <BackgroundField
              idPrefix="modal-border"
              value={modal.borderColor}
              isSaving={isSaving || modal.borderWidth === 0}
              defaultHint="A subtle default border."
              onChange={updateModalBorderColor}
            />
          </div>

          <ModalPreview modal={modal} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Cards inside modals</CardTitle>
          <CardDescription>The bordered sections within a modal.</CardDescription>
        </CardHeader>
        <CardContent className="gap-6">
          <div className="grid gap-3">
            <Label>Background</Label>
            <BackgroundField
              idPrefix="modal-card-bg"
              value={modal.cardBackground}
              isSaving={isSaving}
              defaultHint="Uses the theme's card surface."
              onChange={updateModalCardBackground}
            />
          </div>

          <SliderRow
            label="Border"
            value={modal.cardBorderWidth}
            min={0}
            max={MAX_CARD_BORDER_WIDTH}
            valueLabel={modal.cardBorderWidth === 0 ? "Off" : `${modal.cardBorderWidth}px`}
            disabled={isSaving}
            onChange={(cardBorderWidth) => updateModal({ cardBorderWidth })}
            help="Border thickness of cards inside the modal. 0 removes it."
          />

          <div className="grid gap-3">
            <Label>Border color</Label>
            <BackgroundField
              idPrefix="modal-card-border"
              value={modal.cardBorderColor}
              isSaving={isSaving || modal.cardBorderWidth === 0}
              defaultHint="A subtle default border."
              onChange={updateModalCardBorderColor}
            />
          </div>

          <ModalPreview modal={modal} />
        </CardContent>
      </Card>
    </CardGroup>
  )
}

function ModalPreview({ modal }: { modal: AdminModalStyling }) {
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
        {/* Mimics the real dialog structure so the modal CSS variables preview
            here. Padding + gap are inlined from the live Inner-spacing value so
            the preview tracks the slider without depending on the root var. */}
        <div
          data-slot="dialog-content"
          className="relative mx-auto flex max-w-sm flex-col overflow-hidden rounded-xl"
          style={{ padding: modal.padding, gap: modal.padding }}
        >
          <div data-slot="dialog-header" className="flex flex-col gap-1 text-left">
            <div className="text-base leading-none font-medium">Dialog title</div>
            <div className="text-sm text-muted-foreground">
              A sample modal so styling previews here.
            </div>
          </div>
          <Card>
            <CardContent className="text-sm text-muted-foreground">
              A card inside the modal.
            </CardContent>
          </Card>
          <Card>
            <CardContent className="text-sm text-muted-foreground">
              A second card inside the modal.
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

const BACKGROUND_MODE_LABELS: Record<AdminBackgroundMode, string> = {
  default: "Theme default",
  muted: "Muted (adjustable)",
  custom: "Custom color",
}

function BackgroundField({
  idPrefix,
  value,
  isSaving,
  defaultHint,
  onChange,
}: {
  idPrefix: string
  value: AdminBackground
  isSaving: boolean
  defaultHint: string
  onChange: (patch: Partial<AdminBackground>) => void
}) {
  return (
    <div className="grid gap-6">
      <div className="grid gap-2">
        <Label htmlFor={`${idPrefix}-mode`}>Mode</Label>
        <Select
          value={value.mode}
          disabled={isSaving}
          onValueChange={(mode) => onChange({ mode: mode as AdminBackgroundMode })}
        >
          <SelectTrigger id={`${idPrefix}-mode`} className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="default">{BACKGROUND_MODE_LABELS.default}</SelectItem>
            <SelectItem value="muted">{BACKGROUND_MODE_LABELS.muted}</SelectItem>
            <SelectItem value="custom">{BACKGROUND_MODE_LABELS.custom}</SelectItem>
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
          disabled={isSaving}
          onChange={(strength) => onChange({ strength })}
          help="How strong the muted tone is. Lower is more transparent."
        />
      ) : null}

      {value.mode === "custom" ? (
        <div className="grid gap-2">
          <Label htmlFor={`${idPrefix}-color`}>Color</Label>
          <HexColorInput
            id={`${idPrefix}-color`}
            value={value.color}
            disabled={isSaving}
            onColorChange={(color) => onChange({ color })}
          />
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
