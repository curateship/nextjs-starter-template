import * as React from "react"

/**
 * Values already carried by a promise this browser has seen resolve. Keyed by
 * the promise itself, so revisiting a page whose route answer is still cached
 * paints the value on the first frame instead of flashing a loading state
 * while the effect below re-reads a promise that settled long ago.
 */
const settled = new WeakMap<Promise<unknown>, unknown>()

/**
 * The value a streamed route promise carries, or null until it lands.
 *
 * The route loader awaits only the fast database half of the opening answer
 * and hands the exchange-facing half over as a promise. This hook is how the
 * page reads it: the first render gets null and paints the panel frame, and
 * the resolved answer arrives as ordinary state. The server never rejects
 * these promises — a failure resolves to a value that carries its own error
 * message — so there is no rejected branch here.
 */
export function useStreamed<T>(promise: Promise<T>): T | null {
  const [state, setState] = React.useState<{
    promise: Promise<T>
    value: T | null
  }>(() => ({ promise, value: (settled.get(promise) as T | undefined) ?? null }))
  // A new loader answer brings a new promise; the old value must not stand
  // in for it. Adjusted during render, the way React's derived-state pattern
  // does it, so the swap and the paint happen in the same frame.
  if (state.promise !== promise) {
    setState({
      promise,
      value: (settled.get(promise) as T | undefined) ?? null,
    })
  }
  React.useEffect(() => {
    let live = true
    void promise.then((value) => {
      settled.set(promise, value)
      if (!live) return
      setState((current) =>
        current.promise === promise ? { promise, value } : current
      )
    })
    return () => {
      live = false
    }
  }, [promise])
  return state.value
}
