import * as React from "react"

/**
 * The Cloudflare Turnstile widget that sits on the sign-up and
 * forgotten-password forms.
 *
 * It renders nothing at all when no site key is set, which is how local
 * development runs, so those two forms stay exactly as they were.
 */
const SCRIPT_ID = "cf-turnstile"
const SCRIPT_SRC =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"

type TurnstileOptions = {
  sitekey: string
  theme: "light" | "dark"
  appearance: "interaction-only"
  callback: (token: string) => void
  "expired-callback": () => void
  "error-callback": () => void
}

type TurnstileApi = {
  render: (host: HTMLElement, options: TurnstileOptions) => string
  reset: (widgetId: string) => void
  remove: (widgetId: string) => void
}

declare global {
  interface Window {
    turnstile?: TurnstileApi
  }
}

/**
 * How long a form will wait for an answer before giving up on it.
 *
 * Cloudflare normally answers in a second or two, but the widget only starts
 * once the page has come alive, so somebody who fills the form very fast can
 * beat it. Waiting is invisible — the submit button is already spinning — where
 * refusing on the spot would tell a real person they are not one.
 */
const ANSWER_WAIT_MS = 10_000

export type HumanCheckHandle = {
  /**
   * The widget's answer, waiting for it if it has not arrived yet. Null once
   * the check has genuinely failed, which is the form's cue to say so.
   */
  getToken: () => Promise<string | null>
  /** Asks for a fresh answer. Each one is single-use, so a retry needs a new one. */
  reset: () => void
}

let scriptPromise: Promise<void> | null = null

/** Adds Cloudflare's script once per page, however many widgets ask for it. */
function loadTurnstileScript() {
  if (window.turnstile) {
    return Promise.resolve()
  }
  if (scriptPromise) {
    return scriptPromise
  }

  scriptPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script")
    script.id = SCRIPT_ID
    script.src = SCRIPT_SRC
    script.async = true
    script.addEventListener("load", () => resolve(), { once: true })
    script.addEventListener(
      "error",
      () => {
        // Let a later mount try again rather than caching the failure forever.
        scriptPromise = null
        script.remove()
        reject(new Error("Turnstile script failed to load"))
      },
      { once: true }
    )
    document.head.appendChild(script)
  })

  return scriptPromise
}

function readResolvedTheme(): "light" | "dark" {
  if (typeof document === "undefined") {
    return "light"
  }
  return document.documentElement.classList.contains("dark") ? "dark" : "light"
}

/**
 * The theme actually on screen, whatever set it.
 *
 * The widget is drawn by Cloudflare and cannot restyle itself, so it has to be
 * rebuilt when the theme changes. Watching the class covers every way that
 * happens: the header switcher, the "d" shortcut, another tab, and the system
 * setting.
 */
function useResolvedTheme() {
  const [theme, setTheme] = React.useState<"light" | "dark">(readResolvedTheme)

  React.useEffect(() => {
    const read = () => setTheme(readResolvedTheme())
    read()

    const observer = new MutationObserver(read)
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    })

    return () => observer.disconnect()
  }, [])

  return theme
}

export const HumanCheck = React.forwardRef<
  HumanCheckHandle,
  { siteKey: string | null }
>(function HumanCheck({ siteKey }, ref) {
  const hostRef = React.useRef<HTMLDivElement>(null)
  const widgetRef = React.useRef<string | null>(null)
  const tokenRef = React.useRef<string | null>(null)
  // Set once the check has given up. Kept apart from "no answer yet" so a form
  // is told straight away instead of waiting on something that is not coming.
  const failedRef = React.useRef(false)
  // Forms that asked for the answer before it arrived, waiting to be told.
  const waitingRef = React.useRef<((token: string | null) => void)[]>([])
  const theme = useResolvedTheme()

  const settle = React.useCallback((token: string | null) => {
    tokenRef.current = token
    failedRef.current = token === null
    const waiting = waitingRef.current
    waitingRef.current = []
    for (const resolve of waiting) {
      resolve(token)
    }
  }, [])

  React.useImperativeHandle(
    ref,
    () => ({
      getToken: () =>
        new Promise<string | null>((resolve) => {
          if (tokenRef.current || failedRef.current) {
            resolve(tokenRef.current)
            return
          }

          let done = false
          const finish = (token: string | null) => {
            if (done) return
            done = true
            window.clearTimeout(timer)
            resolve(token)
          }

          const timer = window.setTimeout(() => finish(null), ANSWER_WAIT_MS)
          waitingRef.current.push(finish)
        }),
      reset: () => {
        tokenRef.current = null
        // A reset is a fresh attempt, so an earlier failure stops counting.
        failedRef.current = false
        if (widgetRef.current) {
          window.turnstile?.reset(widgetRef.current)
        }
      },
    }),
    []
  )

  React.useEffect(() => {
    if (!siteKey) {
      return
    }

    let cancelled = false
    loadTurnstileScript()
      .then(() => {
        if (cancelled || !hostRef.current || !window.turnstile) {
          return
        }

        widgetRef.current = window.turnstile.render(hostRef.current, {
          sitekey: siteKey,
          theme,
          // Stays out of sight unless Cloudflare actually needs to ask
          // something, so almost nobody ever sees a puzzle.
          appearance: "interaction-only",
          callback: settle,
          // An answer goes stale after a few minutes. Turnstile fetches a
          // replacement on its own, so drop the old one and keep waiting.
          "expired-callback": () => {
            tokenRef.current = null
          },
          "error-callback": () => settle(null),
        })
      })
      .catch(() => {
        // Cloudflare's script is a common thing for a blocker to stop. There is
        // no answer to send and the server refuses without one, so record the
        // failure and let the form say so rather than sit on a spinner.
        settle(null)
      })

    return () => {
      cancelled = true
      if (widgetRef.current) {
        window.turnstile?.remove(widgetRef.current)
        widgetRef.current = null
      }
    }
  }, [settle, siteKey, theme])

  if (!siteKey) {
    return null
  }

  return <div ref={hostRef} />
})
