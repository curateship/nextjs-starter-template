"use client"

import { MoonIcon, SunIcon } from "lucide-react"

import { useTheme } from "@/components/shell/sticky-header/light-dark-switcher"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"

const themeOptions = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
] as const

export function ThemeToggle({ className }: { className?: string }) {
  const { setTheme } = useTheme()

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex">
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className={className}
                data-nav-shape="icon"
                aria-label="Choose colour mode"
              >
                <SunIcon className="size-4 rotate-0 scale-100 transition-all motion-reduce:transition-none dark:-rotate-90 dark:scale-0" />
                <MoonIcon className="absolute size-4 rotate-90 scale-0 transition-all motion-reduce:transition-none dark:rotate-0 dark:scale-100" />
              </Button>
            </DropdownMenuTrigger>
          </span>
        </TooltipTrigger>
        <TooltipContent>Colour mode</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end">
        {themeOptions.map((option) => (
          <DropdownMenuItem
            key={option.value}
            onSelect={() => setTheme(option.value)}
          >
            {option.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
