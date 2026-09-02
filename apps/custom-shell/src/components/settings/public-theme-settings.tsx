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
  PUBLIC_THEME_FONTS,
  PUBLIC_THEME_FONT_LABELS,
  isPublicBrandColor,
  type PublicTheme,
  type PublicThemeFont,
} from "@/lib/public-theme"
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

  return (
    <CardGroup>
      <CollapsibleSettingsCard
        storageId="public-look-brand-colour"
        title="Brand colour"
        description="Choose the colour used for buttons, links, and focus rings on this site's public pages."
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
              onChange={(event) => update({ brandColor: event.target.value })}
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
              onChange={(event) => update({ brandColor: event.target.value })}
            />
            {theme.brandColor ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => update({ brandColor: "" })}
              >
                Use app colour
              </Button>
            ) : null}
          </div>
        </div>
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
