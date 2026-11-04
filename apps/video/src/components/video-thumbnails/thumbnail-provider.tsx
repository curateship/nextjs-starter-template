import * as React from "react"

import {
  ThumbnailsContext,
  type AiTries,
  type BoardDesign,
  type ThumbnailsValue,
} from "@/components/video-thumbnails/thumbnail-store"
import { useEditorRuntime } from "@/components/video-editor/editor-store"
import { useProjectSettings } from "@/components/video-editor/project-settings-context"
import {
  getThumbnailErrorMessage,
  listThumbnails,
  newThumbnail,
  redrawMainThumbnail,
  saveThumbnailDesign,
  type ThumbnailRow,
  type ThumbnailTemplateRow,
} from "@/lib/api/video/thumbnails"
import type { ImageModelId } from "@/lib/video/asset-factories"
import { PICTURE_EDIT_MODEL } from "@/lib/video/picture-edits"
import { isProjectSpendLimitMessage } from "@/lib/video/project-spend"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"
import { useRememberedChoice } from "@/lib/remembered-choice"

/** Where this browser keeps "How many to make". */
const TRIES_STORAGE_KEY = "video-thumbnail-tries"
// One list for the life of the page: the remembered-choice hook reads it
// again whenever it changes, and a list made afresh on every draw changed
// every time and looped the editor forever.
const TRIES_CHOICES = ["1", "2", "4"] as const

/** A board edit saves this long after the last one, as Settings do. */
const SAVE_AFTER_MS = 700
/** A main thumbnail's library picture is drawn again this long after the last edit. */
const REDRAW_MAIN_AFTER_MS = 2_000

/**
 * The Thumbnail section's state for one open video (thumbnails.md). It only
 * loads once the section is first opened, so a video that never uses it asks
 * the server nothing.
 */
