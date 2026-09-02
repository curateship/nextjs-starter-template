import { CollapsibleSettingsCard } from "@/components/settings/collapsible-settings-card"
import { SettingsSliderRow } from "@/components/settings/settings-slider-row"
import { CardGroup } from "@/components/ui/card"
import { FieldLabel } from "@/components/ui/field-label"
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
  type PublicTheme,
  type PublicThemeFont,
} from "@/lib/public-theme"

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

  return (
    <CardGroup>
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
