import { BackdropLookFields } from "@/components/pomodoro/backdrop-look-controls"
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
import { useProductAuth } from "@/lib/pomodoro/auth-state"
import {
  DARK_SHADES,
  darkShade,
  isDarkShadeId,
  useDarkShade,
} from "@/lib/pomodoro/dark-shade"
import { useAppliedDark } from "@/lib/pomodoro/use-applied-dark"

const THEME_CHOICES = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System, the same as this device" },
] as const

type ThemeChoice = (typeof THEME_CHOICES)[number]["value"]

function isThemeChoice(value: string): value is ThemeChoice {
  return THEME_CHOICES.some((choice) => choice.value === value)
}

/**
 * The Appearance card on the Settings screen: light, dark or the device's
 * own setting, then how dark the dark mode is. The theme uses the same setter
 * as the photo menu's Dark mode row, so the two always agree. A guest is
 * always dark (`guest-theme.ts`), so a guest gets a line saying so in place
 * of the theme choice, and still picks the shade. The four shade steps go
 * from the old app's near black up to a soft grey, and the swatch beside each
 * name is that step's canvas colour. Both choices save in this browser.
 *
 * Under them, the scene behind the timer: a dim slider and the slow drift on
 * picture backgrounds, saved in a member's settings and in a guest's browser.
 */
export default function AppearanceSettingsPanel() {
  const { shade, chooseDarkShade } = useDarkShade()
  const { theme, setTheme } = useTheme()
  const dark = useAppliedDark()
  const { authenticated } = useProductAuth()
  const current = darkShade(shade)
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Appearance</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        {authenticated ? (
          <div className="grid gap-2">
            <Label htmlFor="theme-choice">Theme</Label>
            <Select
              value={theme}
              onValueChange={(value) => {
                if (isThemeChoice(value)) setTheme(value)
              }}
            >
              <SelectTrigger id="theme-choice">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {THEME_CHOICES.map((choice) => (
                  <SelectItem key={choice.value} value={choice.value}>
                    {choice.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Pomoder is dark for visitors. Sign in to choose light mode.
          </p>
        )}
        <div className="grid gap-2">
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
            {dark ? "" : " It shows once the theme is dark."}
          </p>
        </div>
        <BackdropLookFields />
      </CardContent>
    </Card>
  )
}
