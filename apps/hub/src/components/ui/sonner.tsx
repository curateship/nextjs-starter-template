"use client";

import type { CSSProperties } from "react";
import { useTheme } from "next-themes";
import { Toaster as Sonner, type ToasterProps } from "sonner";

// Configured sonner Toaster shared across hub (admin + frontend sites),
// matching the rest of the monorepo: top-center, severity colors, a manual
// close button pinned top-right, and a longer duration. Mounted (client-only)
// from DeferredScripts. `useTheme` is safe outside a provider — it falls back
// to "system" — and the `--normal-*` vars keep neutral toasts on-brand via the
// app's popover tokens.
export function Toaster({ ...props }: ToasterProps) {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      position="top-center"
      duration={10000}
      closeButton
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
  );
}
