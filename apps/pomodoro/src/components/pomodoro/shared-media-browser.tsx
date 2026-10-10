import * as React from "react"
import { SearchIcon } from "lucide-react"

import { ErrorRow } from "@/components/ui/error-row"
import { Input } from "@/components/ui/input"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { LoadingRow } from "@/components/ui/loading-row"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  getSharedMediaErrorMessage,
  listSharedMediaPage,
  type SharedMediaQuery,
} from "@/lib/api/pomodoro/shared-media"
import { useProductAuth } from "@/lib/pomodoro/auth-state"
import { pillTabsList, pillTabsTrigger } from "@/lib/pomodoro/pill-tabs"
import { usePreviewAudio } from "@/lib/pomodoro/use-preview-audio"
import { sameSoundReference } from "@/lib/pomodoro/sound-catalog"
import {
  MEDIA_PAGE_VIEWS,
  SHARED_PAGE_SIZE,
  sharedSound,
  type MediaPageView,
  type SharedMediaPage,
  type SharedScope,
  type SharedSort,
} from "@/lib/pomodoro/shared-media"
import type { PomodoroUploadPurpose } from "@/lib/pomodoro/media-limits"
import { CatalogPager } from "@/components/pomodoro/catalog-pager"
import { SharedMediaCard } from "@/components/pomodoro/shared-media-card"

/**
 * "Shared by members" and "Saved" on Sounds and Backgrounds (task 03, parts
 * 3, 8 and 9): every shared file of the page's kind, or the ones the member
 * saved, 20 at a time from the server, with a search over names and tags,
 * the tag filter and a sort by newest or most used.
 */
export function SharedMediaBrowser({
  purpose,
  scope,
  tag,
  onTags,
}: {
  purpose: PomodoroUploadPurpose
  scope: SharedScope
  /** The tag picked in the page header's filter, or null for all. */
  tag: string | null
  /** The tags on the shared files of this kind, for that filter. */
  onTags: (tags: string[]) => void
}) {
  const [searchText, setSearchText] = React.useState("")
  const [query, setQuery] = React.useState<
    Omit<SharedMediaQuery, "purpose" | "scope" | "handle" | "tag">
  >({
    search: "",
    sort: "newest",
    page: 0,
  })
  // A new tag from the header starts again at the first page.
  const [shownTag, setShownTag] = React.useState(tag)
  if (shownTag !== tag) {
    setShownTag(tag)
    setQuery((current) => ({ ...current, page: 0 }))
  }
  const [reload, setReload] = React.useState(0)
  const searchTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const preview = usePreviewAudio()
  const noun = purpose === "sound" ? "sound" : "background"

  const key = JSON.stringify({ purpose, scope, tag, ...query, reload })
  const [loaded, setLoaded] = React.useState<{
    key: string
    page: SharedMediaPage | null
    error: string | null
  } | null>(null)

  React.useEffect(() => {
    let current = true
    listSharedMediaPage({ purpose, scope, handle: null, tag, ...query })
      .then((page) => {
        if (!current) return
        setLoaded({ key, page, error: null })
        onTags(page.tags)
      })
      .catch((cause) => {
        if (current)
          setLoaded({ key, page: null, error: getSharedMediaErrorMessage(cause) })
      })
    return () => {
      current = false
    }
    // `key` stands for every input above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  // The last answer stays on screen while the next page loads, so the grid
  // keeps its frame instead of collapsing to a spinner on every page turn.
  const loading = loaded?.key !== key
  const page = loaded?.page ?? null
  const pages = page ? Math.max(1, Math.ceil(page.total / SHARED_PAGE_SIZE)) : 1

  const change = (next: Partial<typeof query>) =>
    setQuery((current) => ({ ...current, page: 0, ...next }))

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full sm:w-64">
          <SearchIcon
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            type="search"
            value={searchText}
            maxLength={80}
            aria-label={`Search shared ${noun}s by name or tag`}
            placeholder="Search names and tags"
            className="pl-8"
            onChange={(event) => {
              const value = event.target.value
              setSearchText(value)
              // Asked once typing pauses, not on every key.
              if (searchTimer.current) clearTimeout(searchTimer.current)
              searchTimer.current = setTimeout(() => change({ search: value }), 300)
            }}
          />
        </div>
        <Select
          value={query.sort}
          onValueChange={(value) => change({ sort: value as SharedSort })}
        >
          <SelectTrigger aria-label="Sort" className="w-auto">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">Newest</SelectItem>
            <SelectItem value="most_used">Most used</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {preview.failed ? (
        <p role="status" className="text-sm text-muted-foreground">
          That preview could not be played. Click the card to try again.
        </p>
      ) : null}

      {loaded?.error && loading === false ? (
        <ErrorRow
          message={loaded.error}
          onRetry={() => setReload((count) => count + 1)}
        />
      ) : !page ? (
        <LoadingRow label={`Loading shared ${noun}s…`} />
      ) : page.items.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          {query.search || tag
            ? `No shared ${noun}s match that.`
            : scope === "saved"
              ? `Nothing saved yet. Press the heart on a shared ${noun} to keep it here.`
              : `Nobody has shared a ${noun} yet.`}
        </p>
      ) : (
        <div
          className={
            purpose === "sound"
              ? "grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-4"
              : "grid grid-cols-2 gap-4 sm:grid-cols-4 sm:gap-6"
          }
          aria-busy={loading}
        >
          {page.items.map((item) => {
            const reference = sharedSound(item)
            return (
              <SharedMediaCard
                key={item.mediaId}
                item={item}
                playing={
                  sameSoundReference(preview.previewing, reference) &&
                  preview.playing
                }
                onPlay={() => preview.toggle(reference)}
                // Taking a heart back in Saved drops the card on the next read.
                onSavedChange={(saved) => {
                  if (scope === "saved" && !saved)
                    setReload((count) => count + 1)
                }}
              />
            )
          })}
        </div>
      )}

      {page && page.total > 0 ? (
        <CatalogPager
          noun={noun}
          total={page.total}
          first={query.page * SHARED_PAGE_SIZE}
          shownCount={page.items.length}
          page={query.page}
          pages={pages}
          onPage={(next) => setQuery((current) => ({ ...current, page: next }))}
        />
      ) : null}
    </div>
  )
}

/**
 * The pill row beside the title on Sounds and Backgrounds that switches the
 * grid between the catalogue, "Shared by members" and, signed in, Saved.
 */
export function MediaViewTabs({
  value,
  onChange,
}: {
  value: MediaPageView
  onChange: (view: MediaPageView) => void
}) {
  const { authenticated } = useProductAuth()
  return (
    <Tabs value={value} onValueChange={(next) => onChange(next as MediaPageView)}>
      <TabsList aria-label="Which files" className={pillTabsList}>
        {MEDIA_PAGE_VIEWS.filter((view) => authenticated || !view.signedIn).map(
          (view) => (
            <TabsTrigger key={view.id} value={view.id} className={pillTabsTrigger}>
              {view.label}
            </TabsTrigger>
          )
        )}
      </TabsList>
    </Tabs>
  )
}
