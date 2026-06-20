import { invoke } from "@tauri-apps/api/core"

export function startNativeTerminal(
  workspaceId: string,
  terminalId: string,
  cols: number,
  rows: number
) {
  return invoke("start_terminal", { workspaceId, terminalId, cols, rows })
}

export function resizeNativeTerminal(terminalId: string, cols: number, rows: number) {
  return invoke("resize_terminal", { terminalId, cols, rows })
}

export function writeNativeTerminal(terminalId: string, data: string) {
  return invoke("write_terminal", { terminalId, data })
}

export function killNativeTerminal(terminalId: string) {
  return invoke("kill_terminal", { terminalId })
}
