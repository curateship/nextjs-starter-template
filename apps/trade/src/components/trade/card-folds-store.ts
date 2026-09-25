import * as React from "react"

import type { CardFolds } from "@/lib/trade/card-folds"

/**
 * Where the remembered folds live while a window is open.
 *
 * Split from the provider that fills it so each file exports one kind of
 * thing: a component there, a hook here. Nothing outside these two files ever
 * touches the context itself.
 */
export type FoldStore = {
  folds: CardFolds
  setFold: (id: string, open: boolean) => void
}

export const FoldContext = React.createContext<FoldStore | null>(null)

/**
 * How one card should be folded, and how to say it changed.
 *
 * Works with no provider above it, so an `OptionCard` dropped anywhere still
 * folds — it just forgets when the window closes.
 */
export function useCardFold(
  id: string,
  defaultOpen: boolean
): [boolean, (open: boolean) => void] {
  const store = React.useContext(FoldContext)
  // The answer is already here when there is a provider above — it was read
  // with the page — so a card is drawn the right way round on its very first
  // frame rather than folding itself a moment after you look at it.
  const [own, setOwn] = React.useState(store?.folds[id] ?? defaultOpen)

  const set = React.useCallback(
    (open: boolean) => {
      setOwn(open)
      store?.setFold(id, open)
    },
    [id, store]
  )

  return [own, set]
}
