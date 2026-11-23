import * as React from "react"

import {
  getCardFoldsErrorMessage,
  saveRememberedFolds,
} from "@/lib/api/trade/card-folds"
import { showErrorToast } from "@/lib/toast/error-toast"
import { FoldContext } from "@/components/trade/card-folds-store"
import type { CardFolds } from "@/lib/trade/card-folds"

/** How long a window must sit still before its folds are written down. */
const SETTLE_MS = 800

/**
 * Remembers which settings cards were left folded, for every `OptionCard`
 * underneath it.
 *
 * A context rather than props because the alternative is threading the same
 * two arguments through every card on every window, which is the sort of thing
 * that is right five times and forgotten the sixth.
 *
 * The answer arrives as `initial`, read in the route's loader with everything
 * else the page needs. Fetching it when a window opens would be too late: the
 * cards would draw open, and a moment later fold themselves in front of you.
 *
 * Saving waits for the window to sit still, because folding three cards in a
 * row is three writes to a database a long way off. Nothing on screen waits
 * for the write: the card has already moved, so a write that fails costs the
 * memory and nothing else — and it is never undone, because putting a card
 * back a second after somebody folded it is worse than forgetting it by the
 * next reload. The toast says which of the two happened.
 */
export function CardFolds({
  initial,
  children,
}: {
  initial: CardFolds
  children: React.ReactNode
}) {
  const [folds, setFolds] = React.useState(initial)
  const foldsRef = React.useRef(initial)
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  const write = React.useCallback((next: CardFolds) => {
    saveRememberedFolds(next).catch((error: unknown) => {
      showErrorToast(getCardFoldsErrorMessage(error))
    })
  }, [])

  // Closing the window with a fold still waiting out its pause would throw it
  // away, and the last thing somebody did is the thing they expect back.
  React.useEffect(() => {
    return () => {
      if (!timerRef.current) return
      clearTimeout(timerRef.current)
      timerRef.current = null
      write(foldsRef.current)
    }
  }, [write])

  const setFold = React.useCallback(
    (id: string, open: boolean) => {
      const next = { ...foldsRef.current, [id]: open }
      foldsRef.current = next
      setFolds(next)
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => {
        timerRef.current = null
        write(next)
      }, SETTLE_MS)
    },
    [write]
  )

  const store = React.useMemo(() => ({ folds, setFold }), [folds, setFold])

  return <FoldContext.Provider value={store}>{children}</FoldContext.Provider>
}
