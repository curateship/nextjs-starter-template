import * as React from "react"
import {
  Film,
  Loader2,
  Music,
  Plus,
  Replace,
  Scissors,
  Search,
  Type,
  Upload,
} from "lucide-react"

import { useShellRuntime } from "@/components/shell-runtime"
import {
  generateProjectCaptions,
  getCaptionErrorMessage,
} from "@/lib/api/captions"
import {
  getMediaErrorMessage,
  listMedia,
  uploadMedia,
  type MediaFileType,
  type MediaItem,
} from "@/lib/api/media"
import { SOUND_EFFECTS, soundEffectUrl } from "@/lib/sound-effects"
import { requireTextFont, type TextFontId } from "@/lib/text-fonts"
import {
  getTranscriptWordPlacement,
  mapTranscriptWordSpanToClipRemoval,
  type TranscriptSource,
  type TranscriptWord,
} from "@/lib/transcript-editing"
import { AiPanel } from "@/pages/video-editor/editor-settings-panel"
import {
  useEditorRuntime,
  useEditorSelector,
  type EditorClip,
} from "@/pages/video-editor/editor-store"
import {
  DEFAULT_IMAGE_DURATION_MS,
  DEFAULT_TEXT_DURATION_MS,
  editorId,
  formatClock,
  loadMediaDurationMs,
  MIN_CLIP_MS,
  waveformDataUrl,
} from "@/pages/video-editor/timeline-utils"
import {
  ReplaceMediaDialog,
  type ReplacementMedia,
} from "@/pages/video-editor/replace-media-dialog"
import { useAudioPreview } from "@/pages/video-editor/use-audio-preview"
import {
  filmstripFrameStyle,
  getVideoFilmstrip,
  type FilmstripFrame,
} from "@/pages/video-editor/video-thumbnails"

export type StudioPanel =
  | "slots"
  | "media"
  | "text"
  | "ai"
  | "audio"
  | "brand"
  | "transcript"

const PANEL_TITLE: Record<StudioPanel, string> = {
  slots: "Slots",
  media: "Media",
  text: "Text",
  ai: "AI Studio",
  audio: "Audio",
  brand: "Brand Kit",
  transcript: "Transcript",
}

const PANEL_TITLE_STYLE: React.CSSProperties = {
  fontFamily: "'Bebas Neue'",
  fontSize: 22,
  letterSpacing: ".02em",
  lineHeight: 1,
}

export function StudioContextPanel({ panel }: { panel: StudioPanel }) {
  // Media owns its own header row so the search/add controls can sit up top.
  if (panel === "media") {
    return <MediaPanel />
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "16px 16px 12px",
          flex: "none",
        }}
      >
        <div style={PANEL_TITLE_STYLE}>{PANEL_TITLE[panel]}</div>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "0 16px 18px" }}>
        {panel === "slots" ? (
          <SlotsPanel />
        ) : panel === "text" ? (
          <TextPanel />
        ) : panel === "ai" ? (
          <AiStudioPanel />
        ) : panel === "audio" ? (
          <AudioPanel />
        ) : panel === "transcript" ? (
          <TranscriptPanel />
        ) : (
          <BrandPanel />
        )}
      </div>
    </div>
  )
}

function Label({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div className="st-lbl" style={{ marginBottom: 10, ...style }}>
      {children}
    </div>
  )
}

// ---------------------------------------------------------------- Slots -----

