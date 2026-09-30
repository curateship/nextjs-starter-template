import * as React from "react"

import { useEffectBeforePaint } from "@/lib/hooks/use-effect-before-paint"

/**
 * Whether this window is too narrow for a row of header controls.
 *
 * 767px is one pixel under Tailwind's `md`, so this hook and the `max-md:`
 * classes beside it always agree about which side of the line the window is on.
 * It is `md` and not `sm` because 640px was measured with the wide row and still
 * scrolled sideways by 61px.
 *
 * A component only needs this when the two shapes are different markup rather
 * than the same markup styled two ways. Where CSS can do the job, CSS does it:
 * a media query costs no JavaScript and cannot disagree with the server.
 *
 * It starts wide on purpose. The first render also happens on the server, where
 * there is no window to measure, so both sides start from the same answer and
 * React hydrates cleanly. `useEffectBeforePaint` then measures for real before
 * the browser paints, so a phone never shows the wide shape in a visible frame.
 */
const NARROW_QUERY = "(max-width: 767px)"

export function useNarrowScreen() {
  const [narrow, setNarrow] = React.useState(false)

  useEffectBeforePaint(() => {
    const media = window.matchMedia(NARROW_QUERY)
    const update = () => setNarrow(media.matches)
    update()
    media.addEventListener("change", update)
    return () => media.removeEventListener("change", update)
  }, [])

  return narrow
}
