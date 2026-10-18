import * as React from "react"
import { useNavigate } from "@tanstack/react-router"
import { toast } from "sonner"

import { FoldersPanel } from "@/components/note-videos/folders-panel"
import { ThreePanels } from "@/components/note-videos/three-panels"
import type { CardActions, PendingUpload } from "@/components/note-videos/video-cards"
import { VideoPanel } from "@/components/note-videos/video-panel"
import { VideosListPanel } from "@/components/note-videos/videos-list-panel"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { getMediaErrorMessage, uploadMedia } from "@/lib/api/media/media"
import { loadFolders } from "@/lib/api/note/folders"
import {
  deleteNoteVideo,
  finishVideoUpload,
  getNoteErrorMessage,
  loadVideos,
  moveNoteVideo,
  refreshVideoCards,
  retryNoteVideo,
  saveVideoLink,
} from "@/lib/api/note/videos"
import { isUploadCancelled } from "@/lib/media/upload-in-parts"
import { useRememberedChoice } from "@/lib/remembered-choice"
import { SAMPLE_VIDEO, SAMPLE_VIDEO_ID } from "@/lib/note/sample-video"
import { readFileDuration, tooLongToUpload, uploadRefusal } from "@/lib/note/upload-check"
import { siteName } from "@/lib/note/sites"
import { NOTE_VIDEO_VIEWS, NOTE_VIDEOS_VIEW_KEY } from "@/lib/note/view-key"
import {
  isMoving,
  NO_FOLDER,
  NOTE_SAYS,
  type FolderScope,
  type NoteFolderList,
  type NoteVideoCard,
  type NoteVideoPage,
} from "@/lib/note/videos"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"

/**
 * The videos dashboard at `/videos`: folders on the left, the videos as a
 * grid or a list in the middle, and the picked video with its analysis on the
 * right. The folder and the picked video live in the address (`?folder=` and
 * `?open=`), so a reload and a bell notice come back to the same place.
 *
 * Saving a link or an upload writes a row and returns; the worker does the
 * slow part. While any card on screen is still moving, the list asks where
 * those cards have got to three seconds after each answer.
 */

export type VideosPageData = {
  folders: NoteFolderList
  page: NoteVideoPage
  /** The folder the first page was read for. */
  folder: FolderScope
}

/** How long after an answer the list asks again while a card is moving. */
const POLL_MS = 3_000
/** How long the search box waits after the last keystroke before asking. */
const SEARCH_DELAY_MS = 300

type ListState = {
  /** The narrowing, search and reload this list is the answer to. */
  answers: string
  scope: FolderScope
  query: string
  videos: NoteVideoCard[]
  nextCursor: string | null
  failure: string | null
}

