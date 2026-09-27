import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useTheme } from "@/components/shell/sticky-header/light-dark-switcher"
import {
  DARK_SHADES,
  darkShade,
  isDarkShadeId,
  useDarkShade,
} from "@/lib/pomodoro/dark-shade"

/**
 * The Appearance card on the Settings screen: how dark the dark mode is.
 * The four steps go from the old app's near black up to a soft grey, and the
 * swatch beside each name is that step's canvas colour. The choice saves in
 * this browser, like the light/dark switch in the header.
 */
export default function AppearanceSettingsPanel() {
  const { shade, chooseDarkShade } = useDarkShade()
  const { theme } = useTheme()
  const light = theme === "light"
  const current = darkShade(shade)
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Appearance</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <Label htmlFor="dark-shade">Dark mode shade</Label>
        <Select
          value={shade}
          onValueChange={(value) => {
            if (isDarkShadeId(value)) chooseDarkShade(value)
          }}
        >
          <SelectTrigger id="dark-shade" aria-label="Dark mode shade">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DARK_SHADES.map((option) => (
              <SelectItem key={option.id} value={option.id}>
                <span className="flex items-center gap-2.5">
                  <span
                    className="size-4 shrink-0 rounded-full border border-[rgba(var(--p-fg-rgb),0.2)]"
                    style={{ background: option.swatch }}
                    aria-hidden="true"
                  />
                  {option.label}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-sm text-muted-foreground">
          {current.help}
          {light
            ? " You are in light mode, so switch the header's moon on to see it."
            : ""}
        </p>
      </CardContent>
    </Card>
  )
}
