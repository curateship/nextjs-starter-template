import { TriangleAlertIcon } from "lucide-react"

import { CollapsibleSettingsCard } from "@/components/settings/collapsible-settings-card"
import { SettingsSliderRow } from "@/components/settings/settings-slider-row"
import { Button } from "@/components/ui/button"
import { CardGroup } from "@/components/ui/card"
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
  MAX_PUBLIC_RADIUS,
  PUBLIC_BRAND_COLOR_PATTERN,
  PUBLIC_THEME_FONTS,
  PUBLIC_THEME_FONT_LABELS,
  isPublicBrandColor,
  normalizePublicBrandOverrides,
  type PublicBrandOverrideKey,
  type PublicTheme,
  type PublicThemeFont,
} from "@/lib/public-theme"
import {
  derivePublicBrandColors,
  publicThemeContrast,
} from "@/lib/public-theme-colors"
import { showErrorToast } from "@/lib/toast/error-toast"

type PublicThemeSettingsProps = {
  theme: PublicTheme
  onThemeChange: (theme: PublicTheme) => void
}

export function PublicThemeSettings({
  theme,
  onThemeChange,
}: PublicThemeSettingsProps) {
  const update = (patch: Partial<PublicTheme>) =>
    onThemeChange({ ...theme, ...patch })
  const brandColorInvalid = !isPublicBrandColor(theme.brandColor)
  const colors = brandColorInvalid
    ? null
    : derivePublicBrandColors(theme.brandColor, theme.brandOverrides)
  const contrast = colors ? publicThemeContrast(colors) : null

  const updateBrandColor = (brandColor: string) => {
    update({
      brandColor,
      ...(brandColor === ""
        ? {
            brandOverrides: normalizePublicBrandOverrides(
              theme.brandOverrides
            ),
          }
        : {}),
    })
  }

  const updateOverride = (key: PublicBrandOverrideKey, value: string) => {
    update({
      brandOverrides: { ...theme.brandOverrides, [key]: value },
    })
  }

  const resetOverride = (key: PublicBrandOverrideKey) => {
    const brandOverrides = { ...theme.brandOverrides }
    delete brandOverrides[key]
    update({ brandOverrides })
  }

  return (
    <CardGroup>
      <CollapsibleSettingsCard
        storageId="public-look-brand-colour"
        title="Brand colour"
        description="Choose one colour for public buttons, links, and focus rings. The shell builds the related shades automatically."
        contentClassName="space-y-4"
      >
        <div className="grid gap-2">
          <FieldLabel
            htmlFor="public-theme-brand-colour"
            hint="Enter a 6-digit hex colour. Clear it to use the app's normal colour."
          >
            Brand colour
          </FieldLabel>
          <div className="flex flex-wrap items-center gap-2">
            <ColorSwatch
              aria-label="Pick brand colour"
              value={
                brandColorInvalid || !theme.brandColor
                  ? "#000000"
                  : theme.brandColor
              }
              onChange={(event) => updateBrandColor(event.target.value)}
            />
            <Input
              id="public-theme-brand-colour"
              value={theme.brandColor}
              placeholder="#3b82f6"
              className="w-full sm:w-40"
              aria-invalid={brandColorInvalid || undefined}
              onBlur={() => {
                if (brandColorInvalid) {
                  showErrorToast("Enter a 6-digit brand colour, like #3b82f6.")
                }
              }}
              onChange={(event) => updateBrandColor(event.target.value)}
            />
            {theme.brandColor ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => updateBrandColor("")}
              >
                Use app colour
              </Button>
            ) : null}
          </div>
          {contrast && !contrast.light.link ? (
            <ContrastWarning>
              Brand links are hard to read on the light background.
            </ContrastWarning>
          ) : null}
        </div>

        {colors ? (
          <div className="grid gap-4">
            <DerivedColourField
              id="public-theme-brand-hover"
              label="Hover colour"
              hint="Used while a pointer is over a public primary button."
              automatic={colors.light.hover}
              darkAutomatic={colors.dark.hover}
              value={theme.brandOverrides.hoverColor}
              onChange={(value) => updateOverride("hoverColor", value)}
              onReset={() => resetOverride("hoverColor")}
            />
            <DerivedColourField
              id="public-theme-brand-soft"
              label="Soft tint"
              hint="Used behind selected text and quiet brand highlights."
              automatic={colors.light.soft}
              darkAutomatic={colors.dark.soft}
              value={theme.brandOverrides.softColor}
              onChange={(value) => updateOverride("softColor", value)}
              onReset={() => resetOverride("softColor")}
            />
            <DerivedColourField
              id="public-theme-brand-foreground"
              label="Button text"
              hint="The text shown on top of the brand colour."
              automatic={colors.light.foreground}
              darkAutomatic={colors.dark.foreground}
              value={theme.brandOverrides.foregroundColor}
              warnings={[
                ...(contrast && !contrast.light.buttonText
                  ? ["Button text is hard to read in light mode."]
                  : []),
                ...(contrast && !contrast.dark.buttonText
                  ? ["Button text is hard to read in dark mode."]
                  : []),
              ]}
              onChange={(value) => updateOverride("foregroundColor", value)}
              onReset={() => resetOverride("foregroundColor")}
            />
            <DerivedColourField
              id="public-theme-brand-dark"
              label="Dark-mode brand"
              hint="The brand colour used when a visitor views the public site in dark mode."
              automatic={colors.dark.brand}
              value={theme.brandOverrides.darkColor}
              warnings={
                contrast && !contrast.dark.link
                  ? ["Brand links are hard to read on the dark background."]
                  : []
              }
              onChange={(value) => updateOverride("darkColor", value)}
              onReset={() => resetOverride("darkColor")}
            />
          </div>
        ) : null}
      </CollapsibleSettingsCard>

      <CollapsibleSettingsCard
        storageId="public-look-type-corners"
        title="Type & corners"
        description="Choose the public frontend's typeface and how rounded its controls and cards are."
        contentClassName="space-y-6"
      >
        <div className="grid gap-2">
          <FieldLabel
            htmlFor="public-theme-font"
            hint="All choices use fonts already on the device or bundled with this app."
          >
            Font
          </FieldLabel>
          <Select
            value={theme.font}
            onValueChange={(font) => update({ font: font as PublicThemeFont })}
          >
            <SelectTrigger id="public-theme-font" className="w-full sm:w-fit">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PUBLIC_THEME_FONTS.map((font) => (
                <SelectItem key={font} value={font}>
                  {PUBLIC_THEME_FONT_LABELS[font]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <SettingsSliderRow
          label="Corner rounding"
          value={theme.radius}
          min={0}
          max={MAX_PUBLIC_RADIUS}
          valueLabel={theme.radius === 0 ? "Square" : `${theme.radius}px`}
          help="10px is the app default. 0 makes corners square."
          onChange={(radius) => update({ radius })}
        />
      </CollapsibleSettingsCard>
    </CardGroup>
  )
}

function DerivedColourField({
  id,
  label,
  hint,
  automatic,
  darkAutomatic,
  value,
  warnings = [],
  onChange,
  onReset,
}: {
  id: string
  label: string
  hint: string
  automatic: string
  darkAutomatic?: string
  value?: string
  warnings?: string[]
  onChange: (value: string) => void
  onReset: () => void
}) {
  const manual = value !== undefined
  const shownValue = manual ? value : automatic
  const invalid = manual && !PUBLIC_BRAND_COLOR_PATTERN.test(value)
  const warningId = warnings.length ? `${id}-warning` : undefined

  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between gap-2">
        <FieldLabel htmlFor={id} hint={hint}>
          {label}
        </FieldLabel>
        <span className="text-xs text-muted-foreground">
          {manual ? "Manual" : "Automatic"}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <ColorSwatch
          aria-label={`Pick ${label.toLowerCase()}`}
          value={invalid ? automatic : shownValue}
          onChange={(event) => onChange(event.target.value)}
        />
        <Input
          id={id}
          value={shownValue}
          className="w-full sm:w-40"
          aria-invalid={invalid || undefined}
          aria-describedby={warningId}
          onBlur={() => {
            if (invalid) {
              showErrorToast("Enter a 6-digit colour, like #3b82f6.")
            }
          }}
          onChange={(event) => onChange(event.target.value)}
        />
        {manual ? (
          <Button
            type="button"
            variant="outline"
            aria-label={`Set ${label.toLowerCase()} back to automatic`}
            onClick={onReset}
          >
            Back to automatic
          </Button>
        ) : null}
      </div>
      {!manual && darkAutomatic && darkAutomatic !== automatic ? (
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <AutomaticColour label="Light" value={automatic} />
          <AutomaticColour label="Dark" value={darkAutomatic} />
        </div>
      ) : null}
      {warnings.length ? (
        <div id={warningId} className="grid gap-1" aria-live="polite">
          {warnings.map((warning) => (
            <ContrastWarning key={warning}>{warning}</ContrastWarning>
          ))}
        </div>
      ) : null}
    </div>
  )
}

function AutomaticColour({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex items-center gap-1">
      <span
        className="size-3 rounded-sm border"
        style={{ backgroundColor: value }}
        aria-hidden
      />
      {label}: {value}
    </span>
  )
}

function ContrastWarning({ children }: { children: string }) {
  return (
    <p className="flex items-start gap-1 text-xs text-muted-foreground">
      <TriangleAlertIcon className="mt-0.5 size-3 shrink-0" aria-hidden />
      <span>{children}</span>
    </p>
  )
}
