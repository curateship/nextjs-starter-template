import * as React from "react"
import { loadMarketHoldings } from "@/lib/api/trade/explorer-holdings"

export function useExplorerHoldings() {
  const [answer, setAnswer] = React.useState<
    Awaited<ReturnType<typeof loadMarketHoldings>>
  >({ marks: [], failed: 0 })
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState(false)
  React.useEffect(() => {
    let alive = true
    let busy = false
    const refresh = async () => {
      if (busy || document.hidden) return
      busy = true
      try {
        const next = await loadMarketHoldings()
        if (alive) {
          setAnswer(next)
          setError(false)
        }
      } catch {
        if (alive) {
          setAnswer({ marks: [], failed: 0 })
          setError(true)
        }
      } finally {
        if (alive) setLoading(false)
        busy = false
      }
    }
    void refresh()
    const timer = setInterval(() => void refresh(), 4000)
    document.addEventListener("visibilitychange", refresh)
    return () => {
      alive = false
      clearInterval(timer)
      document.removeEventListener("visibilitychange", refresh)
    }
  }, [])
  return { ...answer, error, loading }
}
