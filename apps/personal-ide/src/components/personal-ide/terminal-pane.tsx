import { listen } from "@tauri-apps/api/event"
import { FitAddon } from "@xterm/addon-fit"
import { WebglAddon } from "@xterm/addon-webgl"
import { Terminal } from "@xterm/xterm"
import type { ITheme } from "@xterm/xterm"
import "@xterm/xterm/css/xterm.css"
import { useEffect, useRef } from "react"

import {
  resizeNativeTerminal,
  startNativeTerminal,
  writeNativeTerminal,
} from "@/app/native/terminal"
import { readableError } from "@/app/path"
import {
  TERMINAL_SCROLLBACK_LINES,
  terminalOutputEvent,
} from "@/app/terminal"
import type { TerminalOutput } from "@/app/types"

const LIGHT_TERMINAL_THEME: ITheme = {
  background: "#ffffff",
  foreground: "#171717",
  cursor: "#171717",
  black: "#24292f",
  red: "#cf222e",
  green: "#1f883d",
  yellow: "#9a6700",
  blue: "#0969da",
  magenta: "#8250df",
  cyan: "#1b7c83",
  white: "#6e7781",
  brightBlack: "#57606a",
  brightRed: "#a40e26",
  brightGreen: "#116329",
  brightYellow: "#4d2d00",
  brightBlue: "#0550ae",
  brightMagenta: "#6639ba",
  brightCyan: "#05595c",
  brightWhite: "#24292f",
  selectionBackground: "rgba(59, 130, 246, 0.32)",
  selectionForeground: "#171717",
  selectionInactiveBackground: "rgba(100, 116, 139, 0.25)",
}

const DARK_TERMINAL_THEME: ITheme = {
  background: "#171717",
  foreground: "#f5f5f5",
  cursor: "#f5f5f5",
  black: "#1f2428",
  red: "#ff7b72",
  green: "#3fb950",
  yellow: "#d29922",
  blue: "#58a6ff",
  magenta: "#d2a8ff",
  cyan: "#39c5cf",
  white: "#b1bac4",
  brightBlack: "#768390",
  brightRed: "#ffa198",
  brightGreen: "#56d364",
  brightYellow: "#e3b341",
  brightBlue: "#79c0ff",
  brightMagenta: "#dcbdfb",
  brightCyan: "#56d4dd",
  brightWhite: "#f0f6fc",
  selectionBackground: "rgba(59, 130, 246, 0.38)",
  selectionForeground: "#f5f5f5",
  selectionInactiveBackground: "rgba(148, 163, 184, 0.28)",
}

function terminalThemeFor(isDarkTheme: boolean) {
  return isDarkTheme ? DARK_TERMINAL_THEME : LIGHT_TERMINAL_THEME
}