// Template workflow: the replaceable clips, ordered by time. Click to jump the
// playhead there; Replace swaps the media while the slot keeps its slot.
function SlotsPanel() {
  const tracks = useEditorSelector((state) => state.tracks)
  const selectedClipId = useEditorSelector((state) => state.selectedClipId)
  const { dispatch, clock, mode } = useEditorRuntime()
  const slots = tracks
    .flatMap((t) => t.clips)
    .filter((c) => c.replaceable)
    .sort((a, b) => a.startMs - b.startMs)
  const [replaceClip, setReplaceClip] = React.useState<EditorClip | null>(null)

  function handleReplace(media: ReplacementMedia) {
    if (!replaceClip) return
    dispatch({ type: "REPLACE_CLIP_MEDIA", clipId: replaceClip.id, media })
    setReplaceClip(null)
  }

  if (!slots.length) {
    return (
      <div style={{ textAlign: "center", padding: "26px 10px", color: "var(--mut)" }}>
        <div style={{ display: "grid", placeItems: "center", marginBottom: 8, color: "var(--line2)" }}>
          <Film size={26} />
        </div>
        <div style={{ fontSize: 12, color: "var(--ink2)", lineHeight: 1.5 }}>
          No replaceable slots yet.
          {mode === "template-builder"
            ? " Toggle a clip as “Replaceable” in the inspector."
            : ""}
        </div>
      </div>
    )
  }

  return (
    <div>
      <Label>Slots · {slots.length}</Label>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 9 }}>
        {slots.map((slot) => {
          const on = selectedClipId === slot.id
          return (
            <div
              key={slot.id}
              className="st-hovcard"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: 9,
                minWidth: 0,
                background: "var(--panel2)",
                border: `1px solid ${on ? "var(--acc)" : "var(--line)"}`,
                borderRadius: 12,
                boxShadow: on ? "0 0 0 2px var(--acc-soft)" : "none",
              }}
            >
              <button
                type="button"
                onClick={() => {
                  dispatch({ type: "SELECT_CLIP", clipId: slot.id })
                  clock.seek(slot.startMs)
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  flex: 1,
                  minWidth: 0,
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  textAlign: "left",
                  padding: 0,
                }}
              >
                <SlotThumb slot={slot} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={rowTitle}>{slot.segmentLabel || slot.name}</div>
                  <div style={rowMeta}>
                    {formatClock(slot.startMs)} ·{" "}
                    {Math.round(slot.durationMs / 100) / 10}s
                  </div>
                </div>
              </button>
              {slot.kind !== "text" ? (
                <button
                  type="button"
                  className="st-hovbg"
                  onClick={() => setReplaceClip(slot)}
                  title={mode === "template-builder" ? "Set default media" : "Replace media"}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 5,
                    flex: "none",
                    height: 28,
                    padding: "0 9px",
                    background: "var(--panel)",
                    border: "1px solid var(--line2)",
                    borderRadius: 8,
                    color: "var(--ink)",
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  <Replace size={13} />
                  {mode === "template-builder" ? "Default" : "Replace"}
                </button>
              ) : null}
            </div>
          )
        })}
      </div>
      {replaceClip && replaceClip.kind !== "text" ? (
        <ReplaceMediaDialog
          clipKind={replaceClip.kind}
          open={!!replaceClip}
          onOpenChange={(open) => !open && setReplaceClip(null)}
          onReplace={handleReplace}
        />
      ) : null}
    </div>
  )
}

function SlotThumb({ slot }: { slot: EditorClip }) {
  const frameKey =
    slot.kind === "video" && slot.mediaId
      ? `${slot.mediaId}:${slot.trimStartMs}:${slot.durationMs}`
      : null
  const [frame, setFrame] = React.useState<{
    key: string
    value: FilmstripFrame | null
  } | null>(null)

  React.useEffect(() => {
    if (!frameKey || !slot.mediaId) return
    const controller = new AbortController()
    getVideoFilmstrip(slot.mediaId, {
      startMs: slot.trimStartMs,
      durationMs: slot.durationMs,
    }, controller.signal)
      .then((frames) => {
        if (!controller.signal.aborted) {
          setFrame({ key: frameKey, value: frames[0] ?? null })
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setFrame({ key: frameKey, value: null })
        }
      })
    return () => {
      controller.abort()
    }
  }, [frameKey, slot.mediaId, slot.trimStartMs, slot.durationMs])

  const frameValue = frame?.key === frameKey ? frame.value : null
  const box: React.CSSProperties = {
    height: 46,
    width: 34,
    flex: "none",
    borderRadius: 8,
    overflow: "hidden",
    border: "1px solid var(--line)",
    background: "var(--elev)",
    display: "grid",
    placeItems: "center",
    color: "var(--mut)",
  }
  const img: React.CSSProperties = { height: "100%", width: "100%", objectFit: "cover" }

  if (slot.kind === "image" && slot.url) {
    return <div style={box}><img src={slot.url} alt="" draggable={false} style={img} /></div>
  }
  if (slot.kind === "video" && frameValue) {
    return (
      <div
        style={{
          ...box,
          ...filmstripFrameStyle(frameValue, 34 / 46),
        }}
      />
    )
  }
  return (
    <div style={box}>
      {slot.kind === "audio" ? <Music size={15} /> : slot.kind === "text" ? <Type size={15} /> : <Film size={15} />}
    </div>
  )
}

