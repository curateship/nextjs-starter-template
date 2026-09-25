"use client";

import type { CSSProperties } from "react";
import { useTheme } from "next-themes";
import { Toaster as Sonner, type ToasterProps } from "sonner";

import { useToastDurationMs } from "@/lib/toast-duration";

// Configured sonner Toaster shared across hub (admin + frontend sites),
// matching the rest of the monorepo: top-center, severity colors and a manual
// close button pinned top-right. Mounted (client-only) from DeferredScripts.
// `useTheme` is safe outside a provider — it falls back to "system" — and the
// `--normal-*` vars keep neutral toasts on-brand via the app's popover tokens.
export function Toaster({ ...props }: ToasterProps) {
  const { theme = "system" } = useTheme();
  // Set in Platform Settings; error toasts override it with Infinity.
  const duration = useToastDurationMs();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      position="top-center"
      duration={duration}
      closeButton
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
  );
}
