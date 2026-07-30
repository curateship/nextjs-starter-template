"use client"

import * as React from "react"
import EyeIcon from "lucide-react/dist/esm/icons/eye.js"
import EyeOffIcon from "lucide-react/dist/esm/icons/eye-off.js"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

/**
 * A password input with a trailing show/hide toggle.
 *
 * The eye button reveals the entered text so people can confirm what they
 * typed. It is a real, keyboard-operable button with an accessible name and a
 * tooltip, per the icon-button rule; toggling only swaps the input type, so it
 * never changes the field's value or submit behavior.
 */
export function PasswordInput({
  className,
  ...props
}: Omit<React.ComponentProps<typeof Input>, "type">) {
  const [visible, setVisible] = React.useState(false)
  const label = visible ? "Hide password" : "Show password"
  const Icon = visible ? EyeOffIcon : EyeIcon

  return (
    <div className="relative">
      <Input
        type={visible ? "text" : "password"}
        className={cn("pr-9", className)}
        {...props}
      />
      <div className="absolute inset-y-0 right-1 flex items-center">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => setVisible((shown) => !shown)}
              aria-label={label}
              aria-pressed={visible}
              className="text-muted-foreground hover:text-foreground"
            >
              <Icon />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{label}</TooltipContent>
        </Tooltip>
      </div>
    </div>
  )
}
