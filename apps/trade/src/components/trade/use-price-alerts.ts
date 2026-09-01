import * as React from "react"

import {
  getPriceAlertErrorMessage,
  getPriceAlertLoadErrorMessage,
  loadPriceAlerts,
  movePriceAlert,
  removePriceAlert,
  savePriceAlert,
} from "@/lib/api/trade/price-alerts"
import {
  MAX_ARMED_PRICE_ALERTS,
  PRICE_ALERTS_FULL,
  optimisticPriceAlert,
  priceAlertDirection,
  type PriceAlert,
} from "@/lib/trade/price-alerts"
import { showErrorToast } from "@/lib/toast/error-toast"

const REFRESH_MS = 2_000

function sameAlerts(left: readonly PriceAlert[], right: readonly PriceAlert[]) {
  return (
    left.length === right.length &&
    left.every((alert, index) => {
      const other = right[index]
      return (
        other !== undefined &&
        alert.id === other.id &&
        alert.marketKey === other.marketKey &&
        alert.price === other.price &&
        alert.direction === other.direction &&
        alert.createdAt === other.createdAt
      )
    })
  )
}

/** One optimistic list behind both the Alerts panel and chart layer. */
export function usePriceAlerts(initial: {
  rows: PriceAlert[]
  error: string | null
}) {
  const [alerts, setAlerts] = React.useState(initial.rows)
  const [error, setError] = React.useState(initial.error)
  const pendingCreates = React.useRef(new Map<string, PriceAlert>())
  const pendingMoves = React.useRef(new Map<string, PriceAlert>())
  const pendingDeletes = React.useRef(new Set<string>())
  const createWrites = React.useRef(new Map<string, Promise<PriceAlert>>())
  const moveWrites = React.useRef(new Map<string, Promise<void>>())
  const moveVersions = React.useRef(new Map<string, number>())
  const refreshing = React.useRef(false)
  const revision = React.useRef(0)

  const refresh = React.useCallback(async () => {
    if (refreshing.current) return
    refreshing.current = true
    const startedAtRevision = revision.current
    try {
      const answer = await loadPriceAlerts()
      // A local press that happened after this read left already has the newer
      // answer on screen. Its save or delete will be reconciled by the next
      // read instead of letting this older answer flash it away.
      if (revision.current !== startedAtRevision) return
      const saved = answer.alerts.filter(
        (alert) => !pendingDeletes.current.has(alert.id)
      )
      for (const optimistic of pendingCreates.current.values()) {
        if (!saved.some((alert) => alert.id === optimistic.id)) {
          saved.push(optimistic)
        }
      }
      for (const optimistic of pendingMoves.current.values()) {
        const index = saved.findIndex((alert) => alert.id === optimistic.id)
        if (index >= 0) saved[index] = optimistic
      }
      saved.sort(
        (left, right) =>
          left.createdAt - right.createdAt || left.id.localeCompare(right.id)
      )
      setAlerts((current) => (sameAlerts(current, saved) ? current : saved))
      setError(null)
    } catch (caught) {
      setError(getPriceAlertLoadErrorMessage(caught))
    } finally {
      refreshing.current = false
    }
  }, [])

  React.useEffect(() => {
    if (initial.error) void refresh()
  }, [initial.error, refresh])

  React.useEffect(() => {
    if (alerts.length === 0 && !error) return
    const timer = window.setInterval(() => void refresh(), REFRESH_MS)
    return () => window.clearInterval(timer)
  }, [alerts.length, error, refresh])

  const create = React.useCallback(
    (input: { marketKey: string; price: number; currentPrice: number }) => {
      if (alerts.length >= MAX_ARMED_PRICE_ALERTS) {
        showErrorToast(getPriceAlertErrorMessage(new Error(PRICE_ALERTS_FULL)))
        return
      }
      const id = crypto.randomUUID()
      const alert = optimisticPriceAlert({ id, ...input })
      if (!alert) {
        showErrorToast(getPriceAlertErrorMessage(new Error("PRICE_INVALID")))
        return
      }

      pendingCreates.current.set(id, alert)
      revision.current += 1
      setAlerts((current) => [...current, alert])
      const write = savePriceAlert({ id, ...input })
      createWrites.current.set(id, write)
      void write
        .then(
          (saved) => {
            pendingCreates.current.delete(id)
            revision.current += 1
            if (pendingDeletes.current.has(id)) return
            const moved = pendingMoves.current.get(id)
            setAlerts((current) =>
              current.map((candidate) =>
                candidate.id === id ? (moved ?? saved) : candidate
              )
            )
          },
          (caught) => {
            pendingCreates.current.delete(id)
            pendingMoves.current.delete(id)
            revision.current += 1
            setAlerts((current) =>
              current.filter((candidate) => candidate.id !== id)
            )
            if (!pendingDeletes.current.has(id)) {
              showErrorToast(getPriceAlertErrorMessage(caught))
            }
          }
        )
        .finally(() => {
          if (createWrites.current.get(id) === write) {
            createWrites.current.delete(id)
          }
        })
    },
    [alerts.length]
  )

  const remove = React.useCallback(
    (id: string) => {
      const removed = alerts.find((alert) => alert.id === id) ?? null
      revision.current += 1
      setAlerts((current) => current.filter((alert) => alert.id !== id))
      pendingDeletes.current.add(id)
      pendingMoves.current.delete(id)
      moveVersions.current.delete(id)
      const creating = createWrites.current.get(id)
      const moving = moveWrites.current.get(id)
      void Promise.all([
        creating ? creating.catch(() => null) : Promise.resolve(),
        moving ? moving.catch(() => undefined) : Promise.resolve(),
      ])
        .then(() => removePriceAlert(id))
        .catch((caught) => {
          revision.current += 1
          if (removed) {
            setAlerts((current) =>
              current.some((alert) => alert.id === id)
                ? current
                : [...current, removed as PriceAlert].sort(
                    (left, right) => left.createdAt - right.createdAt
                  )
            )
          }
          showErrorToast(getPriceAlertErrorMessage(caught))
        })
        .finally(() => {
          pendingDeletes.current.delete(id)
        })
    },
    [alerts]
  )

  const move = React.useCallback(
    (input: { id: string; price: number; currentPrice: number }) => {
      const before = alerts.find((alert) => alert.id === input.id)
      if (!before || pendingDeletes.current.has(input.id)) return
      if (
        !Number.isFinite(input.price) ||
        input.price <= 0 ||
        !Number.isFinite(input.currentPrice) ||
        input.currentPrice <= 0
      ) {
        showErrorToast(getPriceAlertErrorMessage(new Error("PRICE_INVALID")))
        return
      }

      const optimistic: PriceAlert = {
        ...before,
        price: input.price,
        direction: priceAlertDirection(input.price, input.currentPrice),
      }
      if (
        optimistic.price === before.price &&
        optimistic.direction === before.direction
      ) {
        return
      }

      const version = (moveVersions.current.get(input.id) ?? 0) + 1
      moveVersions.current.set(input.id, version)
      pendingMoves.current.set(input.id, optimistic)
      revision.current += 1
      setAlerts((current) =>
        current.map((alert) => (alert.id === input.id ? optimistic : alert))
      )

      // Repeated drags for one line save in release order. A slower first
      // request can never overwrite the newer position in the database.
      const moving = moveWrites.current.get(input.id)
      const creating = createWrites.current.get(input.id)
      let createFailed = false
      const created = creating
        ? creating.then(
            () => undefined,
            () => {
              createFailed = true
            }
          )
        : Promise.resolve()
      const write = Promise.all([
        moving ? moving.catch(() => undefined) : Promise.resolve(),
        created,
      ])
        .then(async () => {
          if (createFailed || pendingDeletes.current.has(input.id)) return
          const saved = await movePriceAlert(input)
          revision.current += 1
          if (
            pendingDeletes.current.has(input.id) ||
            moveVersions.current.get(input.id) !== version
          ) {
            return
          }
          pendingMoves.current.delete(input.id)
          moveVersions.current.delete(input.id)
          setAlerts((current) =>
            current.map((alert) => (alert.id === input.id ? saved : alert))
          )
        })
        .catch((caught) => {
          revision.current += 1
          if (
            pendingDeletes.current.has(input.id) ||
            moveVersions.current.get(input.id) !== version
          ) {
            return
          }
          pendingMoves.current.delete(input.id)
          moveVersions.current.delete(input.id)
          setAlerts((current) =>
            current.map((alert) => (alert.id === input.id ? before : alert))
          )
          showErrorToast(getPriceAlertErrorMessage(caught))
        })
        .finally(() => {
          if (moveWrites.current.get(input.id) === write) {
            moveWrites.current.delete(input.id)
          }
        })
      moveWrites.current.set(input.id, write)
    },
    [alerts]
  )

  return { alerts, error, refresh, create, move, remove }
}
