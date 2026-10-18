import * as React from "react"
import { createIsomorphicFn } from "@tanstack/react-start"
import { getCookie } from "@tanstack/react-start/server"

import { useEffectBeforePaint } from "@/lib/hooks/use-effect-before-paint"

/**
 * Whether this window is wide enough for a side-by-side layout — known before
 * the first render, on the server as well as in the browser.
 *
 * The server cannot measure a window it never sees. So the browser writes the
 * answer into a cookie, and both sides read that same cookie for the very first
 * render: they draw the same thing, React hydrates cleanly, and the layout is
 * already right in the frame the page appears in. The hook then measures the
 * window for real before the browser paints, which corrects a window resized
 * since and leaves the cookie ready for next time.
 *
 * A browser that has never been here has no cookie and gets the wide layout —
 * this is admin tooling, opened on a desktop far more often than on a phone.
 */
const COOKIE_NAME = "custom-shell-wide"
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365
const WIDE_QUERY = "(min-width: 1280px)"

const readWideCookie = createIsomorphicFn()
  .server(() => getCookie(COOKIE_NAME) !== "0")
  .client(
    () => !document.cookie.split("; ").some((entry) => entry === `${COOKIE_NAME}=0`)
  )

export function useWideScreen() {
  const [wide, setWide] = React.useState(readWideCookie)

  useEffectBeforePaint(() => {
    const media = window.matchMedia(WIDE_QUERY)
    const update = () => {
      setWide(media.matches)
      // Only when it has actually changed. Left alone this rewrites, on every
      // single open, a cookie already saying the same thing.
      if (readWideCookie() === media.matches) return
      document.cookie = `${COOKIE_NAME}=${media.matches ? "1" : "0"}; path=/; max-age=${COOKIE_MAX_AGE}; SameSite=Lax`
    }
    update()
    media.addEventListener("change", update)
    return () => media.removeEventListener("change", update)
  }, [])

  return wide
}
