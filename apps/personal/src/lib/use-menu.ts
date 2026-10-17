import * as React from "react"

import type { Menu } from "@/lib/menu"

/** Pause after the last edit before it is written, so typing is one save. */
const SAVE_DELAY_MS = 400

export type SaveStatus = "idle" | "saving" | "saved" | { failed: string }

type Loaded =
  | { state: "loading" }
  | { state: "ready"; menu: Menu }
  | { state: "failed"; error: string }

async function errorOf(response: Response) {
  try {
    const body = (await response.json()) as { error?: unknown }
    if (typeof body.error === "string") return body.error
  } catch {
    // Not JSON; the status line below says enough.
  }
  return `The menu file answered ${response.status}.`
}

async function fetchMenu(): Promise<Loaded> {
  try {
    const response = await fetch("/api/menu", { cache: "no-store" })
    if (!response.ok) throw new Error(await errorOf(response))
    return { state: "ready", menu: (await response.json()) as Menu }
  } catch (error) {
    return {
      state: "failed",
      error: error instanceof Error ? error.message : "The menu did not load.",
    }
  }
}

/**
 * The menu, read once from `/api/menu`, and `update` to change it. Every
 * change shows at once and is written to the file shortly after. Saves run one
 * at a time in order, so an older save can never land after a newer one.
 */
export function useMenu() {
  const [loaded, setLoaded] = React.useState<Loaded>({ state: "loading" })
  const [saveStatus, setSaveStatus] = React.useState<SaveStatus>("idle")
  const menuRef = React.useRef<Menu | null>(null)
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const queueRef = React.useRef(Promise.resolve())
  const versionRef = React.useRef(0)

  const apply = React.useCallback((result: Loaded) => {
    if (result.state === "ready") menuRef.current = result.menu
    setLoaded(result)
  }, [])

  React.useEffect(() => {
    let live = true
    void fetchMenu().then((result) => {
      if (live) apply(result)
    })
    return () => {
      live = false
    }
  }, [apply])

  const reload = React.useCallback(() => {
    setLoaded({ state: "loading" })
    void fetchMenu().then(apply)
  }, [apply])

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
        if (!response.ok) throw new Error(await errorOf(response))
        if (version === versionRef.current) setSaveStatus("saved")
      } catch (error) {
        if (version === versionRef.current) {
          setSaveStatus({
            failed: error instanceof Error ? error.message : "The menu was not saved.",
          })
        }
      }
    })
  }, [])

  const update = React.useCallback(
    (change: (menu: Menu) => Menu) => {
      const current = menuRef.current
      if (!current) return
      const next = change(current)
      if (next === current) return
      menuRef.current = next
      setLoaded({ state: "ready", menu: next })
      setSaveStatus("saving")
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(saveNow, SAVE_DELAY_MS)
    },
    [saveNow]
  )

  return { loaded, reload, update, saveStatus, retrySave: saveNow }
}
