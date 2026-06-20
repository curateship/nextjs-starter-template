import { Settings } from "lucide-react"

import { ThemeSwitcher, type ThemeMode } from "@/components/kibo-ui/theme-switcher"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

export function AppTitleBar({
  theme,
  onOpenSettings,
  onThemeChange,
}: {
  theme: ThemeMode
  onOpenSettings: () => void
  onThemeChange: (theme: ThemeMode) => void
}) {
  return (
    <header className="flex h-[46px] min-h-0 items-center bg-background">
      <div className="titlebar-drag h-full flex-1" data-tauri-drag-region="" />
      <div className="flex h-full items-center gap-2 px-3">
        <ThemeSwitcher value={theme} onChange={onThemeChange} className="shrink-0" />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={onOpenSettings}
              aria-label="Open settings"
            >
              <Settings />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Settings</TooltipContent>
        </Tooltip>
      </div>
    </header>
  )
}
