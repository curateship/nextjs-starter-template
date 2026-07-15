import * as React from "react"

export const pomoderBackgrounds = [
  "lofi",
  "ambient",
  "plain",
  "stars",
  "rain",
  "forest",
  "ocean",
  "fireplace",
] as const
export type PomoderBackground = (typeof pomoderBackgrounds)[number]

export const PomoderBackgroundContext = React.createContext<{
  background: PomoderBackground
  chooseBackground: (id: PomoderBackground) => void
} | null>(null)

export function usePomoderBackground() {
  const context = React.useContext(PomoderBackgroundContext)
  if (!context)
    throw new Error("usePomoderBackground must be used inside PomoderShell")
  return context
}
