import * as React from "react"

import { errorOf } from "@/lib/api-error"
import type { Menu } from "@/lib/menu"

/** Pause after the last edit before it is written, so typing is one save. */
const SAVE_DELAY_MS = 400

export type SaveStatus = "idle" | "saving" | "saved" | { failed: string }

type Loaded =
  | { state: "loading" }
  | { state: "ready"; menu: Menu }
  | { state: "failed"; error: string }

/** The menu, or null when the sign-in has run out. */
async function fetchMenu(): Promise<Loaded | null> {
  try {
    const response = await fetch("/api/menu", { cache: "no-store" })
    if (response.status === 401) return null
    if (!response.ok) throw new Error(await errorOf(response, `The menu file answered ${response.status}.`))
    return { state: "ready", menu: (await response.json()) as Menu }
  } catch (error) {
    return {
      state: "failed",
      error: error instanceof Error ? error.message : "The menu did not load.",
    }
  }
}

/**
 * The menu, read from `/api/menu` on each sign-in, and `update` to change it.
 * Every change shows at once and is written to the file shortly after. Saves
 * run one at a time in order, so an older save can never land after a newer
 * one. A 401 calls `onSignedOut`, and a change it stopped is saved on the next
 * sign-in instead of being lost.
 */
export function useMenu(signedIn: boolean, onSignedOut: () => void) {
  const [loaded, setLoaded] = React.useState<Loaded>({ state: "loading" })
  const [saveStatus, setSaveStatus] = React.useState<SaveStatus>("idle")
  const menuRef = React.useRef<Menu | null>(null)
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const queueRef = React.useRef(Promise.resolve())
  const versionRef = React.useRef(0)
  // A change the file doesn't have yet.
  const unsavedRef = React.useRef(false)

  const apply = React.useCallback((result: Loaded) => {
    if (result.state === "ready") menuRef.current = result.menu
    setLoaded(result)
  }, [])

  const load = React.useCallback(
    (live: () => boolean) => {
      void fetchMenu().then((result) => {
        if (!live()) return
        if (result) apply(result)
        else onSignedOut()
      })
    },
    [apply, onSignedOut]
  )

  const reload = React.useCallback(() => {
    setLoaded({ state: "loading" })
    load(() => true)
  }, [load])

  const saveNow = React.useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = null
    const menu = menuRef.current
    if (!menu) return
    const version = ++versionRef.current
    setSaveStatus("saving")
    queueRef.current = queueRef.current.then(async () => {
      try {
        const response = await fetch("/api/menu", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(menu),
        })
        if (response.status === 401) return onSignedOut()
        if (!response.ok) throw new Error(await errorOf(response, `The menu file answered ${response.status}.`))
        if (version === versionRef.current) {
          unsavedRef.current = false
          setSaveStatus("saved")
        }
      } catch (error) {
        if (version === versionRef.current) {
          setSaveStatus({
            failed: error instanceof Error ? error.message : "The menu was not saved.",
          })
        }
      }
    })
  }, [onSignedOut])

  React.useEffect(() => {
    if (!signedIn) return
    if (unsavedRef.current) return saveNow()
    let live = true
    load(() => live)
    return () => {
      live = false
    }
  }, [signedIn, load, saveNow])

  const update = React.useCallback(
    (change: (menu: Menu) => Menu) => {
      const current = menuRef.current
      if (!current) return
      const next = change(current)
      if (next === current) return
      menuRef.current = next
      unsavedRef.current = true
      setLoaded({ state: "ready", menu: next })
      setSaveStatus("saving")
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(saveNow, SAVE_DELAY_MS)
    },
    [saveNow]
  )

  return { loaded, reload, update, saveStatus, retrySave: saveNow }
}
