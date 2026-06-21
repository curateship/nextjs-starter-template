import { EditorState } from "@codemirror/state"
import type { Extension } from "@codemirror/state"
import { EditorView } from "@codemirror/view"
import CodeMirror, { type BasicSetupOptions } from "@uiw/react-codemirror"
import { Code2, FileText, Save, Settings, X } from "lucide-react"
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react"
import type { ReactNode } from "react"

import { clipboardImage } from "@/app/clipboard"
import {
  buildSplitDiffDecorations,
  changedLineExtension,
  editorTheme,
  type CodeMirrorTheme,
} from "@/app/editor"
import { isSettingsTab } from "@/app/editor-tabs"
import { loadLanguageForPath } from "@/app/language"
import type { EditorTab } from "@/app/types"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

type MinimapRow = {
  changed: boolean
  empty: boolean
  height: number
  key: string
  top: number
  width: number
}

const MAX_MINIMAP_CHARS = 200_000
const MAX_MINIMAP_LINES = 5_000

function minimapLineWidth(line: string) {
  const length = line.trimEnd().length
  if (!length) return 12
  return Math.min(100, Math.max(22, length * 1.8))
}

function shouldRenderMinimap(value: string) {
  if (value.length > MAX_MINIMAP_CHARS) return false

  let lineCount = 1
  for (let index = 0; index < value.length; index += 1) {
    if (value.charCodeAt(index) !== 10) continue
    lineCount += 1
    if (lineCount > MAX_MINIMAP_LINES) return false
  }

  return true
}

