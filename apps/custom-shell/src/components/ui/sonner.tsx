import type { CSSProperties } from "react"
import { Toaster as Sonner, type ToasterProps } from "sonner"

import { useToastDurationMs } from "@/lib/toast-duration"
import { useTheme } from "@/pages/dashboard/sticky-header/light-dark-switcher"

function Toaster({ ...props }: ToasterProps) {
  const { theme } = useTheme()
  // Set in General settings; error toasts override it with Infinity.
  const duration = useToastDurationMs()

  return (
    <Sonner
      theme={theme}
      className="toaster group"
      position="top-center"
      duration={duration}
      closeButton
      // Color toasts by severity: green success, red error, amber warning,
      // blue info. Neutral `toast()` calls keep the popover styling below.
      richColors
      style={
        {
          // Above dialog overlays (z-50), so a failure reported while a modal
          // is open stays readable and its close button stays clickable. An
          // open Radix modal also sets pointer-events: none on <body>, which
          // the toaster inherits — re-enable it or toasts can't be dismissed
          // while a dialog is up.
          zIndex: 100,
          pointerEvents: "auto",
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
