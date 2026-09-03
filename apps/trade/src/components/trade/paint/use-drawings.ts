import * as React from "react"
import { toast } from "sonner"

import {
  clearDrawings,
  deleteDrawing,
  getDrawingAlertErrorMessage,
  getDrawingsErrorMessage,
  getDrawingsLoadErrorMessage,
  loadDrawings,
  saveDrawing,
  setDrawingAlert,
} from "@/lib/api/trade/drawings"
import { showErrorToast } from "@/lib/toast/error-toast"
import { priceAlertDirection } from "@/lib/trade/price-alerts"
import {
  drawingAlertArmed,
  extendedRight,
  priceAtTime,
  type Drawing,
  type DrawingShape,
} from "@/lib/trade/drawings"

/** Which tool the pointer is holding, or none. */
export type PaintTool = DrawingShape["kind"]

const NONE: Drawing[] = []

/**
 * The drawings on one market, and the tool in hand.
 *
 * Everything here is about drawings; nothing here is about the chart. The
 * chart is handed shapes to draw and reports where the pointer was — it never
 * learns that a level is a level, and this file never learns how a chart is
 * built. That seam is the whole point of the paint tools being their own
 * module.
 *
 * Saving is optimistic and reverted on failure, the way starring a market is:
 * a line appears the instant it is drawn, and a save that does not land takes
 * it back rather than leaving a line that is not really there.
 */
