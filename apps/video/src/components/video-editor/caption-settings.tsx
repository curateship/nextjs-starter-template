import * as React from "react"
import { RotateCcwIcon } from "lucide-react"

import { CollapsibleSettingsCard } from "@/components/settings/collapsible-settings-card"
import { useReportedSaveStatus } from "@/components/settings/use-reported-save-status"
import { CaptionLookFields } from "@/components/video-editor/caption-look-fields"
import { Button } from "@/components/ui/button"
import { CardGroup } from "@/components/ui/card"
import { ErrorRow } from "@/components/ui/error-row"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { LoadingRow } from "@/components/ui/loading-row"
import { describeAuthError } from "@/lib/api/error-message"
import {
  loadCaptionSettings,
  saveCaptionLook,
  saveSafeBoxes,
} from "@/lib/api/video/settings"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"
import type { CaptionLook, CaptionSettings } from "@/lib/video/caption-look"
import {
  DEFAULT_SAFE_BOXES,
  SAFE_BOX_EDGES,
  SAFE_BOX_PLATFORMS,
  safeBoxProblem,
  type SafeBox,
  type SafeBoxes,
  type SafeBoxPlatformId,
} from "@/lib/video/safe-box"

/** How long after the last change a dragged or typed value saves itself. */
const SAVE_AFTER_MS = 700

/**
 * Changes that arrive in a stream while a slider or colour picker is dragged.
 * They wait for the drag to settle; a switch or a pick saves at once.
 */
const STREAMED_FIELDS = new Set<keyof CaptionLook>([
  "fontSize",
  "color",
  "strokeColor",
  "strokeWidth",
  "boxColor",
  "wordColor",
  "wordsPerCaption",
  "y",
])

const EDGE_LABELS: Record<(typeof SAFE_BOX_EDGES)[number], string> = {
  top: "Top",
  bottom: "Bottom",
  left: "Left",
  right: "Right",
}

/**
 * The look and boxes as last read or edited, held for the life of the page,
 * so coming back to this tab draws at once instead of loading again. An edit
 * goes in before its save is sent. If the newest save of that part is
 * refused, the part goes back to what the server last confirmed, kept in
 * `confirmed`, so the tab never shows settings that were never saved.
 */
let held: CaptionSettings | null = null
let confirmed: CaptionSettings | null = null

type Part = keyof CaptionSettings

function setHeld(loaded: CaptionSettings) {
  held = loaded
  confirmed = loaded
}

function hold<K extends Part>(key: K, value: CaptionSettings[K]) {
  if (held) held = { ...held, [key]: value }
}

function confirm<K extends Part>(key: K, value: CaptionSettings[K]) {
  if (confirmed) confirmed = { ...confirmed, [key]: value }
}

function lastConfirmed<K extends Part>(key: K) {
  return confirmed?.[key]
}

type BoxTexts = Record<SafeBoxPlatformId, Record<keyof SafeBox, string>>

function boxTexts(boxes: SafeBoxes): BoxTexts {
  const texts = {} as BoxTexts
  for (const { id } of SAFE_BOX_PLATFORMS) {
    texts[id] = {
      top: String(boxes[id].top),
      bottom: String(boxes[id].bottom),
      left: String(boxes[id].left),
      right: String(boxes[id].right),
    }
  }
  return texts
}

/** What was typed as a box, or null when a number is not a whole number. */
function readBox(texts: Record<keyof SafeBox, string>): SafeBox | null {
  const box = {} as SafeBox
  for (const edge of SAFE_BOX_EDGES) {
    const text = texts[edge].trim()
    if (!/^\d+$/.test(text)) return null
    box[edge] = Number(text)
  }
  return box
}

function boxProblem(texts: Record<keyof SafeBox, string>) {
  const box = readBox(texts)
  return box ? safeBoxProblem(box) : "Each number is whole pixels, from 0 up"
}

function problemMessage(error: unknown, what: string) {
  const message = error instanceof Error ? error.message : ""
  return describeAuthError(message) ?? `The ${what} could not be saved.`
}

/**
 * Settings → Captions: the look every caption window starts from, and how
 * much of a tall frame each platform covers. One of each for the whole app.
 * Both save themselves as they change, with no button.
 */
