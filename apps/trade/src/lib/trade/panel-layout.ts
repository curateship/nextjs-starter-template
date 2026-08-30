import * as React from "react"
import type {
  GroupImperativeHandle,
  Layout,
  LayoutChangedMeta,
} from "react-resizable-panels"

import { useEffectBeforePaint } from "@/lib/hooks/use-effect-before-paint"
import {
  TRADE_PANEL_LAYOUT_KEYS,
  type TradePanelLayoutKey,
  tradePanelIds,
  tradePanelLayoutKey,
} from "@/lib/trade/panel-keys"

export const MAX_NAMED_PANEL_LAYOUTS = 5

export type NamedPanelLayout = {
  id: string
  name: string
  horizontal: Layout
  vertical: Layout
}

/** Every panel arrangement kept in the account's one preference column. */
export type TradePanelLayouts = {
  legacyImported: boolean
  current: Partial<Record<TradePanelLayoutKey, Layout>>
  named: NamedPanelLayout[]
}

export function emptyTradePanelLayouts(): TradePanelLayouts {
  return { legacyImported: false, current: {}, named: [] }
}

/**
 * Applies an account-owned layout to the panel group already on screen.
 *
 * The first layout callback fires when the group registers its panels. The
 * saved answer is handed to that group through `setLayout`; no React key is
 * changed, so a chart inside the group is not built a second time. Direct
 * divider changes are saved, while collapse controls call `rememberLayout`.
 */
export function useRememberedPanelLayoutInPlace(
  panelIds: readonly string[],
  savedLayout?: Layout,
  onSave?: (layout: Layout) => void
) {
  const handleRef = React.useRef<GroupImperativeHandle | null>(null)
  const currentRef = React.useRef<Layout | null>(null)
  const ignoredRef = React.useRef<Layout | null>(null)
  const settingRef = React.useRef(false)
  const appliedSavedRef = React.useRef<string | null>(null)
  /** Whether the group on screen right now has been given the saved layout. */
  const appliedRef = React.useRef(false)

  const groupRef = React.useCallback((handle: GroupImperativeHandle | null) => {
    handleRef.current = handle
    // The group went away; the next one to attach starts over.
    if (!handle) appliedRef.current = false
  }, [])

  const onLayoutChanged = React.useCallback(
    (layout: Layout, meta?: LayoutChangedMeta) => {
      currentRef.current = layout
      if (!appliedRef.current) {
        appliedRef.current = true
        const saved = matchingPanelLayout(savedLayout, panelIds)
        appliedSavedRef.current = panelLayoutSignature(saved)
        // A refused layout leaves the defaults. Panel names matter as much as
        // the count: the library accepts an old record with one renamed panel,
        // then crashes when it asks for that missing panel's size.
        if (saved && handleRef.current) {
          try {
            settingRef.current = true
            ignoredRef.current = saved
            const applied = handleRef.current.setLayout(saved)
            if (ignoredRef.current) ignoredRef.current = applied
          } catch {
            ignoredRef.current = null
            // Defaults stay.
          } finally {
            settingRef.current = false
          }
        }
        return
      }

      if (settingRef.current) {
        ignoredRef.current = null
        return
      }
      if (ignoredRef.current) {
        const ignored = samePanelLayout(ignoredRef.current, layout)
        ignoredRef.current = null
        if (ignored) return
      }

      // Registration, constraints, setLayout, collapse and expand are all
      // programmatic. Divider drags and divider keys are the only changes the
      // library can identify as direct; collapse controls save explicitly
      // through `rememberLayout` after their imperative move has finished.
      if (meta?.isUserInteraction) onSave?.(layout)
    },
    [onSave, panelIds, savedLayout]
  )

  const setLayout = React.useCallback(
    (value: Layout) => {
      const layout = matchingPanelLayout(value, panelIds)
      const handle = handleRef.current
      if (!layout || !handle) return null
      try {
        settingRef.current = true
        ignoredRef.current = layout
        const applied = handle.setLayout(layout)
        if (ignoredRef.current) ignoredRef.current = applied
        currentRef.current = applied
        return applied
      } catch {
        ignoredRef.current = null
        return null
      } finally {
        settingRef.current = false
      }
    },
    [panelIds]
  )

  // A first-browser import or a named-layout switch can land after the group
  // has registered. Hand the answer to that same group; never key-remount it.
  useEffectBeforePaint(() => {
    const next = matchingPanelLayout(savedLayout, panelIds)
    if (!appliedRef.current) return
    const signature = panelLayoutSignature(next)
    if (signature === appliedSavedRef.current) return
    appliedSavedRef.current = signature
    if (!next || samePanelLayout(next, currentRef.current)) return
    setLayout(next)
  }, [savedLayout, panelIds, setLayout])

  const getLayout = React.useCallback(
    () => handleRef.current?.getLayout() ?? currentRef.current,
    []
  )

  const rememberLayout = React.useCallback(
    (value?: Layout) => {
      const layout = value
        ? matchingPanelLayout(value, panelIds)
        : (handleRef.current?.getLayout() ?? currentRef.current)
      if (layout) onSave?.(layout)
    },
    [onSave, panelIds]
  )

  return {
    groupRef,
    onLayoutChanged,
    getLayout,
    setLayout,
    rememberLayout,
  }
}

