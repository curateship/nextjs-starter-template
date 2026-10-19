import * as React from "react"
import { useNavigate } from "@tanstack/react-router"
import { toast } from "sonner"

import type { PostCardActions } from "@/components/note-posts/post-cards"
import { PostFoldersPanel } from "@/components/note-posts/post-folders-panel"
import { PostPanel } from "@/components/note-posts/post-panel"
import { PostsListPanel } from "@/components/note-posts/posts-list-panel"
import { ThreePanels } from "@/components/note-posts/three-panels"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { loadPostFolders } from "@/lib/api/note/post-folders"
import {
  analyseManyPosts,
  deleteNotePost,
  getPostErrorMessage,
  loadPostAuthors,
  loadPosts,
  mergePostPlans,
  moveNotePost,
  refreshPostCards,
  retryNotePost,
  savePost,
} from "@/lib/api/note/posts"
import { describeBulkResult } from "@/lib/format/bulk-result"
import { useSelection } from "@/lib/hooks/use-selection"
import {
  isPostMoving,
  MANY_AT_ONCE_MAX,
  POST_SAYS,
  type NotePostCard,
  type NotePostFolderList,
  type NotePostPage,
  type PlanProgress,
  type PostAuthor,
} from "@/lib/note/posts/posts"
import { NO_FOLDER, type FolderScope } from "@/lib/note/videos"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"

/**
 * The posts dashboard at `/posts`: folders and authors on the left, the posts
 * in the middle, and the picked post with its plan on the right. The folder,
 * author, tag, plan filter and picked post live in the address, so a reload
 * and a bell notice come back to the same place.
 *
 * Saving writes a row and returns; the worker reads X. While any card on
 * screen is still moving, the list asks where those cards have got to three
 * seconds after each answer. `?save=<link>`, which the Save from x.com button
 * opens, saves that post as if it had been pasted.
 */

export type PostsPageData = {
  folders: NotePostFolderList
  authors: PostAuthor[]
  page: NotePostPage
  filters: Filters
}

type Filters = {
  folder: FolderScope
  author: string | undefined
  tag: string | undefined
  progress: PlanProgress | undefined
}

const POLL_MS = 3_000
const SEARCH_DELAY_MS = 300

type ListState = {
  answers: string
  posts: NotePostCard[]
  nextCursor: string | null
  similarCount: number
  failure: string | null
}

