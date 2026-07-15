import { Channel, invoke } from "@tauri-apps/api/core"

export function startNativeTerminal(
  workspaceId: string,
  terminalId: string,
  cols: number,
  rows: number,
  onOutput?: (data: Uint8Array) => void
) {
  // Raw-byte channel: PTY output crosses IPC as binary instead of a JSON
  // number array, so nothing gets JSON.parsed on the main thread. Callers
  // without a handler only ensure the terminal is running; the pane's channel
  // stays attached.
  let output: Channel<ArrayBuffer> | null = null
  if (onOutput) {
    output = new Channel<ArrayBuffer>()
    output.onmessage = (data) => onOutput(new Uint8Array(data))
  }
  return invoke("start_terminal", { workspaceId, terminalId, cols, rows, onOutput: output })
}

export function resizeNativeTerminal(terminalId: string, cols: number, rows: number) {
  return invoke("resize_terminal", { terminalId, cols, rows })
}

export function detachNativeTerminalOutput(terminalId: string) {
  return invoke("detach_terminal_output", { terminalId })
}

export function writeNativeTerminal(terminalId: string, data: string) {
  return invoke("write_terminal", { terminalId, data })
}

export function killNativeTerminal(terminalId: string) {
  return invoke("kill_terminal", { terminalId })
}
