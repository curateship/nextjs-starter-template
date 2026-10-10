import * as React from "react"
import { Loader2Icon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  getSharedMediaErrorMessage,
  listSharedMediaPage,
} from "@/lib/api/pomodoro/shared-media"
import { usePreviewAudio } from "@/lib/pomodoro/use-preview-audio"
import { sameSoundReference } from "@/lib/pomodoro/sound-catalog"
import {
  sharedSound,
  type SharedMediaItem,
} from "@/lib/pomodoro/shared-media"
import type { PomodoroUploadPurpose } from "@/lib/pomodoro/media-limits"
import { showErrorToast } from "@/lib/toast/error-toast"
import { PanelCard } from "@/components/pomodoro/panel-card"
import { SharedMediaCard } from "@/components/pomodoro/shared-media-card"

/**
 * One of the two cards on a public page listing the owner's shared sounds
 * or backgrounds (task 03, part 1). The newest few arrive with the page;
 * "Show all" reads the rest 20 at a time. A card with nothing shared is not
 * drawn, the way an empty badge shelf is not.
 */
export function ProfileSharedPanel({
  handle,
  purpose,
  initial,
}: {
  handle: string
  purpose: PomodoroUploadPurpose
  initial: { items: SharedMediaItem[]; total: number }
}) {
  const [items, setItems] = React.useState(initial.items)
  const [loadedPages, setLoadedPages] = React.useState(0)
  const [loading, setLoading] = React.useState(false)
  const preview = usePreviewAudio()
  const label = purpose === "sound" ? "Sounds" : "Backgrounds"
  if (!initial.total) return null
  const more = items.length < initial.total

  const showMore = async () => {
    setLoading(true)
    try {
      const page = await listSharedMediaPage({
        purpose,
        scope: "everyone",
        handle,
        search: "",
        tag: null,
        sort: "newest",
        page: loadedPages,
      })
      // The first page read replaces the newest few it already includes.
      setItems((current) =>
        loadedPages === 0 ? page.items : [...current, ...page.items]
      )
      setLoadedPages((count) => count + 1)
    } catch (cause) {
      showErrorToast(getSharedMediaErrorMessage(cause))
    } finally {
      setLoading(false)
    }
  }

  return (
    <PanelCard
      label={`${label} · ${initial.total}`}
      aside={
        more ? (
          <Button
            size="sm"
            variant="outline"
            className="rounded-full"
            disabled={loading}
            onClick={() => void showMore()}
          >
            {loading ? (
              <Loader2Icon className="animate-spin" aria-hidden="true" />
            ) : null}
            {loadedPages === 0 ? "Show all" : "Show more"}
          </Button>
        ) : null
      }
    >
      <div className="grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-4">
        {items.map((item) => {
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
            />
          )
        })}
      </div>
    </PanelCard>
  )
}
