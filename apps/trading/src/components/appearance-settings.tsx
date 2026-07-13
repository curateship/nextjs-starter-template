import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardGroup,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"
import { useTheme } from "@/pages/dashboard/sticky-header/light-dark-switcher"

export function AppearanceSettings() {
  const { darkBrightness, setDarkBrightness } = useTheme()

  return (
    <CardGroup>
      <Card>
        <CardHeader>
          <CardTitle>Dark theme</CardTitle>
          <CardDescription>
            Lighten dark surfaces without changing the light theme. This choice
            is saved only in this browser.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="dark-theme-brightness">
                Dark theme brightness
              </Label>
              <span className="text-sm tabular-nums text-muted-foreground">
                {darkBrightness}%
              </span>
            </div>
            <Slider
              id="dark-theme-brightness"
              aria-label="Dark theme brightness"
              value={[darkBrightness]}
              onValueChange={([brightness]) =>
                setDarkBrightness(brightness ?? 0)
              }
              aria-valuetext={`${darkBrightness}% lighter`}
            />
            <div className="grid grid-cols-3 text-xs text-muted-foreground">
              <span>Near black</span>
              <span className="text-center">Dark gray</span>
              <span className="text-right">Gray</span>
            </div>
          </div>

          <div className="dark grid grid-cols-3 gap-2 rounded-lg bg-background p-3 text-foreground ring-1 ring-foreground/10">
            <div className="rounded-md border bg-background p-2 text-center text-xs">
              Background
            </div>
            <div className="rounded-md border bg-card p-2 text-center text-xs">
              Cards
            </div>
            <div className="rounded-md border bg-muted p-2 text-center text-xs">
              Muted
            </div>
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={darkBrightness === 0}
            onClick={() => setDarkBrightness(0)}
          >
            Reset to default
          </Button>
        </CardContent>
      </Card>
    </CardGroup>
  )
}