// ------------------------------------------------------------ Transcript ----

type TranscriptData = { source: TranscriptSource; words: TranscriptWord[] }

// Word-level transcript editor: transcribe the project audio, click a word to
// jump the playhead there, shift-click to select a range, then cut it (one
// undoable jump-cut). Project-only (needs the caption backend).
function TranscriptPanel() {
  const tracks = useEditorSelector((state) => state.tracks)
  const { dispatch, clock, documentId, flushSave } = useEditorRuntime()
  const [transcript, setTranscript] = React.useState<TranscriptData | null>(null)
  const [selection, setSelection] = React.useState<{
    anchor: number
    focus: number
  } | null>(null)
  const [transcribing, setTranscribing] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const range = selection
    ? {
        start: Math.min(selection.anchor, selection.focus),
        end: Math.max(selection.anchor, selection.focus),
      }
    : null

  async function handleTranscribe() {
    setTranscribing(true)
    setError(null)
    try {
      await flushSave()
      const result = await generateProjectCaptions(documentId, "openai")
      const words = result.captions.flatMap((line) =>
        (line.words ?? []).map((word) => ({
          text: word.text,
          startMs: line.startMs + word.startMs,
          endMs: Math.min(line.endMs, line.startMs + word.endMs),
        }))
      )
      if (!words.length) {
        setError("No word-timed speech found.")
        return
      }
      setTranscript({ source: result.source, words })
      setSelection(null)
    } catch (caught) {
      setError(getCaptionErrorMessage(caught))
    } finally {
      setTranscribing(false)
    }
  }

  function selectWord(index: number, extend: boolean) {
    if (!transcript) return
    const placement = getTranscriptWordPlacement(
      transcript.words[index],
      transcript.source,
      tracks
    )
    if (!placement) return
    clock.seek(placement.timelineStartMs)
    setSelection((current) =>
      extend && current ? { ...current, focus: index } : { anchor: index, focus: index }
    )
    setError(null)
  }

  function cutSelection() {
    if (!transcript || !range) return
    const action = mapTranscriptWordSpanToClipRemoval(
      transcript.words,
      range.start,
      range.end,
      transcript.source,
      tracks
    )
    if (!action) {
      setError("Select an uncut word range within one clip segment.")
      return
    }
    const removal = action.removals[0]
    if (removal.clipEndMs - removal.clipStartMs < MIN_CLIP_MS) {
      setError("That word range is too short to cut.")
      return
    }
    dispatch({ type: "APPLY_JUMP_CUTS", ...action })
    setSelection(null)
    setError(null)
  }

  function handleKeyDown(event: React.KeyboardEvent) {
    if (range && (event.key === "Delete" || event.key === "Backspace")) {
      event.preventDefault()
      cutSelection()
    }
  }

  const sentences = transcript ? groupTranscriptWords(transcript.words) : []

  return (
    <div onKeyDown={handleKeyDown}>
      <div style={{ fontSize: 11.5, color: "var(--ink2)", lineHeight: 1.5, marginBottom: 12 }}>
        Click a word to jump the playhead there. Shift-click to select a range,
        then cut it.
      </div>
      <button
        type="button"
        className="st-hovbright"
        disabled={transcribing}
        onClick={() => void handleTranscribe()}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 7,
          width: "100%",
          height: 34,
          background: "var(--ink)",
          border: "none",
          borderRadius: 10,
          color: "var(--paper)",
          fontSize: 12.5,
          fontWeight: 600,
          cursor: "pointer",
          marginBottom: 14,
          opacity: transcribing ? 0.7 : 1,
        }}
      >
        {transcribing ? <Loader2 size={14} className="st-spin" /> : null}
        {transcript ? "Re-transcribe" : "Transcribe"}
      </button>

      {error ? (
        <div style={{ fontSize: 11.5, color: "var(--coral)", marginBottom: 12 }}>{error}</div>
      ) : null}

      {transcript ? (
        <>
          <div
            style={{
              background: "var(--panel2)",
              border: "1px solid var(--line)",
              borderRadius: 12,
              padding: 12,
              display: "grid",
              gap: 10,
              marginBottom: 12,
            }}
          >
            {sentences.map((sentence, sentenceIndex) => (
              <p
                key={sentenceIndex}
                style={{ margin: 0, display: "flex", flexWrap: "wrap", gap: 3, lineHeight: 1.7 }}
              >
                {sentence.map((index) => {
                  const word = transcript.words[index]
                  const removed = !getTranscriptWordPlacement(word, transcript.source, tracks)
                  const selected =
                    !removed && range !== null && index >= range.start && index <= range.end
                  return (
                    <button
                      key={index}
                      type="button"
                      disabled={removed}
                      aria-pressed={selected}
                      onClick={(event) => selectWord(index, event.shiftKey)}
                      style={{
                        border: "none",
                        borderRadius: 4,
                        padding: "1px 3px",
                        fontSize: 13,
                        cursor: removed ? "default" : "pointer",
                        background: selected ? "var(--acc-soft)" : "transparent",
                        color: removed
                          ? "var(--mut)"
                          : selected
                            ? "var(--acc2)"
                            : "var(--ink)",
                        textDecoration: removed ? "line-through" : "none",
                      }}
                    >
                      {word.text}
                    </button>
                  )
                })}
              </p>
            ))}
          </div>
          <button
            type="button"
            className="st-hovbg"
            disabled={!range}
            onClick={cutSelection}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 7,
              width: "100%",
              height: 34,
              background: "var(--panel2)",
              border: "1px solid var(--line2)",
              borderRadius: 10,
              color: "var(--ink)",
              fontSize: 12.5,
              fontWeight: 600,
              cursor: "pointer",
              opacity: range ? 1 : 0.5,
            }}
          >
            <Scissors size={14} />
            Cut selected words
          </button>
          <div style={{ fontSize: 10.5, color: "var(--mut)", marginTop: 8, lineHeight: 1.5 }}>
            Delete/Backspace cuts as one undoable edit. Re-transcribe after
            replacing or trimming the source clip.
          </div>
        </>
      ) : (
        <div
          style={{
            border: "1.5px dashed var(--line2)",
            borderRadius: 12,
            padding: 18,
            textAlign: "center",
            background: "var(--panel2)",
            color: "var(--mut)",
            fontSize: 11.5,
            lineHeight: 1.5,
          }}
        >
          Transcribe the project&apos;s main audio to edit the video from its words.
        </div>
      )}
    </div>
  )
}