function EditorWithMinimap({
  basicSetup,
  changedLines,
  codeMirrorTheme,
  extensions,
  onChange,
  onCreateEditor,
  onScroll,
  value,
}: {
  basicSetup?: boolean | BasicSetupOptions
  changedLines?: number[]
  codeMirrorTheme: CodeMirrorTheme
  extensions: Extension[]
  onChange: (value: string) => void
  onCreateEditor?: (view: EditorView) => void
  onScroll?: (view: EditorView) => void
  value: string
}) {
  const viewRef = useRef<EditorView | null>(null)
  const [scrollInfo, setScrollInfo] = useState({
    clientHeight: 1,
    lineCount: 1,
    scrollHeight: 1,
    scrollTop: 0,
    viewportFromLine: 1,
    viewportToLine: 1,
  })
  const minimapEnabled = shouldRenderMinimap(value)
  const minimapValue = useDeferredValue(minimapEnabled ? value : "")
  const changedLineSet = useMemo(() => new Set(changedLines ?? []), [changedLines])
  const rows = useMemo<MinimapRow[]>(() => {
    if (!minimapEnabled) return []

    const lines = minimapValue.split("\n")
    const lineCount = Math.max(1, lines.length)
    const maxRows = 320

    if (lines.length <= maxRows) {
      return lines.map((line, index) => ({
        changed: changedLineSet.has(index + 1),
        empty: !line.trim(),
        height: 100 / lineCount,
        key: String(index),
        top: (index / lineCount) * 100,
        width: minimapLineWidth(line),
      }))
    }

    const step = lines.length / maxRows
    return Array.from({ length: maxRows }, (_, index) => {
      const start = Math.floor(index * step)
      const end = Math.max(start + 1, Math.floor((index + 1) * step))
      const chunk = lines.slice(start, end)
      const longest = chunk.reduce((current, line) =>
        line.length > current.length ? line : current
      , "")

      return {
        changed: chunk.some((_, offset) => changedLineSet.has(start + offset + 1)),
        empty: !longest.trim(),
        height: ((end - start) / lineCount) * 100,
        key: `${start}-${end}`,
        top: (start / lineCount) * 100,
        width: minimapLineWidth(longest),
      }
    })
  }, [changedLineSet, minimapEnabled, minimapValue])
  const updateScrollInfo = useCallback((view: EditorView | null) => {
    if (!view) return

    const { clientHeight, scrollHeight, scrollTop } = view.scrollDOM
    const lineCount = view.state.doc.lines
    const firstVisibleRange = view.visibleRanges[0] ?? view.viewport
    const lastVisibleRange = view.visibleRanges[view.visibleRanges.length - 1] ?? view.viewport
    const viewportFromLine = view.state.doc.lineAt(firstVisibleRange.from).number
    const viewportToLine = view.state.doc.lineAt(lastVisibleRange.to).number

    setScrollInfo((current) => {
      if (
        current.clientHeight === clientHeight &&
        current.lineCount === lineCount &&
        current.scrollHeight === scrollHeight &&
        current.scrollTop === scrollTop &&
        current.viewportFromLine === viewportFromLine &&
        current.viewportToLine === viewportToLine
      ) {
        return current
      }

      return {
        clientHeight,
        lineCount,
        scrollHeight,
        scrollTop,
        viewportFromLine,
        viewportToLine,
      }
    })
  }, [])
  const minimapExtension = useMemo(
    () =>
      EditorView.updateListener.of((update) => {
        if (update.docChanged || update.geometryChanged || update.viewportChanged) {
          updateScrollInfo(update.view)
        }
      }),
    [updateScrollInfo]
  )
  const editorExtensions = useMemo(
    () => (minimapEnabled ? [...extensions, minimapExtension] : extensions),
    [extensions, minimapEnabled, minimapExtension]
  )

  useEffect(() => {
    if (!minimapEnabled) return

    const frame = requestAnimationFrame(() => updateScrollInfo(viewRef.current))
    return () => cancelAnimationFrame(frame)
  }, [minimapEnabled, updateScrollInfo, minimapValue])

  function scrollToPointer(event: React.PointerEvent<HTMLDivElement>) {
    event.preventDefault()
    event.stopPropagation()

    const view = viewRef.current
    if (!view) return

    const rect = event.currentTarget.getBoundingClientRect()
    const ratio = Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height))
    const line = Math.max(1, Math.min(view.state.doc.lines, Math.round(ratio * view.state.doc.lines)))
    const pos = view.state.doc.line(line).from

    view.dispatch({
      effects: EditorView.scrollIntoView(pos, { y: "center" }),
    })
    requestAnimationFrame(() => {
      updateScrollInfo(view)
      onScroll?.(view)
    })
    view.focus()
  }

  const lineCount = Math.max(1, scrollInfo.lineCount)
  const viewportTop = Math.min(100, ((scrollInfo.viewportFromLine - 1) / lineCount) * 100)
  const viewportHeight = Math.min(
    100 - viewportTop,
    Math.max(8, ((scrollInfo.viewportToLine - scrollInfo.viewportFromLine + 1) / lineCount) * 100)
  )

  return (
    <div className={cn("editor-with-minimap", minimapEnabled && "has-minimap")}>
      <CodeMirror
        value={value}
        height="100%"
        theme={codeMirrorTheme}
        extensions={editorExtensions}
        basicSetup={basicSetup}
        onChange={onChange}
        onCreateEditor={(view) => {
          viewRef.current = view
          updateScrollInfo(view)
          onCreateEditor?.(view)
        }}
      />
      {minimapEnabled ? (
        <div
          className="code-minimap"
          role="scrollbar"
          aria-label="Editor minimap"
          aria-orientation="vertical"
          aria-valuemax={Math.max(0, scrollInfo.scrollHeight - scrollInfo.clientHeight)}
          aria-valuemin={0}
          aria-valuenow={scrollInfo.scrollTop}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId)
            scrollToPointer(event)
          }}
          onPointerMove={(event) => {
            if (event.buttons === 1) scrollToPointer(event)
          }}
        >
          <div className="code-minimap__lines">
            {rows.map((row) => (
              <span
                key={row.key}
                className={cn(
                  "code-minimap__line",
                  row.empty && "is-empty",
                  row.changed && "is-changed"
                )}
                style={{
                  height: `${row.height}%`,
                  top: `${row.top}%`,
                  width: `${row.width}%`,
                }}
              />
            ))}
          </div>
          <div
            className="code-minimap__viewport"
            style={{ height: `${viewportHeight}%`, top: `${viewportTop}%` }}
          />
        </div>
      ) : null}
    </div>
  )
}

