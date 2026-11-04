import * as React from "react"
import { ArchiveIcon, FilmIcon, GalleryHorizontalIcon, ImageIcon, Loader2Icon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ErrorRow } from "@/components/ui/error-row"
import { LoadingRow } from "@/components/ui/loading-row"
import { getArchiveErrorMessage, loadArchiveItem, type ArchiveCard, type ArchiveItemView } from "@/lib/api/archive/items"
import { loadArchivePicks } from "@/lib/api/archive/posting"
import { fitWarnings } from "@/lib/archive/fit"
import { NETWORK_NAMES } from "@/lib/social/networks"
import { showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"

export type PickNetwork = "instagram" | "tiktok" | "linkedin" | "x"

/** What a post writer gets back from the Archive. */
export type ArchivePick = {
  item: ArchiveItemView
  /** The file to post: the video or picture, or a carousel's first slide. */
  mediaUrl: string
  /** A carousel's slides in order, for a post of several pictures (part 40). */
  mediaUrls: string[]
  /** The item's caption for this network, from Write captions, or "". */
  caption: string
  /** Shape, length and size warnings for this network (parts 37 and 38). */
  warnings: string[]
}

const KIND_ICONS = { video: FilmIcon, carousel: GalleryHorizontalIcon, picture: ImageIcon }

/**
 * From archive, beside a post writer's file picker (part 34): the project's
 * ready items this network can post, with the drafts ticked for it in
 * Video's send window first and marked (part 35). Picking one hands back its
 * file, its caption for this network and any warnings.
 */
export function ArchivePickButton({
  projectId,
  network,
  onPick,
  label = "From archive",
}: {
  projectId: string
  network: PickNetwork
  onPick: (pick: ArchivePick) => void
  label?: string
}) {
  const [open, setOpen] = React.useState(false)
  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        <ArchiveIcon className="size-4" />
        {label}
      </Button>
      {open ? <ArchivePicker projectId={projectId} network={network} onClose={() => setOpen(false)} onPick={onPick} /> : null}
    </>
  )
}

function ArchivePicker({
  projectId,
  network,
  onClose,
  onPick,
}: {
  projectId: string
  network: PickNetwork
  onClose: () => void
  onPick: (pick: ArchivePick) => void
}) {
  const [answer, setAnswer] = React.useState<{ items: ArchiveCard[]; draftIds: string[] } | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [reloads, setReloads] = React.useState(0)
  const [opening, setOpening] = React.useState<string | null>(null)

  React.useEffect(() => {
    let cancelled = false
    loadArchivePicks(projectId, network).then(
      (loaded) => {
        if (!cancelled) setAnswer(loaded)
      },
      (failure: unknown) => {
        if (!cancelled) setError(getArchiveErrorMessage(failure))
      }
    )
    return () => {
      cancelled = true
    }
  }, [network, projectId, reloads])

  async function pick(card: ArchiveCard) {
    setOpening(card.id)
    try {
      const item = await loadArchiveItem(card.id)
      const mediaUrls = item.kind === "carousel" ? item.slideFiles.map((slide) => slide.url) : [item.fileUrl]
      onPick({
        item,
        mediaUrl: mediaUrls[0] ?? "",
        mediaUrls,
        caption: network === "instagram" || network === "tiktok" ? (item.captions[network] ?? item.caption) : item.caption,
        warnings: fitWarnings(network, item),
      })
      onClose()
    } catch (failure) {
      showErrorToast(getArchiveErrorMessage(failure))
    } finally {
      setOpening(null)
    }
  }

  const drafts = new Set(answer?.draftIds ?? [])
  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent variant="admin">
        <DialogHeader>
          <DialogTitle>From the archive</DialogTitle>
          <DialogDescription>
            {network === "x" ? "Pictures from this project's archive. X takes pictures only." : `Videos, pictures and carousels from this project's archive, for ${NETWORK_NAMES[network]}.`}
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <Card size="sm">
            <CardContent>
              {error ? (
                <ErrorRow message={error} onRetry={() => setReloads((count) => count + 1)} />
              ) : !answer ? (
                <LoadingRow label="Opening the archive…" />
              ) : !answer.items.length ? (
                <p className="text-sm text-muted-foreground">Nothing in this project's archive can go on {NETWORK_NAMES[network]} yet.</p>
              ) : (
                <div className="grid grid-cols-[repeat(auto-fill,minmax(7.5rem,1fr))] gap-3">
                  {answer.items.map((card) => {
                    const Icon = KIND_ICONS[card.kind]
                    return (
                      <button
                        key={card.id}
                        type="button"
                        disabled={opening !== null}
                        onClick={() => void pick(card)}
                        className={cn("grid gap-1 rounded-md p-1 text-left hover:bg-accent", drafts.has(card.id) && "bg-accent/60")}
                      >
                        <span className="relative flex aspect-square items-center justify-center overflow-hidden rounded bg-muted">
                          {card.coverUrl ? <img src={card.coverUrl} alt="" className="size-full object-cover" loading="lazy" /> : <Icon className="size-5 text-muted-foreground" />}
                          {opening === card.id ? (
                            <span className="absolute inset-0 flex items-center justify-center bg-background/70">
                              <Loader2Icon className="size-4 animate-spin" />
                            </span>
                          ) : null}
                        </span>
                        <span className="truncate text-sm">{card.title || "Untitled"}</span>
                        <span className="truncate text-xs text-muted-foreground">{drafts.has(card.id) ? "Draft for here" : card.posted ? `Posted ${card.posted} ${card.posted === 1 ? "time" : "times"}` : "Not posted yet"}</span>
                      </button>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