export function useChartDrawings(
  marketKey: string | null,
  initial?: {
    marketKey: string | null
    rows: Drawing[]
    error: string | null
  },
  /** Told after a line's alert has been switched on or off and saved. */
  onAlertChange?: () => void
) {
  // Tagged with the market it belongs to, so an answer that lands after
  // another market was picked is dropped rather than drawn on the wrong chart.
  const [answer, setAnswer] = React.useState<{
    key: string
    drawings: Drawing[]
  } | null>(() =>
    marketKey && initial?.marketKey === marketKey
      ? { key: marketKey, drawings: initial.rows }
      : null
  )
  const [attempt, setAttempt] = React.useState(0)
  const [tool, setTool] = React.useState<PaintTool | null>(null)
  const [selectedId, setSelectedId] = React.useState<string | null>(null)
  const showedInitialError = React.useRef(false)
  const handledInitial = React.useRef(false)

  const drawings = answer && answer.key === marketKey ? answer.drawings : NONE

  React.useEffect(() => {
    if (!marketKey) return
    if (
      !handledInitial.current &&
      attempt === 0 &&
      initial?.marketKey === marketKey
    ) {
      handledInitial.current = true
      if (initial.error && !showedInitialError.current) {
        showedInitialError.current = true
        showErrorToast(initial.error, {
          label: "Try again",
          onClick: () => setAttempt((count) => count + 1),
        })
      }
      return
    }
    let stale = false
    loadDrawings(marketKey)
      .then((result) => {
        if (stale) return
        // Merged rather than replaced: the database is a long way off, so a
        // line can be drawn before this answer lands, and a first draw that
        // silently disappeared a second later would be the worst kind of bug.
        setAnswer((current) => {
          const drawnMeanwhile =
            current?.key === marketKey
              ? current.drawings.filter(
                  (candidate) =>
                    !result.drawings.some((saved) => saved.id === candidate.id)
                )
              : []
          return {
            key: marketKey,
            drawings: [...result.drawings, ...drawnMeanwhile],
          }
        })
      })
      .catch((error: unknown) => {
        if (stale) return
        // The chart itself is fine — only the lines on it are missing — so
        // this is said in a toast with a way to try again rather than by
        // replacing the chart with a banner.
        setAnswer({ key: marketKey, drawings: [] })
        showErrorToast(getDrawingsLoadErrorMessage(error), {
          label: "Try again",
          onClick: () => setAttempt((count) => count + 1),
        })
      })
    return () => {
      stale = true
    }
  }, [marketKey, attempt, initial])

  // A tool in hand and a picked line both belong to the market on screen.
  // Cleared during the render that brings the new market in, so the toolbar
  // never shows a bin for a line that is no longer there.
  const [lastKey, setLastKey] = React.useState(marketKey)
  if (marketKey !== lastKey) {
    setLastKey(marketKey)
    setTool(null)
    setSelectedId(null)
  }

  /**
   * Change the list, but only while the same market is still on screen — a
   * revert must never land on the market somebody switched to meanwhile.
   *
   * The one exception is the very first change, before any answer has come
   * back at all: that is a line drawn while the load was still in flight, and
   * it starts the list rather than being thrown away. The load above then
   * merges rather than replaces, so it survives.
   */
  const revise = React.useCallback(
    (key: string, change: (current: Drawing[]) => Drawing[]) => {
      setAnswer((current) => {
        if (current === null) return { key, drawings: change([]) }
        if (current.key !== key) return current
        return { key, drawings: change(current.drawings) }
      })
    },
    []
  )

  const put = React.useCallback(
    async (key: string, drawing: Drawing) => {
      try {
        await saveDrawing(key, drawing)
      } catch (error) {
        revise(key, (current) =>
          current.filter((candidate) => candidate.id !== drawing.id)
        )
        showErrorToast(getDrawingsErrorMessage(error))
      }
    },
    [revise]
  )

  /** Draw a new one. It appears at once and is the picked one straight away. */
  const create = React.useCallback(
    (shape: DrawingShape) => {
      if (!marketKey) return
      const drawing: Drawing = { id: crypto.randomUUID(), shape, alert: null }
      revise(marketKey, (current) => [...current, drawing])
      setSelectedId(drawing.id)
      // One shape per press of a tool button. Staying armed would turn a
      // stray click anywhere on the chart into another line.
      setTool(null)
      void put(marketKey, drawing)
    },
    [marketKey, put, revise]
  )

  /**
   * Where a line ended up after being dragged. The live price goes with it
   * only when the line carries an armed alert, which then points itself at
   * the price again; every other move is the one write it always was.
   */
  const move = React.useCallback(
    (id: string, shape: DrawingShape, currentPrice: number | null = null) => {
      if (!marketKey) return
      const key = marketKey
      const previous = drawings.find((candidate) => candidate.id === id)
      if (!previous) return
      revise(key, (current) =>
        current.map((candidate) =>
          candidate.id === id ? { ...candidate, shape } : candidate
        )
      )
      saveDrawing(
        key,
        { id, shape },
        drawingAlertArmed(previous.alert) ? currentPrice : null
      ).catch((error: unknown) => {
        revise(key, (current) =>
          current.map((candidate) =>
            candidate.id === id ? previous : candidate
          )
        )
        showErrorToast(getDrawingsErrorMessage(error))
      })
    },
    [drawings, marketKey, revise]
  )

  /**
   * Switch a line's alert on or off. The switch flips at once, with the
   * direction worked out here the same way the server will, and the server's
   * answer replaces it; a refused save puts the switch back and says why.
   * Switching on also draws a trendline on to the right edge, the same way
   * the server does, so the two never disagree about the line's shape.
   */
  const setAlert = React.useCallback(
    (id: string, on: boolean, currentPrice: number | null) => {
      if (!marketKey) return
      const key = marketKey
      const previous = drawings.find((candidate) => candidate.id === id)
      if (!previous) return
      const now = Date.now()
      const linePrice = priceAtTime(previous.shape, now)
      const guess =
        on && linePrice !== null && currentPrice !== null
          ? {
              direction: priceAlertDirection(linePrice, currentPrice),
              armedAt: now,
              firedAt: null,
            }
          : null
      const shape = guess ? extendedRight(previous.shape) : previous.shape
      revise(key, (current) =>
        current.map((candidate) =>
          candidate.id === id ? { ...candidate, shape, alert: guess } : candidate
        )
      )
      setDrawingAlert(id, on, currentPrice)
        .then((saved) => {
          revise(key, (current) =>
            current.map((candidate) =>
              candidate.id === id
                ? { ...candidate, shape: saved.shape, alert: saved.alert }
                : candidate
            )
          )
          onAlertChange?.()
        })
        .catch((error: unknown) => {
          revise(key, (current) =>
            current.map((candidate) =>
              candidate.id === id ? previous : candidate
            )
          )
          showErrorToast(getDrawingAlertErrorMessage(error))
        })
    },
    [drawings, marketKey, revise, onAlertChange]
  )

  /**
   * Read this market's lines again. The popover asks for this as it opens,
   * because an alert fires in the engine and the chart only hears about it by
   * asking; without this the switch could read on for a line that already
   * rang the bell.
   */
  const refresh = React.useCallback(() => {
    setAttempt((count) => count + 1)
  }, [])

  /** Throw one away at once, restoring it only if the delete fails. */
  const remove = React.useCallback(
    (id: string) => {
      if (!marketKey) return
      const key = marketKey
      const removed = drawings.find((candidate) => candidate.id === id)
      if (!removed) return
      revise(key, (current) =>
        current.filter((candidate) => candidate.id !== id)
      )
      setSelectedId((current) => (current === id ? null : current))
      deleteDrawing(id).catch((error: unknown) => {
        revise(key, (current) => [...current, removed])
        showErrorToast(getDrawingsErrorMessage(error))
      })
    },
    [drawings, marketKey, revise]
  )

  /**
   * Clear this market's chart. One request, not one per line: a loop can stop
   * half way with nothing to say about it, and it only knows about the lines
   * this screen happens to be showing.
   *
   * There is no Undo on this one — the question is asked before it runs
   * instead, which is the right way round for something that takes everything.
   */
  const clearAll = React.useCallback(async () => {
    if (!marketKey) return
    const key = marketKey
    const previous = drawings
    if (previous.length === 0) return
    revise(key, () => [])
    setSelectedId(null)
    try {
      const { deleted } = await clearDrawings(key)
      toast.success(
        deleted === 1 ? "1 drawing deleted." : `${deleted} drawings deleted.`
      )
    } catch (error) {
      revise(key, () => previous)
      showErrorToast(getDrawingsErrorMessage(error))
    }
  }, [drawings, marketKey, revise])

  // Escape puts the tool down, and puts the picked line back if there is no
  // tool in hand. A window listener because neither the chart nor a line
  // drawn on it is necessarily what the keyboard is pointed at — clicking a
  // line leaves the focus wherever it was.
  React.useEffect(() => {
    if (!tool && !selectedId) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return
      if (tool) setTool(null)
      else setSelectedId(null)
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [selectedId, tool])

  // Pressing anywhere that is not a line and not the tool rail lets the
  // picked line go. The chart's own canvas swallows those presses — the layer
  // above it deliberately lets them through — so this listens on the document
  // rather than waiting for an event that never arrives.
  React.useEffect(() => {
    if (!selectedId) return
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target
      if (
        target instanceof Element &&
        target.closest("[data-chart-paint]") !== null
      ) {
        return
      }
      setSelectedId(null)
    }
    document.addEventListener("pointerdown", onPointerDown)
    return () => document.removeEventListener("pointerdown", onPointerDown)
  }, [selectedId])

  return {
    drawings,
    tool,
    setTool,
    selectedId,
    setSelectedId,
    create,
    move,
    remove,
    setAlert,
    refresh,
    clearAll,
  }
}
