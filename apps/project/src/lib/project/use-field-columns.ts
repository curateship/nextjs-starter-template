import * as React from "react"

import { LIST_TIME_COLUMN_KEY, fieldColumnsKey } from "@/lib/project/panel-keys"
import { LIMITS } from "@/lib/project/rules"

/**
 * The fields a project's List shows as columns while it is filtered to one
 * task type, remembered in this browser for each type. The server that drew
 * the page has no browser storage, so it draws none and the browser fills
 * them in.
 */

const listeners = new Set<() => void>()

function subscribe(listener: () => void) {
  listeners.add(listener)
  window.addEventListener("storage", listener)
  return () => {
    listeners.delete(listener)
    window.removeEventListener("storage", listener)
  }
}

function read(typeId: string | undefined) {
  if (!typeId) return "[]"
  try {
    return window.localStorage.getItem(fieldColumnsKey(typeId)) ?? "[]"
  } catch {
    return "[]"
  }
}

function parse(raw: string): string[] {
  try {
    const saved: unknown = JSON.parse(raw)
    return Array.isArray(saved)
      ? saved.filter((id): id is string => typeof id === "string").slice(0, LIMITS.fieldColumns)
      : []
  } catch {
    return []
  }
}

export function useFieldColumns(typeId: string | undefined) {
  const raw = React.useSyncExternalStore(
    subscribe,
    () => read(typeId),
    () => "[]"
  )
  const ids = React.useMemo(() => parse(raw), [raw])

  const choose = React.useCallback(
    (next: string[]) => {
      if (!typeId) return
      try {
        window.localStorage.setItem(fieldColumnsKey(typeId), JSON.stringify(next.slice(0, LIMITS.fieldColumns)))
      } catch {
        // A browser that won't store the choice keeps the columns it had.
      }
      listeners.forEach((listener) => listener())
    },
    [typeId]
  )

  return [ids, choose] as const
}

function readOn(key: string) {
  try {
    return window.localStorage.getItem(key) === "on"
  } catch {
    return false
  }
}

/**
 * Whether a table shows its Time column, off until picked: the List's, the
 * same in every project, by default, or the Projects table's with its key.
 */
export function useTimeColumn(key = LIST_TIME_COLUMN_KEY) {
  const on = React.useSyncExternalStore(subscribe, () => readOn(key), () => false)
  const choose = React.useCallback(
    (next: boolean) => {
      try {
        window.localStorage.setItem(key, next ? "on" : "off")
      } catch {
        // A browser that won't store the choice keeps the column it had.
      }
      listeners.forEach((listener) => listener())
    },
    [key]
  )
  return [on, choose] as const
}
