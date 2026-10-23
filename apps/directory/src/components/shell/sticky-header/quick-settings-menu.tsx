"use client"

import * as React from "react"
import { SettingsIcon } from "lucide-react"

import { useTheme } from "@/components/shell/sticky-header/light-dark-switcher"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { QuickSettingRow } from "@/components/ui/quick-setting-row"
import { Separator } from "@/components/ui/separator"
import { ThemeSwitcher, type ThemeMode } from "@/components/ui/theme-switcher"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  appQuickSettingsForRole,
  type AppQuickSetting,
  type AppQuickSettingProps,
} from "@/lib/app-options"

const lazyRows = new Map<
  AppQuickSetting["component"],
  React.LazyExoticComponent<React.ComponentType<AppQuickSettingProps>>
>()

/**
 * One app-owned row, loaded the first time the menu is opened.
 *
 * Kept in a map for the same reason the header action is: `React.lazy` makes a
 * new component type on every call, and a new type unmounts and remounts the
 * row each time the menu opens, which would flick a switch back to its
 * starting value in front of whoever just moved it.
 */
function AppQuickSettingRow({
  row,
  role,
}: {
  row: AppQuickSetting
  role: string
}) {
  let Row = lazyRows.get(row.component)
  if (!Row) {
    Row = React.lazy(row.component)
    lazyRows.set(row.component, Row)
  }

  return (
    <React.Suspense fallback={null}>
      {React.createElement(Row, { role })}
    </React.Suspense>
  )
}

/**
 * The cog in the signed-in header: colour mode, and whatever the app running
 * on this shell puts under it.
 *
 * **The menu is the shell's and the rows are the app's.** Every app has a
 * colour mode and no two apps have the same switches after that — Trade hides
 * profit and loss, and the next app will want something else entirely. So the
 * cog, its place in the Top right menu, the panel and the row spacing are
 * written once here, and `header.quickSettings` in an app's options says what
 * goes under the line. An app with nothing to add gets a menu of colour mode
 * alone, which is what the old standalone theme button was.
 *
 * A panel rather than a dropdown menu of commands. Each row holds a control
 * somebody changes and then looks at, and a menu that closes on the first
 * press would make changing two things two visits.
 */
export function QuickSettingsMenu({ role }: { role: string }) {
  const { theme, setTheme } = useTheme()
  const rows = appQuickSettingsForRole(role)

  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex">
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                data-nav-shape="icon"
                aria-label="Settings"
              >
                <SettingsIcon className="size-4" />
              </Button>
            </PopoverTrigger>
          </span>
        </TooltipTrigger>
        <TooltipContent>Settings</TooltipContent>
      </Tooltip>
      <PopoverContent align="end" sideOffset={8} className="grid w-72 gap-3">
        <QuickSettingRow label="Colour mode">
          <ThemeSwitcher
            value={theme as ThemeMode}
            onChange={(mode) => setTheme(mode)}
          />
        </QuickSettingRow>
        {rows.length > 0 ? <Separator /> : null}
        {rows.map((row) => (
          <AppQuickSettingRow key={row.id} row={row} role={role} />
        ))}
      </PopoverContent>
    </Popover>
  )
}
