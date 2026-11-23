export type AutomationLogEntry = {
  id: string
  time: number
  message: string
}

export function appendAutomationLog(
  entries: AutomationLogEntry[],
  entry: AutomationLogEntry
) {
  return [entry, ...entries].slice(0, 100)
}
