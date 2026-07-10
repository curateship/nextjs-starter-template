import { FitAddon } from "@xterm/addon-fit"
import { WebglAddon } from "@xterm/addon-webgl"
import { Terminal } from "@xterm/xterm"
import type { ITheme } from "@xterm/xterm"
import "@xterm/xterm/css/xterm.css"
import { useEffect, useRef } from "react"
import type { RefObject } from "react"

import {
  resizeNativeTerminal,
  startNativeTerminal,
  writeNativeTerminal,
} from "@/app/native/terminal"
import { readableError } from "@/app/path"
import { TERMINAL_SCROLLBACK_LINES } from "@/app/terminal"

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

const ALTERNATE_SCREEN_MODE_CODES = new Set([47, 1047, 1049])

function hasTerminalMode(params: (number | number[])[], modes: Set<number>) {
  return params.some((param) =>
    Array.isArray(param) ? param.some((value) => modes.has(value)) : modes.has(param)
  )
}

function syncScrollableState(container: HTMLElement, terminal: Terminal) {
  container.classList.toggle("terminal-has-scrollback", terminal.buffer.active.baseY > 0)
}

// Render on the GPU instead of the DOM. This is the difference between smooth
// and janky when an agent streams output fast. Only the visible pane loads
// this: Chrome caps live WebGL contexts (~16), so if every hidden pane held
// one, the oldest would silently lose theirs and fall back to the slow DOM
// renderer. If WebGL is unavailable or the context is later lost, dispose the
// addon so xterm falls back to its DOM renderer on its own.
function loadWebglAddon(terminal: Terminal, ref: RefObject<WebglAddon | null>) {
  try {
    const addon = new WebglAddon()
    addon.onContextLoss(() => {
      addon.dispose()
      if (ref.current === addon) ref.current = null
    })
    terminal.loadAddon(addon)
    ref.current = addon
  } catch {
    ref.current = null
  }
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
  onTerminalOutput: (workspaceId: string, terminalId: string, data: Uint8Array) => void
  startupCommand?: string
  terminalId: string
  workspaceId: string
}) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const terminalRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const webglRef = useRef<WebglAddon | null>(null)
  const frameRef = useRef<number | null>(null)
  const isDarkThemeRef = useRef(isDarkTheme)
  const activeRef = useRef(active)
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

    const terminal = new Terminal({
      cursorBlink: true,
      convertEol: false,
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
      fontSize: 12,
      // Leave minimumContrastRatio at its default (1). Forcing a ratio makes
      // xterm recompute a contrast-adjusted color for every cell, which defeats
      // the WebGL glyph-atlas cache and is a large part of why the GPU renderer
      // felt slower, not faster. The themes below already have strong contrast.
      scrollback: TERMINAL_SCROLLBACK_LINES,
      theme: terminalThemeFor(isDarkThemeRef.current),
    })
    const fit = new FitAddon()
    terminal.loadAddon(fit)
    // Full-screen TUIs switch xterm to an alternate buffer, which has no
    // scrollback. Keep the normal buffer so long agent sessions remain
    // scrollable, and ignore explicit scrollback erase requests.
    const scrollbackGuard = terminal.parser.registerCsiHandler(
      { final: "J" },
      (params) => params[0] === 3
    )
    const alternateScreenSetGuard = terminal.parser.registerCsiHandler(
      { prefix: "?", final: "h" },
      (params) => hasTerminalMode(params, ALTERNATE_SCREEN_MODE_CODES)
    )
    const alternateScreenResetGuard = terminal.parser.registerCsiHandler(
      { prefix: "?", final: "l" },
      (params) => hasTerminalMode(params, ALTERNATE_SCREEN_MODE_CODES)
    )
    terminal.open(container)
    terminalRef.current = terminal
    fitRef.current = fit
    syncScrollableState(container, terminal)

    if (activeRef.current) loadWebglAddon(terminal, webglRef)

    const refreshTerminal = () => {
      if (cancelled || terminal.rows < 1) return

      try {
        terminal.refresh(0, terminal.rows - 1)
        syncScrollableState(container, terminal)
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
          syncScrollableState(container, terminal)
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

    const handleOutput = (data: Uint8Array) => {
      if (cancelled) return
      onTerminalOutput(workspaceId, terminalId, data)
      // Just write. xterm's render service already repaints the changed rows on
      // the next frame; forcing a full-viewport refresh() on every chunk (as we
      // did before) redrew every cell on the GPU for each burst of streamed
      // output, which is what made the IDE crawl while agents were working.
      // Scroll state is kept in sync by the onWriteParsed handler below.
      terminal.write(data)
    }

    const startAfterFit = () => {
      try {
        fit.fit()
        refreshTerminal()
        syncScrollableState(container, terminal)
        const cols = terminal.cols || 80
        const rows = terminal.rows || 24
        onSizeChange(cols, rows)
        void startNativeTerminal(workspaceId, terminalId, cols, rows, handleOutput)
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
    const scrollDisposable = terminal.onScroll(() => syncScrollableState(container, terminal))
    const resizeDisposable = terminal.onResize(() => syncScrollableState(container, terminal))
    const writeParsedDisposable = terminal.onWriteParsed(() =>
      syncScrollableState(container, terminal)
    )
    const keyDisposable = terminal.onKey(({ domEvent }) => {
      if (domEvent.key !== "Enter") return
      if (domEvent.metaKey || domEvent.ctrlKey || domEvent.altKey) return
      onTerminalInput(workspaceId, terminalId)
    })
    const observer = new ResizeObserver(fitTerminal)
    observer.observe(container)

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(startAfterFit)
    })

    return () => {
      cancelled = true
      if (frameRef.current) window.cancelAnimationFrame(frameRef.current)
      observer.disconnect()
      dataDisposable.dispose()
      scrollDisposable.dispose()
      resizeDisposable.dispose()
      writeParsedDisposable.dispose()
      keyDisposable.dispose()
      scrollbackGuard.dispose()
      alternateScreenSetGuard.dispose()
      alternateScreenResetGuard.dispose()
      webglRef.current?.dispose()
      webglRef.current = null
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
    if (!active) {
      // Release the GPU context while hidden; xterm falls back to its DOM
      // renderer, which is fine for a pane that isn't being drawn.
      webglRef.current?.dispose()
      webglRef.current = null
      return
    }

    const frame = window.requestAnimationFrame(() => {
      const terminal = terminalRef.current
      const fit = fitRef.current
      if (!terminal || !fit) return

      if (!webglRef.current) loadWebglAddon(terminal, webglRef)

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
