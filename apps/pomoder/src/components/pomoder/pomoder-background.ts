import * as React from "react"

import type { BackgroundReference } from "@/lib/background-catalog"

export const PomoderBackgroundContext = React.createContext<{
  background: BackgroundReference
  chooseBackground: (reference: BackgroundReference) => void
} | null>(null)

export function usePomoderBackground() {
  const context = React.useContext(PomoderBackgroundContext)
  if (!context)
    throw new Error("usePomoderBackground must be used inside PomoderShell")
  return context
}