export default function CaptionSettingsTab() {
  const [settings, setSettings] = React.useState(held)
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [reloads, setReloads] = React.useState(0)

  React.useEffect(() => {
    if (held) return
    let cancelled = false
    loadCaptionSettings()
      .then((loaded) => {
        setHeld(loaded)
        if (!cancelled) setSettings(loaded)
      })
      .catch((error) => {
        if (!cancelled) {
          const message = error instanceof Error ? error.message : ""
          setLoadError(
            describeAuthError(message) ?? "The caption settings could not be read."
          )
        }
      })
    return () => {
      cancelled = true
    }
  }, [reloads])

  if (loadError) {
    return (
      <CardGroup>
        <ErrorRow
          message={loadError}
          onRetry={() => {
            setLoadError(null)
            setReloads((reload) => reload + 1)
          }}
        />
      </CardGroup>
    )
  }
  if (!settings) {
    return (
      <CardGroup>
        <LoadingRow label="Reading the caption settings…" />
      </CardGroup>
    )
  }
  return <CaptionSettingsCards initial={settings} />
}

function CaptionSettingsCards({ initial }: { initial: CaptionSettings }) {
  const [look, setLook] = React.useState(initial.look)
  const [boxes, setBoxes] = React.useState(initial.safeBoxes)
  const [texts, setTexts] = React.useState(() => boxTexts(initial.safeBoxes))
  const setSaveStatus = useReportedSaveStatus()
  // A change still waiting out its 700ms, as the save it will make. Leaving
  // the tab sends it at once rather than dropping it.
  const waiting = React.useRef<{
    look?: { timer: ReturnType<typeof setTimeout>; save: () => void }
    boxes?: { timer: ReturnType<typeof setTimeout>; save: () => void }
  }>({})
  // Only the newest save's answer may report, so a slow early save never
  // writes over a later one's result. The same holds for each part's copy in
  // `held`: an older answer never replaces a newer edit.
  const saves = React.useRef(0)
  const newest = React.useRef<Record<Part, number>>({ look: 0, safeBoxes: 0 })
  // Saves go out one after another, so the last change made is the last one
  // written, whatever order the answers would have come back in.
  const queue = React.useRef<Promise<unknown>>(Promise.resolve())

  React.useEffect(() => {
    const pending = waiting.current
    return () => {
      for (const kind of ["look", "boxes"] as const) {
        const change = pending[kind]
        if (!change) continue
        clearTimeout(change.timer)
        change.save()
      }
    }
  }, [])

  function wait(kind: "look" | "boxes", save: (() => void) | null) {
    const change = waiting.current[kind]
    if (change) clearTimeout(change.timer)
    waiting.current[kind] = save
      ? {
          timer: setTimeout(() => {
            waiting.current[kind] = undefined
            save()
          }, SAVE_AFTER_MS),
          save,
        }
      : undefined
  }

  async function send<K extends Part>(
    key: K,
    value: CaptionSettings[K],
    write: () => Promise<CaptionSettings[K]>,
    what: string,
    refused?: (back: CaptionSettings[K]) => void
  ) {
    const save = (saves.current += 1)
    const mine = (newest.current[key] += 1)
    hold(key, value)
    setSaveStatus("saving")
    dismissErrorToast()
    const sent = queue.current.then(write)
    queue.current = sent.catch(() => undefined)
    try {
      const saved = await sent
      confirm(key, saved)
      if (mine === newest.current[key]) hold(key, saved)
      if (save === saves.current) setSaveStatus("saved")
    } catch (error) {
      // What is typed on screen stays, so a refused save loses nothing.
      const back = lastConfirmed(key)
      if (mine === newest.current[key] && back) {
        hold(key, back)
        refused?.(back)
      }
      if (save === saves.current) setSaveStatus("idle")
      showErrorToast(problemMessage(error, what))
    }
  }

  function saveLook(next: CaptionLook) {
    if (!held) return
    void send("look", next, () => saveCaptionLook(next), "caption look")
  }

  function changeLook(next: CaptionLook) {
    const changed = (Object.keys(next) as (keyof CaptionLook)[]).filter(
      (key) => next[key] !== look[key]
    )
    // The Outline switch moves the thickness to or from 0: a switch, so it
    // saves at once like any other.
    const outlineSwitched = (look.strokeWidth > 0) !== (next.strokeWidth > 0)
    setLook(next)
    if (
      changed.length &&
      !outlineSwitched &&
      changed.every((key) => STREAMED_FIELDS.has(key))
    ) {
      wait("look", () => saveLook(next))
    } else {
      wait("look", null)
      saveLook(next)
    }
  }

  // `nextTexts` rides in as an argument: the timer must save exactly what was
  // typed when it was set. Only leaving a field reports a problem, so a
  // half-typed number is never shouted about. A platform whose numbers do not
  // fit keeps its last box, and the others still save.
  function saveBoxes(nextTexts: BoxTexts, sayProblem: boolean) {
    if (!held) return
    const next = {} as SafeBoxes
    let notSaved: string | null = null
    for (const { id, label } of SAFE_BOX_PLATFORMS) {
      const problem = boxProblem(nextTexts[id])
      const box = readBox(nextTexts[id])
      if (problem || !box) {
        notSaved ??= `${label}: ${problem}. ${label} was not saved.`
        next[id] = held.safeBoxes[id]
        continue
      }
      next[id] = box
    }
    if (JSON.stringify(next) !== JSON.stringify(held.safeBoxes)) {
      setBoxes(next)
      void send(
        "safeBoxes",
        next,
        () => saveSafeBoxes(next),
        "safe boxes",
        setBoxes
      )
    }
    // Said after the save goes out, which clears the last message.
    if (sayProblem && notSaved) showErrorToast(notSaved)
  }

  function typeEdge(platform: SafeBoxPlatformId, edge: keyof SafeBox, text: string) {
    const next = { ...texts, [platform]: { ...texts[platform], [edge]: text } }
    setTexts(next)
    wait("boxes", () => saveBoxes(next, false))
  }

  function startingNumbers(platform: SafeBoxPlatformId) {
    const start = boxTexts(DEFAULT_SAFE_BOXES)[platform]
    const next = { ...texts, [platform]: start }
    setTexts(next)
    wait("boxes", null)
    saveBoxes(next, true)
  }

  return (
    <CardGroup>
      <CollapsibleSettingsCard
        storageId="video-caption-look"
        title="How captions look"
        description="Every caption window in the editor starts from this look: Captions, Voice, Another language, the Voices panel and Brief to video. It only shapes captions as they are written; captions already on a project keep their own."
      >
        <CaptionLookFields
          idPrefix="settings-captions"
          look={look}
          onChange={changeLook}
          safeBoxes={boxes}
        />
      </CollapsibleSettingsCard>

      <CollapsibleSettingsCard
        storageId="video-caption-safe-boxes"
        title="Platform safe boxes"
        description="How far in from each edge each platform's own buttons, names and caption reach, in pixels on a 1080 by 1920 frame. The platforms don't publish these, so they start from figures gathered on 21 Oct 2026 and can be changed here."
      >
        <div className="grid gap-6">
          {SAFE_BOX_PLATFORMS.map((platform) => {
            const problem = boxProblem(texts[platform.id])
            return (
              <div
                key={platform.id}
                role="group"
                aria-labelledby={`safe-box-${platform.id}`}
                className="grid gap-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <h3
                    id={`safe-box-${platform.id}`}
                    className="text-sm font-medium"
                  >
                    {platform.label}
                  </h3>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => startingNumbers(platform.id)}
                  >
                    <RotateCcwIcon />
                    Starting numbers
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  {SAFE_BOX_EDGES.map((edge) => {
                    const id = `safe-box-${platform.id}-${edge}`
                    return (
                      <div key={edge} className="grid gap-2">
                        <Label htmlFor={id}>{EDGE_LABELS[edge]}, px</Label>
                        <Input
                          id={id}
                          inputMode="numeric"
                          value={texts[platform.id][edge]}
                          aria-invalid={problem ? true : undefined}
                          onChange={(event) =>
                            typeEdge(platform.id, edge, event.target.value)
                          }
                          onBlur={() => {
                            wait("boxes", null)
                            saveBoxes(texts, true)
                          }}
                          onKeyDown={(event) => {
                            if (event.key !== "Enter") return
                            wait("boxes", null)
                            saveBoxes(texts, true)
                          }}
                        />
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </CollapsibleSettingsCard>
    </CardGroup>
  )
}
