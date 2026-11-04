import * as React from "react"

/**
 * An effect that runs before the browser paints, so anything it settles is
 * already right in the first frame anyone sees.
 *
 * This is for the facts only the browser knows — the window's width, a choice
 * kept in localStorage. They cannot be read while the first render happens,
 * because that render also happens on the server, where neither exists; reading
 * them there would make the two renders disagree and React would throw the page
 * away and rebuild it. Reading them a beat later, here, keeps the two renders
 * identical and still beats the paint.
 *
 * The server has no painting to do, so it uses the plain effect instead — which
 * it never runs either, but at least React does not complain about it.
 */
export const useEffectBeforePaint =
  typeof window === "undefined" ? React.useEffect : React.useLayoutEffect
