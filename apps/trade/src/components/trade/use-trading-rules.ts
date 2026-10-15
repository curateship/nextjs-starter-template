import * as React from "react"

import { useReportedSaveStatus } from "@/components/settings/use-reported-save-status"
import {
  getTradingRulesSaveErrorMessage,
  saveTradingRulesSettings,
} from "@/lib/api/trade/trading-rules"
import { showErrorToast } from "@/lib/toast/error-toast"
import {
  MAX_TRADING_RULES,
  newTradingRule,
  nextRuleName,
  tradingRulesSchema,
  type TradingRule,
  type TradingRules,
} from "@/lib/trade/trading-rules"

const SETTLE_MS = 700

function newRuleId(): string {
  return `rule-${crypto.randomUUID()}`
}

/**
 * The person's rules, changed on screen at once and saved per account 700ms
 * after the last edit, with no Save button. The page header says Saving…,
 * Saved or Not saved.
 *
 * A list that would not pass the server's check is shown but not sent: a rule
 * name cleared to nothing waits on screen, marked, until it has a name again,
 * and the last good list stays the saved one.
 */
export function useTradingRules(initial: TradingRules) {
  const [rules, setRules] = React.useState(initial)
  const rulesRef = React.useRef(initial)
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingRef = React.useRef<TradingRules | null>(null)
  const setSaveStatus = useReportedSaveStatus()

  const write = React.useCallback(
    (next: TradingRules) => {
      setSaveStatus("saving")
      saveTradingRulesSettings(next)
        .then(() => setSaveStatus("saved"))
        .catch((error: unknown) => {
          // The toast says why; the header goes quiet, as the shell's own
          // auto-saving cards do.
          setSaveStatus("idle")
          showErrorToast(getTradingRulesSaveErrorMessage(error))
        })
    },
    [setSaveStatus]
  )

  // Leaving the tab with an edit still settling sends it at once. Read
  // through a ref, so a new `write` never counts as leaving.
  const writeRef = React.useRef(write)
  React.useEffect(() => {
    writeRef.current = write
  }, [write])
  React.useEffect(() => {
    return () => {
      if (!timerRef.current) return
      clearTimeout(timerRef.current)
      timerRef.current = null
      if (pendingRef.current) writeRef.current(pendingRef.current)
    }
  }, [])

  const change = React.useCallback(
    (next: TradingRules) => {
      rulesRef.current = next
      setRules(next)
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = null
      pendingRef.current = null
      if (!tradingRulesSchema.safeParse(next).success) return
      pendingRef.current = next
      timerRef.current = setTimeout(() => {
        timerRef.current = null
        pendingRef.current = null
        write(next)
      }, SETTLE_MS)
    },
    [write]
  )

  const updateRule = React.useCallback(
    (id: string, update: (rule: TradingRule) => TradingRule) => {
      change({
        list: rulesRef.current.list.map((rule) =>
          rule.id === id ? update(rule) : rule
        ),
      })
    },
    [change]
  )

  /** A new rule at the end of the list, or null when the list is full. */
  const addRule = React.useCallback((): TradingRule | null => {
    const list = rulesRef.current.list
    if (list.length >= MAX_TRADING_RULES) return null
    const rule = newTradingRule(newRuleId(), nextRuleName(list))
    change({ list: [...list, rule] })
    return rule
  }, [change])

  /** A copy straight after the original, switched off so it never doubles a warning. */
  const duplicateRule = React.useCallback(
    (id: string): TradingRule | null => {
      const list = rulesRef.current.list
      const index = list.findIndex((rule) => rule.id === id)
      if (index < 0 || list.length >= MAX_TRADING_RULES) return null
      const original = list[index]
      const copy: TradingRule = {
        ...original,
        id: newRuleId(),
        name: copyName(original.name, list),
        on: false,
        cards: original.cards.map((card) => ({ ...card })),
      }
      change({
        list: [...list.slice(0, index + 1), copy, ...list.slice(index + 1)],
      })
      return copy
    },
    [change]
  )

  const removeRules = React.useCallback(
    (ids: ReadonlySet<string>) => {
      change({ list: rulesRef.current.list.filter((rule) => !ids.has(rule.id)) })
    },
    [change]
  )

  return { rules, updateRule, addRule, duplicateRule, removeRules }
}

/** "Weekly trend guard copy", then "copy 2", within the 40 letters a name allows. */
function copyName(name: string, list: readonly TradingRule[]): string {
  const taken = new Set(list.map((rule) => rule.name.toLowerCase()))
  for (let number = 1; ; number += 1) {
    const suffix = number === 1 ? " copy" : ` copy ${number}`
    const candidate = `${name.slice(0, 40 - suffix.length).trimEnd()}${suffix}`
    if (!taken.has(candidate.toLowerCase())) return candidate
  }
}
