import type { CSSProperties } from "react"
import { Toaster as Sonner, type ToasterProps } from "sonner"

import { useTheme } from "@/pages/dashboard/sticky-header/light-dark-switcher"

function Toaster({ ...props }: ToasterProps) {
  const { theme } = useTheme()

  return (
    <Sonner
      theme={theme}
      className="toaster group"
      position="top-center"
      duration={4000}
      closeButton
      // Color toasts by severity: green success, red error, amber warning,
      // blue info. Neutral `toast()` calls keep the popover styling below.
      richColors
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          // Pin the close (X) button to the top-right corner instead of
          // sonner's LTR default of top-left.
          "--toast-close-button-start": "unset",
          "--toast-close-button-end": "0",
          "--toast-close-button-transform": "translate(35%, -35%)",
        } as CSSProperties
      }
      {...props}
    />
  )
}

export { Toaster }