/** A saved layout only when it names every panel on the current screen. */
export function matchingPanelLayout(
  value: unknown,
  panelIds: readonly string[]
): Layout | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return null
  }

  const record = value as Record<string, unknown>
  if (Object.keys(record).length !== panelIds.length) return null

  const layout: Layout = {}
  let total = 0
  for (const panelId of panelIds) {
    const size = record[panelId]
    if (
      typeof size !== "number" ||
      !Number.isFinite(size) ||
      size < 0 ||
      size > 100
    ) {
      return null
    }
    layout[panelId] = size
    total += size
  }
  return total > 0 ? layout : null
}

function samePanelLayout(one: Layout | null, two: Layout | null) {
  if (!one || !two) return false
  const keys = Object.keys(one)
  return (
    keys.length === Object.keys(two).length &&
    keys.every((key) => one[key] === two[key])
  )
}

function panelLayoutSignature(layout: Layout | null) {
  return layout ? JSON.stringify(layout) : "none"
}

/** Invalid or stale stored pieces are ignored independently. */
export function readTradePanelLayouts(value: unknown): TradePanelLayouts {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return emptyTradePanelLayouts()
  }
  const record = value as Record<string, unknown>
  const currentRecord =
    record.current &&
    typeof record.current === "object" &&
    !Array.isArray(record.current)
      ? (record.current as Record<string, unknown>)
      : {}
  const current: TradePanelLayouts["current"] = {}
  for (const key of TRADE_PANEL_LAYOUT_KEYS) {
    const layout = matchingPanelLayout(currentRecord[key], tradePanelIds[key])
    if (layout) current[key] = layout
  }

  const named = Array.isArray(record.named)
    ? record.named
        .map(readNamedPanelLayout)
        .filter((layout): layout is NamedPanelLayout => layout !== null)
        .slice(0, MAX_NAMED_PANEL_LAYOUTS)
    : []

  return {
    legacyImported: record.legacyImported === true,
    current,
    named,
  }
}

function readNamedPanelLayout(value: unknown): NamedPanelLayout | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return null
  }
  const record = value as Record<string, unknown>
  const name = typeof record.name === "string" ? record.name.trim() : ""
  const horizontal = matchingPanelLayout(
    record.horizontal,
    tradePanelIds[tradePanelLayoutKey.workspaceHorizontal]
  )
  const vertical = matchingPanelLayout(
    record.vertical,
    tradePanelIds[tradePanelLayoutKey.workspaceVertical]
  )
  if (
    typeof record.id !== "string" ||
    record.id.length === 0 ||
    record.id.length > 36 ||
    name.length === 0 ||
    name.length > 32 ||
    !horizontal ||
    !vertical
  ) {
    return null
  }
  return { id: record.id, name, horizontal, vertical }
}

/** Read all six old browser keys for the one-time account import. */
export function readLegacyTradePanelLayouts(
  storage: Pick<Storage, "getItem">
): TradePanelLayouts["current"] {
  const current: TradePanelLayouts["current"] = {}
  for (const key of TRADE_PANEL_LAYOUT_KEYS) {
    try {
      const raw = storage.getItem(key)
      const layout = raw
        ? matchingPanelLayout(JSON.parse(raw), tradePanelIds[key])
        : null
      if (layout) current[key] = layout
    } catch {
      // One blocked or malformed browser value does not hide the other five.
    }
  }
  return current
}

/** The server is authoritative after import, so the old copies can go. */
export function clearLegacyTradePanelLayouts(
  storage: Pick<Storage, "removeItem">
) {
  for (const key of TRADE_PANEL_LAYOUT_KEYS) {
    try {
      storage.removeItem(key)
    } catch {
      // A blocked browser store is already unusable and needs no cleanup.
    }
  }
}