export function PostsPage({
  initial,
  filters,
  open,
  save,
}: {
  initial: PostsPageData
  filters: Filters
  open: string | undefined
  save: string | undefined
}) {
  const navigate = useNavigate({ from: "/posts" })

  const [loaded, setLoaded] = React.useState(initial)
  const [folders, setFolders] = React.useState(initial.folders)
  const [authors, setAuthors] = React.useState(initial.authors)
  const [list, setList] = React.useState<ListState>(() => fromPage(initial))
  if (loaded !== initial) {
    setLoaded(initial)
    setFolders(initial.folders)
    setAuthors(initial.authors)
    setList(fromPage(initial))
  }

  // A folder that no longer exists reads as all.
  const scope: FolderScope =
    filters.folder === NO_FOLDER || folders.folders.some((each) => each.id === filters.folder)
      ? filters.folder
      : undefined
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
  const [deleting, setDeleting] = React.useState<NotePostCard | null>(null)
  const [deleteBusy, setDeleteBusy] = React.useState(false)
  const [loadingOlder, setLoadingOlder] = React.useState(false)
  const [listReloads, setListReloads] = React.useState(0)
  const [picks, setPicks] = React.useState(0)
  const [analysingMany, setAnalysingMany] = React.useState(false)
  const [merging, setMerging] = React.useState(false)
  const selection = useSelection()

  const setAddress = React.useCallback(
    (next: Partial<Filters> & { open?: string | null; save?: undefined }) => {
      void navigate({
        search: (previous) => {
          const merged: Record<string, unknown> = { ...previous }
          for (const [key, value] of Object.entries(next)) merged[key] = value ?? undefined
          return merged as typeof previous
        },
        replace: true,
        resetScroll: false,
      })
    },
    [navigate]
  )

  const refreshSides = React.useCallback(async () => {
    try {
      const [freshFolders, freshAuthors] = await Promise.all([loadPostFolders(), loadPostAuthors()])
      setFolders(freshFolders)
      setAuthors(freshAuthors)
    } catch {
      // The counts are a nicety; the cards themselves are already right.
    }
  }, [])

  // A new narrowing or search asks the server again. Only the newest ask may
  // touch the screen.
  const wanted = listKey({ ...filters, folder: scope }, applied, listReloads)
  const askVersion = React.useRef(0)
  React.useEffect(() => {
    const version = ++askVersion.current
    if (list.answers === wanted) return
    loadPosts({
      folder: scope,
      author: filters.author,
      tag: filters.tag,
      progress: filters.progress,
      search: applied || undefined,
    })
      .then((page) => {
        if (version !== askVersion.current) return
        setList({
          answers: wanted,
          posts: page.posts,
          nextCursor: page.nextCursor,
          similarCount: page.similarCount,
          failure: null,
        })
      })
      .catch((error) => {
        if (version !== askVersion.current) return
        setList((current) => ({ ...current, answers: wanted, failure: getPostErrorMessage(error) }))
      })
  }, [list.answers, wanted, scope, filters.author, filters.tag, filters.progress, applied])
  const loadingList = list.answers !== wanted

  // Every card still moving is asked about, in one request, three seconds
  // after the last answer, so two asks are never in the air at once.
  const movingKey = list.posts
    .filter(isPostMoving)
    .map((post) => post.id)
    .sort()
    .join(",")
  const [pollRound, setPollRound] = React.useState(0)
  React.useEffect(() => {
    if (!movingKey) return
    let live = true
    const ids = movingKey.split(",")
    const timer = setTimeout(() => {
      refreshPostCards(ids)
        .then((fresh) => {
          if (!live) return
          const byId = new Map(fresh.map((card) => [card.id, card]))
          const settled = ids.some((id) => {
            const card = byId.get(id)
            return card && !isPostMoving(card)
          })
          setList((current) => ({
            ...current,
            posts: current.posts
              .filter((post) => !ids.includes(post.id) || byId.has(post.id))
              .map((post) => byId.get(post.id) ?? post),
          }))
          // A post just read has an author now, so the left panel learns it.
          if (settled) void refreshSides()
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
  }, [movingKey, pollRound, refreshSides])

  // A card picked from a notice or a reload is scrolled into view once.
  const scrolledFor = React.useRef<string | null>(null)
  React.useEffect(() => {
    if (!pickedId || scrolledFor.current === pickedId) return
    const card = document.querySelector(`[data-post-id="${CSS.escape(pickedId)}"]`)
    if (!card) return
    scrolledFor.current = pickedId
    card.scrollIntoView({ block: "nearest" })
  }, [pickedId, list.posts])

  const patchCard = React.useCallback((card: NotePostCard) => {
    setList((current) => ({
      ...current,
      posts: current.posts.map((post) => (post.id === card.id ? { ...post, ...pickCardFields(card) } : post)),
    }))
  }, [])

  /** A new card always shows where it landed: everything, with no filter or search. */
  function showNewCard(card: NotePostCard) {
    const visible = scope === undefined && !filters.author && !filters.tag && !filters.progress && !applied
    if (visible) {
      setList((current) => ({ ...current, posts: [card, ...current.posts.filter((post) => post.id !== card.id)] }))
      setAddress({ open: card.id })
    } else {
      setQuery("")
      setApplied("")
      setAddress({ folder: undefined, author: undefined, tag: undefined, progress: undefined, open: card.id })
    }
    void refreshSides()
  }

  async function saveLink(raw: string) {
    if (savingLink) return
    const url = raw.trim()
    if (!url) {
      setLinkInvalid(true)
      showErrorToast(POST_SAYS.notALink)
      return
    }
    setSavingLink(true)
    dismissErrorToast()
    try {
      const { post, alreadySaved } = await savePost(url)
      setLink("")
      if (alreadySaved) {
        toast.success("That post is already saved.")
        setAddress({ open: post.id })
      } else {
        showNewCard(post)
      }
    } catch (error) {
      setLink(url)
      setLinkInvalid(true)
      showErrorToast(getPostErrorMessage(error))
    } finally {
      setSavingLink(false)
    }
  }

  // `?save=` from the Save from x.com button: saved once, then taken out of
  // the address so a reload does not save it again.
  const savedFromAddress = React.useRef<string | null>(null)
  const latestSaveLink = React.useRef(saveLink)
  React.useEffect(() => {
    latestSaveLink.current = saveLink
  })
  React.useEffect(() => {
    if (!save || savedFromAddress.current === save) return
    savedFromAddress.current = save
    setAddress({ save: undefined })
    void latestSaveLink.current(save)
  }, [save, setAddress])

  async function showOlder() {
    if (!list.nextCursor || loadingOlder) return
    setLoadingOlder(true)
    const askedFor = list.answers
    try {
      const page = await loadPosts({
        folder: scope,
        author: filters.author,
        tag: filters.tag,
        progress: filters.progress,
        search: applied || undefined,
        cursor: list.nextCursor,
      })
      setList((current) =>
        current.answers !== askedFor
          ? current
          : {
              ...current,
              posts: [...current.posts, ...page.posts.filter((post) => !current.posts.some((shown) => shown.id === post.id))],
              nextCursor: page.nextCursor,
            }
      )
    } catch (error) {
      showErrorToast(getPostErrorMessage(error))
    } finally {
      setLoadingOlder(false)
    }
  }

  async function confirmDelete() {
    if (!deleting) return
    setDeleteBusy(true)
    dismissErrorToast()
    try {
      await deleteNotePost(deleting.id)
      setList((current) => ({ ...current, posts: current.posts.filter((post) => post.id !== deleting.id) }))
      if (pickedId === deleting.id) setAddress({ open: null })
      selection.setSelected((current) => {
        const next = new Set(current)
        next.delete(deleting.id)
        return next
      })
      toast.success(`Deleted ${deleting.title}.`)
      setDeleting(null)
      void refreshSides()
    } catch (error) {
      showErrorToast(getPostErrorMessage(error))
    } finally {
      setDeleteBusy(false)
    }
  }

  // Only the ticked posts on screen are acted on and priced. A post ticked
  // under another folder or filter stays ticked for when it shows again.
  const pickedPosts = list.posts.filter((post) => selection.selected.has(post.id))

  async function analyseMany() {
    if (analysingMany) return
    const ids = pickedPosts.map((post) => post.id)
    if (ids.length > MANY_AT_ONCE_MAX) {
      showErrorToast(POST_SAYS.tooManyPicked)
      return
    }
    setAnalysingMany(true)
    dismissErrorToast()
    try {
      const { posts, skipped } = await analyseManyPosts(ids)
      posts.forEach(patchCard)
      const summary = describeBulkResult({
        done: posts.length,
        kept: skipped.length,
        one: "post",
        many: "posts",
        verb: "queued for the AI",
      })
      // The first refusal says why, in the server's own words.
      if (skipped.length) showErrorToast(`${summary} ${skipped[0].reason}`)
      else toast.success(summary)
      selection.clear()
    } catch (error) {
      showErrorToast(getPostErrorMessage(error))
    } finally {
      setAnalysingMany(false)
    }
  }

  async function merge() {
    if (merging) return
    const ids = pickedPosts.map((post) => post.id)
    if (ids.length < 2) {
      showErrorToast(POST_SAYS.pickTwo)
      return
    }
    if (ids.length > MANY_AT_ONCE_MAX) {
      showErrorToast(POST_SAYS.tooManyPicked)
      return
    }
    setMerging(true)
    dismissErrorToast()
    try {
      const card = await mergePostPlans(ids)
      selection.clear()
      toast.success(`Writing one plan from ${ids.length} posts.`)
      showNewCard(card)
    } catch (error) {
      showErrorToast(getPostErrorMessage(error))
    } finally {
      setMerging(false)
    }
  }

  /** A post moved folder: it stays on the list only if the list still covers it. */
  function showMoved(card: NotePostCard) {
    const stays = scope === undefined || (scope === NO_FOLDER ? card.folderId === null : card.folderId === scope)
    setList((current) => ({
      ...current,
      posts: stays
        ? current.posts.map((shown) => (shown.id === card.id ? { ...shown, ...pickCardFields(card) } : shown))
        : current.posts.filter((shown) => shown.id !== card.id),
    }))
    void refreshSides()
  }

  const actions: PostCardActions = {
    folders: folders.folders,
    onPick: (post) => {
      setPicks((count) => count + 1)
      setAddress({ open: post.id })
    },
    onMove: (post, folderId) => {
      dismissErrorToast()
      moveNotePost(post.id, folderId)
        .then((card) => {
          showMoved(card)
          const into = folders.folders.find((each) => each.id === folderId)
          toast.success(into ? `Moved to “${into.name}”.` : "Taken out of its folder.")
        })
        .catch((error) => showErrorToast(getPostErrorMessage(error)))
    },
    onDelete: (post) => setDeleting(post),
    onRetry: (post) => {
      dismissErrorToast()
      retryNotePost(post.id)
        .then(patchCard)
        .catch((error) => showErrorToast(getPostErrorMessage(error)))
    },
    onTag: (tag) => setAddress({ tag }),
  }

  const title =
    scope === undefined
      ? "All posts"
      : scope === NO_FOLDER
        ? "No folder"
        : (folders.folders.find((each) => each.id === scope)?.name ?? "All posts")
  const count =
    scope === undefined
      ? folders.allCount
      : scope === NO_FOLDER
        ? folders.noFolderCount
        : (folders.folders.find((each) => each.id === scope)?.postCount ?? 0)
  const narrowed = Boolean(applied || filters.author || filters.tag || filters.progress)
  const emptyText = list.posts.length
    ? null
    : folders.allCount === 0
      ? "Paste a link to an X post above to save your first one."
      : narrowed
        ? "Nothing matches"
        : scope === NO_FOLDER
          ? "Every post is in a folder."
          : "Nothing in this folder yet. A post's menu moves it in."

  const pickedCard = list.posts.find((post) => post.id === pickedId) ?? null
  const visibleIds = list.posts.map((post) => post.id)

  return (
    <>
      <ThreePanels
        showRightFor={pickedId ? `${pickedId}:${picks}` : undefined}
        left={{
          label: "Folders",
          showLabel: "Show folders",
          content: (
            <PostFoldersPanel
              list={folders}
              scope={scope}
              onPick={(next) => setAddress({ folder: next })}
              onChanged={setFolders}
              onDeleted={(folderId, fresh) => {
                setFolders(fresh)
                setList((current) => ({
                  ...current,
                  posts:
                    scope === folderId
                      ? current.posts
                      : current.posts.map((post) => (post.folderId === folderId ? { ...post, folderId: null } : post)),
                }))
                if (scope === folderId) setAddress({ folder: undefined })
              }}
              authors={authors}
              author={filters.author}
              onPickAuthor={(handle) => setAddress({ author: handle })}
            />
          ),
        }}
        middle={{
          label: "Posts",
          content: (
            <PostsListPanel
              title={title}
              count={count}
              link={link}
              linkInvalid={linkInvalid}
              onLink={(value) => {
                setLink(value)
                setLinkInvalid(false)
              }}
              onSaveLink={() => void saveLink(link)}
              savingLink={savingLink}
              query={query}
              onQuery={setQuery}
              progress={filters.progress}
              onProgress={(progress) => setAddress({ progress })}
              author={filters.author}
              onClearAuthor={() => setAddress({ author: undefined })}
              tag={filters.tag}
              onClearTag={() => setAddress({ tag: undefined })}
              posts={list.posts}
              pickedId={pickedId}
              selected={selection.selected}
              pickedCount={pickedPosts.length}
              onToggle={selection.toggle}
              onToggleAll={() => selection.toggleVisible(visibleIds)}
              allState={selection.selectAllState(visibleIds)}
              pickedPosts={pickedPosts}
              similarCount={list.similarCount}
              onAnalyseMany={() => void analyseMany()}
              analysingMany={analysingMany}
              onMerge={() => void merge()}
              merging={merging}
              onClearPicked={selection.clear}
              actions={actions}
              loading={loadingList}
              failure={loadingList ? null : list.failure}
              onRetryList={() => setListReloads((reloads) => reloads + 1)}
              emptyText={emptyText}
              hasOlder={list.nextCursor !== null}
              loadingOlder={loadingOlder}
              onShowOlder={() => void showOlder()}
            />
          ),
        }}
        right={{
          label: "Post",
          showLabel: "Show the post",
          content: (
            <PostPanel
              pickedId={pickedId}
              pickedCard={pickedCard}
              similarCount={list.similarCount}
              onCardChanged={patchCard}
              onDelete={setDeleting}
              onClose={() => setAddress({ open: null })}
              onOpen={(id) => {
                setPicks((count) => count + 1)
                setAddress({ open: id })
              }}
              onTag={(tag) => setAddress({ tag })}
              onMoved={showMoved}
            />
          ),
        }}
      />

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(shown) => {
          if (!shown) setDeleting(null)
        }}
        title={`Delete ${deleting?.title ?? ""}?`}
        description={
          deleting?.kind === "merged"
            ? "This removes the merged plan. The posts it was made from stay."
            : "This removes the post, its pictures, its video and its plan from your library. The original stays on X."
        }
        confirmLabel={deleting?.kind === "merged" ? "Delete plan" : "Delete post"}
        loading={deleteBusy}
        onConfirm={() => void confirmDelete()}
      />
    </>
  )
}

function listKey(filters: Filters, query: string, reloads: number) {
  return `${filters.folder ?? ""}|${filters.author ?? ""}|${filters.tag ?? ""}|${filters.progress ?? ""}|${query}|${reloads}`
}

function fromPage(data: PostsPageData): ListState {
  return {
    answers: listKey(data.filters, "", 0),
    posts: data.page.posts,
    nextCursor: data.page.nextCursor,
    similarCount: data.page.similarCount,
    failure: null,
  }
}

/** Only the card's own fields, so a detail never bloats the list. */
function pickCardFields(card: NotePostCard): NotePostCard {
  return {
    id: card.id,
    kind: card.kind,
    folderId: card.folderId,
    url: card.url,
    status: card.status,
    error: card.error,
    hasText: card.hasText,
    title: card.title,
    authorName: card.authorName,
    authorHandle: card.authorHandle,
    authorPictureUrl: card.authorPictureUrl,
    postedAt: card.postedAt,
    firstLines: card.firstLines,
    firstPictureUrl: card.firstPictureUrl,
    firstHighlight: card.firstHighlight,
    firstSummaryLine: card.firstSummaryLine,
    tags: card.tags,
    progress: card.progress,
    videoStatus: card.videoStatus,
    analyse: card.analyse,
    planChars: card.planChars,
    createdAt: card.createdAt,
  }
}
