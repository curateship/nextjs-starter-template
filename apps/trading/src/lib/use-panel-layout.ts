import * as React from "react"
import type { Layout } from "react-resizable-panels"

/**
 * Persisted resizable-panel layout for the full-bleed workspaces (backtest
 * group dashboard, automation editor, bot view). Reads the saved layout from
 * localStorage in an effect after mount — never during render, so SSR and the
 * first client paint agree — and returns a `layoutKey` that changes once the
 * saved layout has loaded so the caller can remount the panel group with it.
 * `onLayoutChanged` no-ops until loaded so the pre-load default never clobbers
 * the saved layout.
 */
export function usePanelLayout(key: string) {
  const [defaultLayout, setDefaultLayout] = React.useState<Layout>()
  const [loaded, setLoaded] = React.useState(false)

  React.useEffect(() => {
    try {
      const saved = localStorage.getItem(key)
      setDefaultLayout(saved ? (JSON.parse(saved) as Layout) : undefined)
    } catch {
      setDefaultLayout(undefined)
    } finally {
      setLoaded(true)
    }
  }, [key])

  const onLayoutChanged = React.useCallback(
    (layout: Layout) => {
      if (!loaded) return
      try {
        localStorage.setItem(key, JSON.stringify(layout))
      } catch {
        // Storage blocked — resizing still works for this session.
      }
    },
    [key, loaded]
  )

  return {
    defaultLayout,
    onLayoutChanged,
    layoutKey: loaded ? JSON.stringify(defaultLayout ?? {}) : "loading",
  }
}
