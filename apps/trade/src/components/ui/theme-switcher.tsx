import { MonitorIcon, MoonIcon, SunIcon } from "lucide-react"

import { cn } from "@/lib/utils"

export type ThemeMode = "light" | "dark" | "system"

const MODES = [
  { key: "system", icon: MonitorIcon, label: "Follow the device" },
  { key: "light", icon: SunIcon, label: "Light" },
  { key: "dark", icon: MoonIcon, label: "Dark" },
] satisfies { key: ThemeMode; icon: typeof MonitorIcon; label: string }[]

/**
 * The three colour modes as one pill: follow the device, light, dark.
 *
 * A pill rather than a menu because all three answers fit on one row, and
 * seeing which of them is on beats opening something to find out. It is the
 * 32px control height with 24px buttons inside it, so it sits on a settings
 * row beside a switch without either looking bigger than the other.
 *
 * Controlled, and it stores nothing. Whoever draws it holds the choice, which
 * is what lets the same pill sit on a signed-in header and a public page
 * without either of them agreeing about where a theme is kept.
 */
export function ThemeSwitcher({
  value,
  onChange,
  className,
}: {
  value: ThemeMode
  onChange: (mode: ThemeMode) => void
  className?: string
}) {
  return (
    <div
      role="group"
      aria-label="Colour mode"
      className={cn(
        "relative flex h-8 shrink-0 items-center gap-0.5 rounded-full bg-muted p-1",
        className
      )}
    >
      {MODES.map(({ key, icon: Icon, label }) => (
        <button
          key={key}
          type="button"
          aria-label={label}
          aria-pressed={value === key}
          onClick={() => onChange(key)}
          className={cn(
            "relative size-6 rounded-full text-muted-foreground transition-colors",
            "hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
            value === key && "bg-background text-foreground shadow-sm"
          )}
        >
          <Icon aria-hidden className="m-auto size-3.5" />
        </button>
      ))}
    </div>
  )
}