export function VideosPage({
  initial,
  folder,
  open,
}: {
  initial: VideosPageData
  folder: FolderScope
  open: string | undefined
}) {
  const navigate = useNavigate({ from: "/videos" })
  const [view, setView] = useRememberedChoice(NOTE_VIDEOS_VIEW_KEY, "grid", NOTE_VIDEO_VIEWS)

  // A fresh answer from the route loader replaces what is on screen, adjusted
  // while rendering rather than in an effect so nothing stale paints first.
  const [loaded, setLoaded] = React.useState(initial)
  const [folders, setFolders] = React.useState(initial.folders)
  const [list, setList] = React.useState<ListState>(() => fromPage(initial))
  if (loaded !== initial) {
    setLoaded(initial)
    setFolders(initial.folders)
    setList(fromPage(initial))
  }

  // The narrowing on screen. A folder that no longer exists reads as all.
  const scope: FolderScope =
    folder === NO_FOLDER || folders.folders.some((each) => each.id === folder) ? folder : undefined
  const pickedId = open ?? null

  const [query, setQuery] = React.useState("")
  const [applied, setApplied] = React.useState("")
  React.useEffect(() => {
    const timer = setTimeout(() => setApplied(query.trim()), SEARCH_DELAY_MS)
    return () => clearTimeout(timer)
  }, [query])

  const [link, setLink] = React.useState("")
  const [linkInvalid, setLinkInvalid] = React.useState(false)
  const [savingLink, setSavingLink] = React.useState(false)
  const [uploads, setUploads] = React.useState<PendingUpload[]>([])
  const [deleting, setDeleting] = React.useState<NoteVideoCard | null>(null)
  const [deleteBusy, setDeleteBusy] = React.useState(false)
  const [loadingOlder, setLoadingOlder] = React.useState(false)
  const [listReloads, setListReloads] = React.useState(0)
  /** Counts picks, so picking the same card again still opens its tab on a phone. */
  const [picks, setPicks] = React.useState(0)

  const setAddress = React.useCallback(
    (next: { folder?: FolderScope; open?: string | null }) => {
      void navigate({
        search: (previous) => ({
          ...previous,
          ...("folder" in next ? { folder: next.folder } : {}),
          ...("open" in next ? { open: next.open ?? undefined } : {}),
        }),
        replace: true,
        resetScroll: false,
      })
    },
    [navigate]
  )

  const refreshFolders = React.useCallback(async () => {
    try {
      setFolders(await loadFolders())
    } catch {
      // The counts are a nicety; the cards themselves are already right.
    }
  }, [])

  // A new narrowing or search asks the server again, because sieving the cards
  // already on screen would miss the ones that were never loaded. Only the
  // newest ask may touch the screen, and a refused ask is not asked again
  // until Try again is pressed.
  const wanted = listKey(scope, applied, listReloads)
  const askVersion = React.useRef(0)
  React.useEffect(() => {
    // Counted before the early return, so an ask still in the air for a
    // search typed and rubbed out again is dropped rather than shown.
    const version = ++askVersion.current
    if (list.answers === wanted) return
    loadVideos({ folder: scope, search: applied || undefined })
      .then((page) => {
        if (version !== askVersion.current) return
        setList({
          answers: wanted,
          scope,
          query: applied,
          videos: page.videos,
          nextCursor: page.nextCursor,
          failure: null,
        })
      })
      .catch((error) => {
        if (version !== askVersion.current) return
        setList((current) => ({ ...current, answers: wanted, failure: getNoteErrorMessage(error) }))
      })
  }, [list.answers, wanted, scope, applied])
  const loadingList = list.answers !== wanted

  // Every card still moving is asked about, in one request, three seconds
  // after the last answer, so two asks are never in the air at once. A card
  // missing from the answer has gone: deleted, or found to be a video saved
  // before and folded into it.
  const movingKey = list.videos
    .filter((video) => isMoving(video.status))
    .map((video) => video.id)
    .sort()
    .join(",")
  // The wait restarts only on this poll's own answer or miss, so a note being
  // typed or the right panel's answers never throw a pending ask away.
  const [pollRound, setPollRound] = React.useState(0)
  const pickedRef = React.useRef(pickedId)
  React.useEffect(() => {
    pickedRef.current = pickedId
  })
  React.useEffect(() => {
    if (!movingKey) return
    let live = true
    const ids = movingKey.split(",")
    const timer = setTimeout(() => {
      refreshVideoCards(ids)
        .then((fresh) => {
          if (!live) return
          const byId = new Map(fresh.map((card) => [card.id, card]))
          const gone = ids.filter((id) => !byId.has(id))
          setList((current) => ({
            ...current,
            videos: current.videos
              .filter((video) => !gone.includes(video.id))
              .map((video) => byId.get(video.id) ?? video),
          }))
          if (gone.length) void refreshFolders()
          if (pickedRef.current && gone.includes(pickedRef.current)) {
            toast.success("That video was already saved, so the earlier copy is kept.")
            setAddress({ open: null })
          }
        })
        .catch(() => undefined)
        .finally(() => {
          if (live) setPollRound((round) => round + 1)
        })
    }, POLL_MS)
    return () => {
      live = false
      clearTimeout(timer)
    }
  }, [movingKey, pollRound, refreshFolders, setAddress])

  // A card picked from a notice or a reload is scrolled into view once, as
  // soon as its list is on screen. Later answers never move the scroll.
  const scrolledFor = React.useRef<string | null>(null)
  React.useEffect(() => {
    if (!pickedId || scrolledFor.current === pickedId) return
    const card = document.querySelector(`[data-video-id="${CSS.escape(pickedId)}"]`)
    if (!card) return
    scrolledFor.current = pickedId
    card.scrollIntoView({ block: "nearest" })
  }, [pickedId, list.videos])

  /** The right panel or a button learned something new about one card. */
  const patchCard = React.useCallback((card: NoteVideoCard) => {
    if (card.sample) return
    setList((current) => ({
      ...current,
      videos: current.videos.map((video) =>
        video.id === card.id ? { ...video, ...pickCardFields(card) } : video
      ),
    }))
  }, [])

  /**
   * A new card always shows where it landed. A video saved while a folder or
   * a search is showing goes to "All videos", since a new video is in no
   * folder and may not match the search.
   */
  function showNewCard(card: NoteVideoCard) {
    const visible = (scope === undefined || scope === NO_FOLDER) && !applied
    if (visible) {
      setList((current) => ({
        ...current,
        videos: [card, ...current.videos.filter((video) => video.id !== card.id)],
      }))
    } else {
      setQuery("")
      setApplied("")
    }
    setAddress({ folder: visible ? scope : undefined, open: card.id })
    void refreshFolders()
  }

  async function saveLink() {
    if (savingLink) return
    const url = link.trim()
    if (!url) {
      setLinkInvalid(true)
      showErrorToast(NOTE_SAYS.notALink)
      return
    }
    setSavingLink(true)
    dismissErrorToast()
    try {
      const { video, alreadySaved } = await saveVideoLink(url)
      // The box clears the moment the row is written.
      setLink("")
      if (alreadySaved) {
        toast.success("That video is already saved.")
        setAddress({ open: video.id })
      } else {
        showNewCard(video)
      }
    } catch (error) {
      setLinkInvalid(true)
      showErrorToast(getNoteErrorMessage(error))
    } finally {
      setSavingLink(false)
    }
  }

  async function uploadFile(file: File) {
    const refusal = uploadRefusal(file)
    if (refusal) {
      showErrorToast(refusal)
      return
    }
    if (tooLongToUpload(await readFileDuration(file))) {
      showErrorToast(NOTE_SAYS.tooLong)
      return
    }
    const key = crypto.randomUUID()
    const pending: PendingUpload = {
      key,
      name: file.name,
      kind: file.type.startsWith("audio/") ? "audio" : "video",
      fraction: 0,
    }
    setUploads((current) => [pending, ...current])
    let mediaId: string
    try {
      const media = await uploadMedia(file, undefined, {
        onProgress: (fraction) =>
          setUploads((current) =>
            current.map((upload) => (upload.key === key ? { ...upload, fraction } : upload))
          ),
      })
      mediaId = media.id
    } catch (error) {
      setUploads((current) => current.filter((upload) => upload.key !== key))
      if (!isUploadCancelled(error)) showErrorToast(getMediaErrorMessage(error))
      return
    }
    try {
      showNewCard(await finishVideoUpload(mediaId))
    } catch (error) {
      showErrorToast(getNoteErrorMessage(error))
    } finally {
      setUploads((current) => current.filter((upload) => upload.key !== key))
    }
  }

  async function showOlder() {
    if (!list.nextCursor || loadingOlder) return
    setLoadingOlder(true)
    const askedFor = list.answers
    try {
      const page = await loadVideos({
        folder: scope,
        search: applied || undefined,
        cursor: list.nextCursor,
      })
      // Another folder or search picked meanwhile: these belong to the old one.
      setList((current) =>
        current.answers !== askedFor
          ? current
          : {
              ...current,
              videos: [
                ...current.videos,
                ...page.videos.filter(
                  (video) => !current.videos.some((shown) => shown.id === video.id)
                ),
              ],
              nextCursor: page.nextCursor,
            }
      )
    } catch (error) {
      showErrorToast(getNoteErrorMessage(error))
    } finally {
      setLoadingOlder(false)
    }
  }

  async function confirmDelete() {
    if (!deleting) return
    setDeleteBusy(true)
    dismissErrorToast()
    try {
      await deleteNoteVideo(deleting.id)
      setList((current) => ({
        ...current,
        videos: current.videos.filter((video) => video.id !== deleting.id),
      }))
      if (pickedId === deleting.id) setAddress({ open: null })
      toast.success(`Deleted “${deleting.title}”.`)
      setDeleting(null)
      void refreshFolders()
    } catch (error) {
      showErrorToast(getNoteErrorMessage(error))
    } finally {
      setDeleteBusy(false)
    }
  }

  const actions: CardActions = {
    folders: folders.folders,
    onPick: (video) => {
      setPicks((count) => count + 1)
      setAddress({ open: video.id })
    },
    onMove: (video, folderId) => {
      dismissErrorToast()
      moveNoteVideo(video.id, folderId)
        .then((card) => {
          const stays =
            scope === undefined ||
            (scope === NO_FOLDER ? card.folderId === null : card.folderId === scope)
          setList((current) => ({
            ...current,
            videos: stays
              ? current.videos.map((shown) => (shown.id === card.id ? card : shown))
              : current.videos.filter((shown) => shown.id !== card.id),
          }))
          const into = folders.folders.find((each) => each.id === folderId)
          toast.success(into ? `Moved to “${into.name}”.` : "Taken out of its folder.")
          void refreshFolders()
        })
        .catch((error) => showErrorToast(getNoteErrorMessage(error)))
    },
    onDelete: (video) => setDeleting(video),
    onRetry: (video) => {
      dismissErrorToast()
      retryNoteVideo(video.id)
        .then(patchCard)
        .catch((error) => showErrorToast(getNoteErrorMessage(error)))
    },
  }

  const showSample = folders.allCount === 0 && !list.videos.length && !uploads.length && !applied
  const title =
    scope === undefined
      ? "All videos"
      : scope === NO_FOLDER
        ? "No folder"
        : (folders.folders.find((each) => each.id === scope)?.name ?? "All videos")
  const count =
    scope === undefined
      ? folders.allCount
      : scope === NO_FOLDER
        ? folders.noFolderCount
        : (folders.folders.find((each) => each.id === scope)?.videoCount ?? 0)
  const emptyText = list.videos.length
    ? null
    : showSample
      ? "Paste a link above to save your first video"
      : applied
        ? "Nothing matches"
        : scope === NO_FOLDER
          ? "Every video is in a folder."
          : "Nothing in this folder yet. A video's menu moves it in."

  const pickedCard =
    pickedId === SAMPLE_VIDEO_ID
      ? SAMPLE_VIDEO
      : (list.videos.find((video) => video.id === pickedId) ?? null)

  return (
    <>
      <ThreePanels
        showRightFor={pickedId ? `${pickedId}:${picks}` : undefined}
        left={{
          label: "Folders",
          showLabel: "Show folders",
          content: (
            <FoldersPanel
              list={folders}
              scope={scope}
              onPick={(next) => setAddress({ folder: next })}
              onChanged={setFolders}
              onDeleted={(folderId, fresh) => {
                setFolders(fresh)
                setList((current) => ({
                  ...current,
                  videos:
                    scope === folderId
                      ? current.videos
                      : current.videos.map((video) =>
                          video.folderId === folderId ? { ...video, folderId: null } : video
                        ),
                }))
                if (scope === folderId) setAddress({ folder: undefined })
              }}
            />
          ),
        }}
        middle={{
          label: "Videos",
          content: (
            <VideosListPanel
              title={title}
              count={count}
              view={view}
              onView={setView}
              link={link}
              linkInvalid={linkInvalid}
              onLink={(value) => {
                setLink(value)
                setLinkInvalid(false)
              }}
              onSaveLink={() => void saveLink()}
              savingLink={savingLink}
              onUploadFile={(file) => void uploadFile(file)}
              query={query}
              onQuery={setQuery}
              videos={list.videos}
              uploads={uploads}
              pickedId={pickedId}
              actions={actions}
              loading={loadingList}
              failure={loadingList ? null : list.failure}
              onRetryList={() => setListReloads((count) => count + 1)}
              emptyText={emptyText}
              showSample={showSample}
              hasOlder={list.nextCursor !== null}
              loadingOlder={loadingOlder}
              onShowOlder={() => void showOlder()}
            />
          ),
        }}
        right={{
          label: "Video",
          showLabel: "Show the video",
          content: (
            <VideoPanel
              pickedId={pickedId}
              pickedCard={pickedCard}
              onCardChanged={patchCard}
              onDelete={setDeleting}
              onClose={() => setAddress({ open: null })}
            />
          ),
        }}
      />

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(shown) => {
          if (!shown) setDeleting(null)
        }}
        title={`Delete “${deleting?.title ?? ""}”?`}
        description={
          deleting?.source === "upload"
            ? "This removes the video, its cover and its analysis from your library. The original stays on your computer."
            : `This removes the video, its cover and its analysis from your library. The original stays on ${siteName(deleting?.source ?? "web")}.`
        }
        confirmLabel="Delete video"
        loading={deleteBusy}
        onConfirm={() => void confirmDelete()}
      />
    </>
  )
}

function listKey(scope: FolderScope, query: string, reloads: number) {
  return `${scope ?? ""}|${query}|${reloads}`
}

function fromPage(data: VideosPageData): ListState {
  return {
    answers: listKey(data.folder, "", 0),
    scope: data.folder,
    query: "",
    videos: data.page.videos,
    nextCursor: data.page.nextCursor,
    failure: null,
  }
}

/** Only the card's own fields, so a detail never bloats the list. */
function pickCardFields(card: NoteVideoCard): NoteVideoCard {
  return {
    id: card.id,
    folderId: card.folderId,
    source: card.source,
    sourceUrl: card.sourceUrl,
    kind: card.kind,
    status: card.status,
    error: card.error,
    coverUrl: card.coverUrl,
    hasFile: card.hasFile,
    title: card.title,
    channelName: card.channelName,
    durationSeconds: card.durationSeconds,
    firstSummaryLine: card.firstSummaryLine,
    tags: card.tags,
    done: card.done,
    noteFirstLine: card.noteFirstLine,
    createdAt: card.createdAt,
  }
}