function groupTranscriptWords(words: TranscriptWord[]) {
  const sentences: number[][] = []
  let sentence: number[] = []
  words.forEach((word, index) => {
    sentence.push(index)
    if (/[.!?]["')\]]*$/.test(word.text)) {
      sentences.push(sentence)
      sentence = []
    }
  })
  if (sentence.length) sentences.push(sentence)
  return sentences
}

// ---------------------------------------------------------------- Media -----

const MEDIA_FILTERS: { id: "all" | MediaFileType; label: string }[] = [
  { id: "all", label: "All" },
  { id: "video", label: "Video" },
  { id: "image", label: "Image" },
  { id: "audio", label: "Audio" },
]

// Probe duration + build a timeline clip (mirrors the media panel's builder).
async function buildMediaClip(item: MediaItem): Promise<EditorClip> {
  if (item.file_type === "image") {
    return {
      id: editorId(),
      kind: "image",
      name: item.original_name,
      mediaId: item.id,
      url: item.url,
      trimStartMs: 0,
      startMs: 0,
      durationMs: DEFAULT_IMAGE_DURATION_MS,
    }
  }
  const kind = item.file_type === "video" ? "video" : "audio"
  const mediaUrl = item.proxy_url ?? item.url
  const sourceDurationMs = await loadMediaDurationMs(mediaUrl, kind)
  return {
    id: editorId(),
    kind,
    name: item.original_name,
    mediaId: item.id,
    url: mediaUrl,
    sourceDurationMs,
    trimStartMs: 0,
    startMs: 0,
    durationMs: sourceDurationMs,
  }
}

function MediaPanel() {
  const { kind, documentId, dispatch, clock } = useEditorRuntime()
  const [filter, setFilter] = React.useState<"all" | MediaFileType>("all")
  const [search, setSearch] = React.useState("")
  const [debounced, setDebounced] = React.useState("")
  const [searchOpen, setSearchOpen] = React.useState(false)
  const [items, setItems] = React.useState<MediaItem[]>([])
  const [error, setError] = React.useState<string | null>(null)
  const [refresh, setRefresh] = React.useState(0)
  const [uploading, setUploading] = React.useState(false)
  const fileRef = React.useRef<HTMLInputElement>(null)
  const projectId = kind === "project" ? documentId : undefined

  React.useEffect(() => {
    const id = setTimeout(() => setDebounced(search.trim()), 250)
    return () => clearTimeout(id)
  }, [search])

  React.useEffect(() => {
    let active = true
    listMedia({
      pageSize: 30,
      fileTypes: filter === "all" ? undefined : [filter],
      projectId,
      search: debounced || undefined,
    })
      .then((data) => {
        if (!active) return
        setItems(data.media)
        setError(null)
      })
      .catch((caught) => {
        if (!active) return
        setError(getMediaErrorMessage(caught))
      })
    return () => {
      active = false
    }
  }, [filter, debounced, projectId, refresh])

  async function addItem(item: MediaItem) {
    try {
      setError(null)
      const clip = await buildMediaClip(item)
      dispatch({ type: "ADD_CLIP", clip, atMs: clock.getTime() })
    } catch (caught) {
      setError(getMediaErrorMessage(caught))
    }
  }

  async function handleUpload(files: FileList | null) {
    if (!files?.length) return
    setUploading(true)
    setError(null)
    try {
      for (const file of Array.from(files)) {
        await uploadMedia(file, undefined, projectId ? { projectId } : {})
      }
      setRefresh((c) => c + 1)
    } catch (caught) {
      setError(getMediaErrorMessage(caught))
    } finally {
      setUploading(false)
    }
  }

  const iconBtn: React.CSSProperties = {
    height: 34,
    width: 34,
    display: "grid",
    placeItems: "center",
    background: "var(--elev)",
    border: "none",
    borderRadius: 9,
    color: "var(--ink)",
    cursor: "pointer",
    flex: "none",
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          padding: "16px 16px 12px",
          flex: "none",
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, minWidth: 0 }}>
          <div style={PANEL_TITLE_STYLE}>Media</div>
          <span style={{ fontSize: 11, color: "var(--mut)", whiteSpace: "nowrap" }}>
            {items.length} items
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flex: "none" }}>
          <div style={{ position: "relative" }}>
            <button
              type="button"
              className="st-hovbg"
              onClick={() => setSearchOpen((o) => !o)}
              style={{ ...iconBtn, color: search ? "var(--acc)" : "var(--ink)" }}
              title="Search media"
            >
              <Search size={15} />
            </button>
            {searchOpen ? (
              <>
                <div
                  style={{ position: "fixed", inset: 0, zIndex: 40 }}
                  onClick={() => setSearchOpen(false)}
                />
                <div
                  style={{
                    position: "absolute",
                    top: "calc(100% + 6px)",
                    right: 0,
                    zIndex: 41,
                    width: 232,
                    padding: 8,
                    background: "var(--panel)",
                    border: "1px solid var(--line)",
                    borderRadius: 11,
                    boxShadow: "var(--sh-lg)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      height: 32,
                      padding: "0 10px",
                      background: "var(--elev)",
                      borderRadius: 8,
                    }}
                  >
                    <Search size={13} style={{ color: "var(--mut)" }} />
                    <input
                      autoFocus
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Escape") setSearchOpen(false)
                      }}
                      placeholder="Search media"
                      style={{
                        flex: 1,
                        minWidth: 0,
                        background: "transparent",
                        border: "none",
                        outline: "none",
                        fontSize: 12,
                        color: "var(--ink)",
                      }}
                    />
                    {search ? (
                      <button
                        type="button"
                        onClick={() => setSearch("")}
                        style={{
                          border: "none",
                          background: "transparent",
                          color: "var(--mut)",
                          cursor: "pointer",
                          fontSize: 14,
                          lineHeight: 1,
                          padding: 0,
                        }}
                        title="Clear search"
                      >
                        ×
                      </button>
                    ) : null}
                  </div>
                </div>
              </>
            ) : null}
          </div>
          <button
            type="button"
            className="st-hovbg"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            style={{ ...iconBtn, opacity: uploading ? 0.6 : 1 }}
            title="Upload media"
          >
            {uploading ? <Loader2 size={15} className="st-spin" /> : <Plus size={15} />}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="video/*,image/*,audio/*"
            multiple
            hidden
            onChange={(e) => {
              void handleUpload(e.target.files)
              e.target.value = ""
            }}
          />
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "0 16px 18px" }}>
        <div
          style={{
            display: "flex",
            gap: 2,
            padding: 3,
            background: "var(--elev)",
            borderRadius: 9,
            marginBottom: 15,
          }}
        >
          {MEDIA_FILTERS.map((f) => {
            const on = filter === f.id
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilter(f.id)}
                style={{
                  flex: 1,
                  padding: "6px 8px",
                  border: "none",
                  borderRadius: 8,
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: "pointer",
                  background: on ? "var(--panel)" : "transparent",
                  color: on ? "var(--ink)" : "var(--ink2)",
                  boxShadow: on ? "var(--sh-sm)" : "none",
                }}
              >
                {f.label}
              </button>
            )
          })}
        </div>

        {items.length === 0 ? (
          <div
            className="st-hovcard"
            onClick={() => fileRef.current?.click()}
            style={{
              border: "1.5px dashed var(--line2)",
              borderRadius: 13,
              padding: "20px 12px",
              textAlign: "center",
              marginBottom: 18,
              background: "var(--panel2)",
              cursor: "pointer",
              transition: "background .13s",
            }}
          >
            <div
              style={{
                display: "grid",
                placeItems: "center",
                marginBottom: 8,
                color: "var(--mut)",
              }}
            >
              <Upload size={22} />
            </div>
            <div style={{ fontSize: 12.5, fontWeight: 600 }}>
              {uploading ? "Uploading…" : "Drop or import media"}
            </div>
            <div style={{ fontSize: 11, color: "var(--mut)", marginTop: 2 }}>
              MP4 · MOV · PNG · MP3
            </div>
          </div>
        ) : null}

        {error ? (
          <div style={{ fontSize: 11.5, color: "var(--coral)", marginBottom: 12 }}>{error}</div>
        ) : null}

        <Label>Clips · {items.length}</Label>
        {/* Masonry: each thumbnail keeps the media's natural aspect ratio so
            portrait and landscape clips read at their true shape. */}
        <div style={{ columnCount: 2, columnGap: 9 }}>
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              className="st-hovlift"
              onClick={() => void addItem(item)}
              title={item.original_name}
              style={{
                position: "relative",
                display: "block",
                width: "100%",
                marginBottom: 9,
                breakInside: "avoid",
                borderRadius: 11,
                overflow: "hidden",
                border: "1px solid var(--line)",
                cursor: "pointer",
                background: "var(--panel)",
                padding: 0,
              }}
            >
              {item.file_type === "image" ? (
                <img
                  src={item.url}
                  alt=""
                  loading="lazy"
                  style={{ display: "block", width: "100%" }}
                />
              ) : item.file_type === "video" ? (
                <video
                  src={item.proxy_url ?? item.url}
                  muted
                  playsInline
                  preload="metadata"
                  style={{ display: "block", width: "100%" }}
                />
              ) : (
                <div
                  style={{
                    height: 54,
                    background: "linear-gradient(135deg,#274b3a,#3f7a5c)",
                  }}
                />
              )}
              <div
                style={{
                  position: "absolute",
                  left: 6,
                  top: 6,
                  height: 22,
                  width: 22,
                  display: "grid",
                  placeItems: "center",
                  background: "rgba(0,0,0,.5)",
                  borderRadius: 7,
                  color: "#fff",
                  fontSize: 11,
                }}
              >
                {item.file_type === "audio" ? "♪" : item.file_type === "image" ? "▣" : "▶"}
              </div>
            </button>
          ))}
        </div>
        {!items.length && !error ? (
          <div style={{ fontSize: 12, color: "var(--mut)", padding: "8px 2px" }}>
            No media yet — import a clip to get started.
          </div>
        ) : null}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- Text ------