export function TerminalPane({
  active,
  focusNonce,
  isDarkTheme,
  onSizeChange,
  onError,
  onPasteImage,
  onTerminalInput,
  onTerminalOutput,
  terminalId,
  startupCommand,
  workspaceId,
}: {
  active: boolean
  focusNonce: number
  isDarkTheme: boolean
  onSizeChange: (cols: number, rows: number) => void
  onError: (value: string) => void
  onPasteImage: (event: ClipboardEvent) => void
  onTerminalInput: (workspaceId: string, terminalId: string) => void
  onTerminalOutput: (workspaceId: string, terminalId: string, data: number[]) => void
  startupCommand?: string
  terminalId: string
  workspaceId: string
}) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const terminalRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const frameRef = useRef<number | null>(null)
  const activeRef = useRef(active)
  const isDarkThemeRef = useRef(isDarkTheme)
  const startupCommandSentRef = useRef(false)

  useEffect(() => {
    activeRef.current = active
  }, [active])

  useEffect(() => {
    isDarkThemeRef.current = isDarkTheme
    const terminal = terminalRef.current
    if (!terminal) return

    terminal.options.theme = terminalThemeFor(isDarkTheme)
    if (terminal.rows < 1) return
    try {
      terminal.refresh(0, terminal.rows - 1)
    } catch {
      // xterm can throw while the panel is hidden during theme changes.
    }
  }, [isDarkTheme])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const handlePaste = (event: ClipboardEvent) => onPasteImage(event)
    container.addEventListener("paste", handlePaste, true)
    return () => container.removeEventListener("paste", handlePaste, true)
  }, [onPasteImage])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    let cancelled = false
    let unlisten: (() => void) | undefined

    const terminal = new Terminal({
      cursorBlink: true,
      convertEol: false,
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
      fontSize: 12,
      minimumContrastRatio: 4.5,
      scrollback: TERMINAL_SCROLLBACK_LINES,
      theme: terminalThemeFor(isDarkThemeRef.current),
    })
    const fit = new FitAddon()
    terminal.loadAddon(fit)
    // Claude Code erases the scrollback buffer (CSI 3 J) on every redraw
    // taller than the viewport, which kills the scrollbar. Swallow only that
    // sequence; plain screen clears (CSI 2 J) still work.
    const scrollbackGuard = terminal.parser.registerCsiHandler(
      { final: "J" },
      (params) => params[0] === 3
    )
    terminal.open(container)
    terminalRef.current = terminal
    fitRef.current = fit

    // Render on the GPU instead of the DOM. This is the difference between
    // smooth and janky when several agents stream output at once. If WebGL is
    // unavailable, or its context is later lost (e.g. too many live contexts),
    // dispose the addon so xterm falls back to its DOM renderer on its own.
    let webglAddon: WebglAddon | undefined
    try {
      const addon = new WebglAddon()
      addon.onContextLoss(() => {
        addon.dispose()
        if (webglAddon === addon) webglAddon = undefined
      })
      terminal.loadAddon(addon)
      webglAddon = addon
    } catch {
      webglAddon = undefined
    }

    const refreshTerminal = () => {
      if (cancelled || terminal.rows < 1) return

      try {
        terminal.refresh(0, terminal.rows - 1)
      } catch {
        // xterm can throw while the panel is hidden during resize.
      }
    }

    const fitTerminal = () => {
      if (frameRef.current) window.cancelAnimationFrame(frameRef.current)
      frameRef.current = window.requestAnimationFrame(() => {
        frameRef.current = null
        if (!container.isConnected || container.clientWidth === 0 || container.clientHeight === 0) {
          return
        }

        try {
          fit.fit()
          refreshTerminal()
          onSizeChange(terminal.cols || 80, terminal.rows || 24)
          void resizeNativeTerminal(
            terminalId,
            terminal.cols || 80,
            terminal.rows || 24
          ).catch(() => undefined)
        } catch {
          // xterm can throw while the panel is hidden during resize.
        }
      })
    }

    const startAfterFit = () => {
      try {
        fit.fit()
        refreshTerminal()
        const cols = terminal.cols || 80
        const rows = terminal.rows || 24
        onSizeChange(cols, rows)
        void startNativeTerminal(workspaceId, terminalId, cols, rows)
          .then(() => resizeNativeTerminal(terminalId, cols, rows))
          .then(() => {
            if (!startupCommand || startupCommandSentRef.current) return undefined

            startupCommandSentRef.current = true
            return writeNativeTerminal(terminalId, startupCommand)
          })
          .catch((error) => onError(readableError(error)))
      } catch (error) {
        onError(readableError(error))
      }
    }

    const dataDisposable = terminal.onData((data) => {
      void writeNativeTerminal(terminalId, data).catch((error) =>
        onError(readableError(error))
      )
    })
    const keyDisposable = terminal.onKey(({ domEvent }) => {
      if (domEvent.key !== "Enter") return
      if (domEvent.metaKey || domEvent.ctrlKey || domEvent.altKey) return
      onTerminalInput(workspaceId, terminalId)
    })
    const observer = new ResizeObserver(fitTerminal)
    observer.observe(container)

    listen<TerminalOutput>(terminalOutputEvent(terminalId), (event) => {
      if (
        event.payload.workspaceId !== workspaceId ||
        event.payload.terminalId !== terminalId
      ) {
        return
      }
      const data = new Uint8Array(event.payload.data)
      onTerminalOutput(workspaceId, terminalId, event.payload.data)
      terminal.write(data, () => {
        if (activeRef.current) refreshTerminal()
      })
    })
      .then((dispose) => {
        if (cancelled) {
          dispose()
          return
        }

        unlisten = dispose
        window.requestAnimationFrame(() => {
          window.requestAnimationFrame(startAfterFit)
        })
      })
      .catch((error) => onError(readableError(error)))

    return () => {
      cancelled = true
      if (frameRef.current) window.cancelAnimationFrame(frameRef.current)
      unlisten?.()
      observer.disconnect()
      dataDisposable.dispose()
      keyDisposable.dispose()
      scrollbackGuard.dispose()
      webglAddon?.dispose()
      terminal.dispose()
      terminalRef.current = null
      fitRef.current = null
    }
  }, [
    onError,
    onSizeChange,
    onTerminalInput,
    onTerminalOutput,
    startupCommand,
    terminalId,
    workspaceId,
  ])

  useEffect(() => {
    terminalRef.current?.focus()
  }, [focusNonce])

  useEffect(() => {
    if (!active) return

    const frame = window.requestAnimationFrame(() => {
      const terminal = terminalRef.current
      const fit = fitRef.current
      if (!terminal || !fit) return

      try {
        fit.fit()
        onSizeChange(terminal.cols || 80, terminal.rows || 24)
        void resizeNativeTerminal(
          terminalId,
          terminal.cols || 80,
          terminal.rows || 24
        ).catch(() => undefined)
        window.requestAnimationFrame(() => {
          if (terminal.rows < 1) return
          try {
            terminal.refresh(0, terminal.rows - 1)
          } catch {
            // xterm can throw while the panel is being shown.
          }
        })
        terminal.focus()
      } catch {
        // xterm can throw while the panel is being shown.
      }
    })

    return () => window.cancelAnimationFrame(frame)
  }, [active, onSizeChange, terminalId])

  return (
    <div className="h-full min-h-0 p-2">
      <div ref={containerRef} className="h-full min-h-0 overflow-hidden" />
    </div>
  )
}