export function ThumbnailsProvider({
  active,
  children,
}: {
  active: boolean
  children: React.ReactNode
}) {
  const { videoId } = useEditorRuntime()
  const { refreshSpend, openSettings } = useProjectSettings()
  const [list, setList] = React.useState<ThumbnailRow[] | null>(null)
  const [templates, setTemplates] = React.useState<ThumbnailTemplateRow[]>([])
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [openId, setOpenId] = React.useState<string | null>(null)
  const [design, setDesign] = React.useState<BoardDesign | null>(null)
  const [selectedLayerId, setSelectedLayerId] = React.useState<string | null>(null)
  const [saving, setSaving] = React.useState<ThumbnailsValue["saving"]>("saved")
  const [busy, setBusy] = React.useState<string | null>(null)
  // Remembered in this browser between visits, starting on 4.
  const [triesChoice, setTriesChoice] = useRememberedChoice(TRIES_STORAGE_KEY, "4", TRIES_CHOICES)
  const tries = Number(triesChoice) as AiTries
  const setTries = React.useCallback((next: AiTries) => setTriesChoice(String(next) as "1" | "2" | "4"), [setTriesChoice])
  const [model, setModel] = React.useState<ImageModelId>(PICTURE_EDIT_MODEL)
  const [beforeAfter, setBeforeAfter] = React.useState<ThumbnailsValue["beforeAfter"]>(null)
  const [reads, setReads] = React.useState(0)
  const loadedFor = React.useRef<string | null>(null)

  // The newest design waiting to be saved, and the version it is based on.
  const pending = React.useRef<{ id: string; design: BoardDesign } | null>(null)
  const versionRef = React.useRef<Map<string, number>>(new Map())
  const saveTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const redrawTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  const open = list?.find((row) => row.id === openId) ?? null

  // Loaded the first time the section opens, and again for another video.
  React.useEffect(() => {
    if (!active) return
    const key = `${videoId}:${reads}`
    if (loadedFor.current === key) return
    loadedFor.current = key
    let live = true
    listThumbnails(videoId)
      .then((answer) => {
        if (!live) return
        for (const row of answer.thumbnails) versionRef.current.set(row.id, row.version)
        setList(answer.thumbnails)
        setTemplates(answer.templates)
        setLoadError(null)
        // The newest one is open on arrival, so the board is never empty
        // when there is something to show.
        setOpenId((current) =>
          current && answer.thumbnails.some((row) => row.id === current)
            ? current
            : (answer.thumbnails[0]?.id ?? null)
        )
      })
      .catch((error) => {
        if (live) setLoadError(getThumbnailErrorMessage(error))
      })
    return () => {
      live = false
    }
  }, [active, videoId, reads])

  // The board shows the open row's design until it is edited.
  const shownDesign = React.useMemo(
    () => design ?? (open ? { layers: open.layers, backgroundColor: open.background_color } : null),
    [design, open]
  )

  // One save at a time: a second edit while a save is out waits for it, so
  // it goes with the new version number rather than losing a race to it.
  const savingNow = React.useRef<Promise<boolean> | null>(null)

  /** One save; false when it was refused and the edit is waiting again. */
  const saveOnce = React.useCallback(async (waiting: { id: string; design: BoardDesign }) => {
    try {
      const saved = await saveThumbnailDesign({
        thumbnailId: waiting.id,
        layers: waiting.design.layers,
        backgroundColor: waiting.design.backgroundColor,
        version: versionRef.current.get(waiting.id) ?? 1,
      })
      versionRef.current.set(saved.id, saved.version)
      setList((rows) => rows?.map((row) => (row.id === saved.id ? { ...saved, picture_url: row.picture_url } : row)) ?? rows)
      setSaving(pending.current ? "saving" : "saved")
      if (saved.is_main) {
        if (redrawTimer.current) clearTimeout(redrawTimer.current)
        redrawTimer.current = setTimeout(() => {
          redrawMainThumbnail(saved.id)
            .then((row) => setList((rows) => rows?.map((one) => (one.id === row.id ? { ...one, picture_url: row.picture_url } : one)) ?? rows))
            .catch((error) => showErrorToast(getThumbnailErrorMessage(error)))
        }, REDRAW_MAIN_AFTER_MS)
      }
      return true
    } catch (error) {
      setSaving("error")
      pending.current ??= waiting
      showErrorToast(getThumbnailErrorMessage(error))
      return false
    }
  }, [])

  const flush = React.useCallback(async (): Promise<void> => {
    if (savingNow.current) await savingNow.current
    // An edit made while a save was out goes in the next turn of the loop.
    while (pending.current && !savingNow.current) {
      const waiting = pending.current
      pending.current = null
      setSaving("saving")
      const going = saveOnce(waiting)
      savingNow.current = going
      const saved = await going
      savingNow.current = null
      if (!saved) return
    }
  }, [saveOnce])

  // A save still waiting goes out when another thumbnail is opened or the
  // editor closes.
  React.useEffect(() => () => void flush(), [flush, openId])

  const change = React.useCallback<ThumbnailsValue["change"]>(
    (next) => {
      if (!open) return
      setDesign((current) => {
        const base = current ?? { layers: open.layers, backgroundColor: open.background_color }
        const updated = next(base)
        pending.current = { id: open.id, design: updated }
        return updated
      })
      if (saveTimer.current) clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => void flush(), SAVE_AFTER_MS)
    },
    [open, flush]
  )

  const openThumbnail = React.useCallback((id: string) => {
    setOpenId(id)
    setDesign(null)
    setSelectedLayerId(null)
    setBeforeAfter(null)
  }, [])

  const addVersion = React.useCallback(
    (row: ThumbnailRow) => {
      versionRef.current.set(row.id, row.version)
      setList((rows) => [row, ...(rows ?? [])])
      openThumbnail(row.id)
    },
    [openThumbnail]
  )

  const replaceRow = React.useCallback((row: ThumbnailRow) => {
    versionRef.current.set(row.id, row.version)
    setList((rows) =>
      rows?.map((one) => {
        if (one.id === row.id) return row
        // Starring one takes the star off the other of its shape.
        if (row.is_main && one.shape === row.shape && one.is_main) {
          return { ...one, is_main: false, picture_url: null }
        }
        return one
      }) ?? rows
    )
  }, [])

  const removeRow = React.useCallback(
    (id: string) => {
      const left = list?.filter((row) => row.id !== id) ?? null
      setList(left)
      if (openId === id) {
        setOpenId(left?.[0]?.id ?? null)
        setDesign(null)
        setSelectedLayerId(null)
      }
    },
    [list, openId]
  )

  const run = React.useCallback<ThumbnailsValue["run"]>(
    async (label, work) => {
      setBusy(label)
      try {
        await flush()
        await work()
        dismissErrorToast()
      } catch (error) {
        const message = getThumbnailErrorMessage(error)
        showErrorToast(
          message,
          isProjectSpendLimitMessage(message)
            ? { label: "Raise limit", onClick: openSettings }
            : undefined
        )
      } finally {
        setBusy(null)
        refreshSpend()
      }
    },
    [flush, openSettings, refreshSpend]
  )

  const { clock } = useEditorRuntime()
  const create = React.useCallback<ThumbnailsValue["create"]>(
    ({ shape, templateId, blank }) =>
      run("Making a new thumbnail…", async () => {
        const row = await newThumbnail({
          videoId,
          shape,
          templateId,
          frameAtMs: blank ? undefined : clock.getTime(),
        })
        addVersion(row)
      }),
    [addVersion, clock, run, videoId]
  )

  const value = React.useMemo<ThumbnailsValue>(
    () => ({
      list,
      templates,
      loadError,
      open,
      design: shownDesign,
      selectedLayerId,
      saving,
      busy,
      tries,
      model,
      beforeAfter,
      reload: () => setReads((count) => count + 1),
      openThumbnail,
      create,
      addVersion,
      replaceRow,
      removeRow,
      setTemplates,
      change,
      selectLayer: setSelectedLayerId,
      setTries,
      setModel,
      setBeforeAfter,
      run,
    }),
    [
      list,
      templates,
      loadError,
      open,
      shownDesign,
      selectedLayerId,
      saving,
      busy,
      tries,
      model,
      beforeAfter,
      setTries,
      openThumbnail,
      create,
      addVersion,
      replaceRow,
      removeRow,
      change,
      run,
    ]
  )

  return <ThumbnailsContext.Provider value={value}>{children}</ThumbnailsContext.Provider>
}