const TEXT_PRESETS: {
  label: string
  fontId: TextFontId
  fontSize: number
  y: number
  preview: React.CSSProperties
}[] = [
  { label: "Big Title", fontId: "anton", fontSize: 110, y: 0.28, preview: { fontFamily: "'Anton'", fontSize: 18 } },
  { label: "Bold Caption", fontId: "inter", fontSize: 74, y: 0.78, preview: { fontWeight: 800, fontSize: 15 } },
  {
    label: "Subtitle",
    fontId: "inter",
    fontSize: 48,
    y: 0.82,
    preview: { fontWeight: 500, fontSize: 13, color: "var(--ink2)" },
  },
]

const STICKERS = ["🔥", "✨", "👀", "☕", "💯", "➡️", "❤️", "⭐"]

function TextPanel() {
  const { dispatch, clock } = useEditorRuntime()

  function addText(text: string, fontId: TextFontId, fontSize: number, y: number) {
    dispatch({
      type: "ADD_CLIP",
      clip: {
        id: editorId(),
        kind: "text",
        name: "Text",
        text,
        fontId,
        fontSize,
        color: "#ffffff",
        y,
        trimStartMs: 0,
        startMs: 0,
        durationMs: DEFAULT_TEXT_DURATION_MS,
      },
      atMs: clock.getTime(),
    })
  }

  return (
    <div>
      <Label>Styles</Label>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 9, marginBottom: 20 }}>
        {TEXT_PRESETS.map((p) => (
          <button
            key={p.label}
            type="button"
            className="st-hovcard"
            onClick={() => addText(p.label, p.fontId, p.fontSize, p.y)}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "15px",
              background: "var(--panel2)",
              border: "1px solid var(--line)",
              borderRadius: 12,
              cursor: "pointer",
            }}
          >
            <span style={p.preview}>{p.label}</span>
            <Plus size={14} style={{ color: "var(--mut)" }} />
          </button>
        ))}
      </div>

      <Label>Stickers</Label>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 9 }}>
        {STICKERS.map((s) => (
          <button
            key={s}
            type="button"
            className="st-hovcard"
            onClick={() => addText(s, "inter", 90, 0.5)}
            style={{
              aspectRatio: "1",
              display: "grid",
              placeItems: "center",
              fontSize: 22,
              background: "var(--panel2)",
              border: "1px solid var(--line)",
              borderRadius: 12,
              cursor: "pointer",
            }}
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  )
}

// ------------------------------------------------------------------ AI ------

// The full AI suite (Captions, Voice, Hook, Jump Cut, Brief, AI Video, Script)
// lives in the shared AiPanel — reused here so every generator stays wired to
// its real backend, hosted inside the Studio panel chrome.
function AiStudioPanel() {
  return (
    <div>
      {/* studio-ai-tiles scopes the tile grid to 2 columns (studio.css) without
          touching the shared AiPanel used elsewhere. */}
      <div className="studio-ai-tiles">
        <AiPanel />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- Audio -----

function AudioPanel() {
  const tracks = useEditorSelector((state) => state.tracks)
  const { dispatch, clock } = useEditorRuntime()
  const { previewingId, togglePreview } = useAudioPreview()
  const projectAudio = tracks
    .flatMap((t) => t.clips)
    .filter((c) => c.kind === "audio")
    .sort((a, b) => a.startMs - b.startMs)
  const wave = React.useMemo(() => waveformDataUrl("#9a9aa2"), [])

  function addEffect(effect: (typeof SOUND_EFFECTS)[number]) {
    dispatch({
      type: "ADD_CLIP",
      clip: {
        id: editorId(),
        kind: "audio",
        name: effect.label,
        url: soundEffectUrl(effect.fileName),
        soundEffectId: effect.id,
        sourceDurationMs: effect.durationMs,
        durationMs: effect.durationMs,
        trimStartMs: 0,
        startMs: 0,
      },
      atMs: clock.getTime(),
    })
  }

  return (
    <div>
      <Label>In project</Label>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 9, marginBottom: 20 }}>
        {projectAudio.length ? (
          projectAudio.map((clip) => (
            <button
              key={clip.id}
              type="button"
              className="st-hovcard"
              onClick={() => dispatch({ type: "SELECT_CLIP", clipId: clip.id })}
              style={rowCard}
            >
              <div
                style={{
                  height: 34,
                  width: 34,
                  borderRadius: 9,
                  display: "grid",
                  placeItems: "center",
                  flex: "none",
                  background: "color-mix(in oklch,var(--good),white 84%)",
                  color: "color-mix(in oklch,var(--good),black 30%)",
                }}
              >
                <Music size={15} />
              </div>
              <div style={{ minWidth: 0, flex: 1, textAlign: "left" }}>
                <div style={rowTitle}>{clip.name}</div>
                <div style={rowMeta}>
                  {formatClock(clip.durationMs)} ·{" "}
                  {clip.muted ? "Muted" : "On"}
                </div>
              </div>
            </button>
          ))
        ) : (
          <div style={{ fontSize: 12, color: "var(--mut)", padding: "2px" }}>
            No audio on the timeline yet.
          </div>
        )}
      </div>

      <Label>Sound effects</Label>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 9 }}>
        {SOUND_EFFECTS.map((effect) => (
          <div key={effect.id} className="st-hovcard" style={rowCard}>
            <button
              type="button"
              onClick={() => togglePreview(effect.id, soundEffectUrl(effect.fileName))}
              title={previewingId === effect.id ? "Stop" : "Preview"}
              style={{
                height: 34,
                width: 34,
                borderRadius: 9,
                flex: "none",
                background: wave,
                backgroundSize: "cover",
                backgroundColor: "var(--elev)",
                border: previewingId === effect.id ? "1px solid var(--acc)" : "1px solid var(--line)",
                cursor: "pointer",
              }}
            />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={rowTitle}>{effect.label}</div>
              <div style={rowMeta}>SFX · {(effect.durationMs / 1000).toFixed(2)}s</div>
            </div>
            <button
              type="button"
              onClick={() => addEffect(effect)}
              style={{
                background: "transparent",
                border: "none",
                cursor: "pointer",
                color: "var(--mut)",
                display: "grid",
                placeItems: "center",
              }}
              title="Add to timeline"
            >
              <Plus size={14} />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

const rowCard: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 11,
  padding: 11,
  background: "var(--panel2)",
  border: "1px solid var(--line)",
  borderRadius: 12,
  cursor: "pointer",
  width: "100%",
  // Let the card shrink below its content so long titles ellipsize instead of
  // forcing the grid item wider than the panel.
  minWidth: 0,
}
const rowTitle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
}
const rowMeta: React.CSSProperties = { fontSize: 10.5, color: "var(--mut)" }

// --------------------------------------------------------------- Brand ------

function BrandPanel() {
  const { config } = useShellRuntime()
  const brand = config.brandKit
  const heading = requireTextFont(brand.fonts.heading)
  const body = requireTextFont(brand.fonts.body)

  return (
    <div>
      <Label>Palette</Label>
      <div style={{ display: "flex", gap: 9, marginBottom: 20, flexWrap: "wrap" }}>
        {brand.colors.map((color) => (
          <div
            key={`${color.name}-${color.value}`}
            title={`${color.name} · ${color.value}`}
            style={{
              height: 44,
              flex: "1 1 40px",
              minWidth: 40,
              borderRadius: 11,
              background: color.value,
              border: "1px solid var(--line2)",
              boxShadow: "var(--sh-sm)",
            }}
          />
        ))}
      </div>

      <Label>Fonts</Label>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 9, marginBottom: 20 }}>
        <div style={fontCard}>
          <span style={{ fontFamily: heading.family, fontSize: 19 }}>{heading.label}</span>
          <span style={{ fontSize: 10.5, color: "var(--mut)" }}>Heading</span>
        </div>
        <div style={fontCard}>
          <span style={{ fontFamily: body.family, fontWeight: 700, fontSize: 15 }}>{body.label}</span>
          <span style={{ fontSize: 10.5, color: "var(--mut)" }}>Body</span>
        </div>
      </div>

      <Label>Logo</Label>
      {brand.logo.previewUrl ? (
        <div
          style={{
            border: "1px solid var(--line)",
            borderRadius: 12,
            padding: 16,
            background: "var(--panel2)",
            display: "grid",
            placeItems: "center",
          }}
        >
          <img
            src={brand.logo.previewUrl}
            alt="Brand logo"
            style={{ maxHeight: 60, maxWidth: "100%", objectFit: "contain" }}
          />
        </div>
      ) : (
        <div
          style={{
            border: "1.5px dashed var(--line2)",
            borderRadius: 12,
            padding: 22,
            textAlign: "center",
            background: "var(--panel2)",
            color: "var(--mut)",
            fontSize: 12,
          }}
        >
          Set a logo in Brand Kit settings
        </div>
      )}
    </div>
  )
}

const fontCard: React.CSSProperties = {
  padding: "13px 15px",
  background: "var(--panel2)",
  border: "1px solid var(--line)",
  borderRadius: 12,
  display: "flex",
  alignItems: "baseline",
  justifyContent: "space-between",
}