export function EditorPanel({
  activePath,
  codeMirrorTheme,
  saving,
  settingsDirty,
  settingsPanel,
  tab,
  tabs,
  onChange,
  onCloseTab,
  onPasteImage,
  onSave,
  onSelectTab,
}: {
  activePath: string
  codeMirrorTheme: CodeMirrorTheme
  saving: boolean
  settingsDirty: boolean
  settingsPanel: ReactNode
  tab?: EditorTab
  tabs: EditorTab[]
  onChange: (value: string) => void
  onCloseTab: (path: string) => void
  onPasteImage: (event: ClipboardEvent, view: EditorView) => void
  onSave: () => void
  onSelectTab: (path: string) => void
}) {
  const pasteImageExtension = useMemo(
    () =>
      EditorView.domEventHandlers({
        paste(event, view) {
          if (!clipboardImage(event)) return false
          onPasteImage(event, view)
          return true
        },
      }),
    [onPasteImage]
  )
  const languageExtensions = useLanguageExtensions(tab?.path)
  const baseExtensions = useMemo(
    () => [editorTheme, ...languageExtensions],
    [languageExtensions]
  )
  const editableExtensions = useMemo(
    () => [...baseExtensions, pasteImageExtension],
    [baseExtensions, pasteImageExtension]
  )
  const tabChangedLines = tab?.changedLines
  const tabContents = tab?.contents ?? ""
  const tabDiffHunks = tab?.diffHunks
  const tabOriginalContents = tab?.originalContents
  const tabPath = tab?.path
  const splitDiffDecorations = useMemo(
    () =>
      tabOriginalContents !== undefined
        ? buildSplitDiffDecorations(
            tabOriginalContents,
            tabContents,
            tabChangedLines ?? [],
            tabDiffHunks
          )
        : null,
    [tabChangedLines, tabContents, tabDiffHunks, tabOriginalContents]
  )
  const singleEditableExtensions = useMemo(
    () => [
      ...editableExtensions,
      changedLineExtension(tabChangedLines ?? [], "cm-current-changed-line"),
    ],
    [editableExtensions, tabChangedLines]
  )
  const [originalView, setOriginalView] = useState<EditorView | null>(null)
  const [currentView, setCurrentView] = useState<EditorView | null>(null)
  const syncScroll = useCallback((source: EditorView, target: EditorView | null) => {
    if (!target) return

    const { scrollLeft, scrollTop } = source.scrollDOM
    if (target.scrollDOM.scrollTop === scrollTop && target.scrollDOM.scrollLeft === scrollLeft) {
      return
    }

    target.scrollDOM.scrollTop = scrollTop
    target.scrollDOM.scrollLeft = scrollLeft
  }, [])
  const originalSyncExtension = useMemo(
    () =>
      EditorView.updateListener.of((update) => {
        if (update.viewportChanged) syncScroll(update.view, currentView)
      }),
    [currentView, syncScroll]
  )
  const currentSyncExtension = useMemo(
    () =>
      EditorView.updateListener.of((update) => {
        if (update.viewportChanged) syncScroll(update.view, originalView)
      }),
    [originalView, syncScroll]
  )
  const originalExtensions = useMemo(
    () =>
      tabPath
        ? [
            editorTheme,
            changedLineExtension(
              splitDiffDecorations?.originalChangedLines ?? [],
              "cm-original-changed-line",
              splitDiffDecorations?.originalSpacers ?? [],
              "cm-original-diff-spacer"
            ),
            EditorState.readOnly.of(true),
            EditorView.editable.of(false),
            originalSyncExtension,
            ...languageExtensions,
          ]
        : [],
    [languageExtensions, originalSyncExtension, splitDiffDecorations, tabPath]
  )
  const splitEditableExtensions = useMemo(
    () => [
      ...editableExtensions,
      changedLineExtension(
        splitDiffDecorations?.currentChangedLines ?? [],
        "cm-current-changed-line",
        splitDiffDecorations?.currentSpacers ?? [],
        "cm-current-diff-spacer"
      ),
      currentSyncExtension,
    ],
    [currentSyncExtension, editableExtensions, splitDiffDecorations]
  )

  return (
    <div className="grid h-full min-h-0 grid-rows-[42px_1fr]">
      <div className="flex min-w-0 items-center justify-between bg-muted/35">
        <div className="flex min-w-0 flex-1 items-stretch overflow-hidden">
          {tabs.length ? (
            tabs.map((item) => {
              const dirty =
                isSettingsTab(item)
                  ? settingsDirty
                  : item.contents !== item.savedContents
              const TabIcon = isSettingsTab(item) ? Settings : FileText

              return (
                <div
                  key={item.path}
                  className={cn(
                    "flex h-10 max-w-56 min-w-28 items-center border-r text-sm text-muted-foreground transition-colors hover:bg-muted/70",
                    activePath === item.path && "bg-background text-foreground"
                  )}
                >
                  <button
                    type="button"
                    className="flex h-full min-w-0 flex-1 items-center gap-2 px-3 text-left"
                    onClick={() => onSelectTab(item.path)}
                  >
                    <TabIcon className="size-3.5 shrink-0" />
                    <span className="truncate font-medium">{item.name}</span>
                    {dirty ? <span className="size-1.5 shrink-0 rounded-full bg-amber-500" /> : null}
                  </button>
                  <button
                    type="button"
                    className="mr-1 rounded p-0.5 hover:bg-muted"
                    onClick={() => onCloseTab(item.path)}
                    aria-label={`Close ${item.name}`}
                  >
                    <X className="size-4" />
                  </button>
                </div>
              )
            })
          ) : (
            <div className="flex h-10 items-center gap-2 px-3 text-sm font-medium text-muted-foreground">
              <FileText className="size-3.5" />
              Untitled
            </div>
          )}
        </div>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              disabled={!tab || saving}
              onClick={onSave}
              className="mr-2 size-7"
              aria-label="Save"
            >
              <Save />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Save</TooltipContent>
        </Tooltip>
      </div>

      <div className="h-full min-h-0 overflow-hidden bg-background">
        {tab ? (
          isSettingsTab(tab) ? (
            settingsPanel
          ) : (
          <div className="grid h-full min-h-0 grid-rows-[minmax(0,1fr)_auto]">
            {tab.originalContents !== undefined ? (
              <div className="grid h-full min-h-0 grid-cols-2">
                <div className="grid h-full min-h-0 min-w-0 grid-rows-[28px_minmax(0,1fr)] border-r">
                  <div className="flex items-center border-b bg-muted/35 px-3 text-xs font-medium text-muted-foreground">
                    Original
                  </div>
                  <div className="min-h-0 overflow-hidden">
                    <CodeMirror
                      value={tab.originalContents}
                      height="100%"
                      theme={codeMirrorTheme}
                      extensions={originalExtensions}
                      basicSetup={{ foldGutter: true, highlightActiveLine: false }}
                      onCreateEditor={(view) => {
                        setOriginalView(view)
                      }}
                    />
                  </div>
                </div>
                <div className="grid h-full min-h-0 min-w-0 grid-rows-[28px_minmax(0,1fr)]">
                  <div className="flex items-center border-b bg-muted/35 px-3 text-xs font-medium text-muted-foreground">
                    Current
                  </div>
                  <EditorWithMinimap
                    value={tab.contents}
                    codeMirrorTheme={codeMirrorTheme}
                    extensions={splitEditableExtensions}
                    changedLines={splitDiffDecorations?.currentChangedLines ?? tab.changedLines}
                    basicSetup={{ foldGutter: true, highlightActiveLine: true }}
                    onChange={onChange}
                    onCreateEditor={(view) => {
                      setCurrentView(view)
                    }}
                    onScroll={(view) => syncScroll(view, originalView)}
                  />
                </div>
              </div>
            ) : (
              <EditorWithMinimap
                value={tab.contents}
                codeMirrorTheme={codeMirrorTheme}
                extensions={singleEditableExtensions}
                changedLines={tab.changedLines}
                basicSetup={{ foldGutter: true, highlightActiveLine: true }}
                onChange={onChange}
              />
            )}
            {tab.error ? (
              <div className="border-t border-amber-300 bg-amber-50 px-4 py-2 text-xs text-amber-800">
                {tab.error}
              </div>
            ) : null}
          </div>
          )
        ) : (
          <div className="flex h-full items-center justify-center p-8 text-center text-muted-foreground">
            <div className="max-w-sm">
              <div className="mx-auto mb-4 flex size-11 items-center justify-center rounded-full bg-muted">
                <Code2 className="size-5" />
              </div>
              <div className="text-base font-semibold text-foreground">
                Open a text file
              </div>
              <p className="mt-1 text-sm">
                Choose a workspace file, task, skill, or doc to edit.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function useLanguageExtensions(path: string | undefined) {
  const requestedPath = path ?? ""
  const [loaded, setLoaded] = useState<{ extensions: Extension[]; path: string }>({
    extensions: [],
    path: "",
  })

  useEffect(() => {
    let cancelled = false

    void loadLanguageForPath(requestedPath)
      .then((nextExtensions) => {
        if (!cancelled) setLoaded({ extensions: nextExtensions, path: requestedPath })
      })
      .catch(() => {
        if (!cancelled) setLoaded({ extensions: [], path: requestedPath })
      })

    return () => {
      cancelled = true
    }
  }, [requestedPath])

  return loaded.path === requestedPath ? loaded.extensions : []
}
