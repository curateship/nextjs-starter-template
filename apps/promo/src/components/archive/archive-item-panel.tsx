import * as React from "react"
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  CopyIcon,
  DownloadIcon,
  ExternalLinkIcon,
  FilmIcon,
  GalleryHorizontalIcon,
  ImageIcon,
  Loader2Icon,
  PinIcon,
  PinOffIcon,
  RotateCcwIcon,
  SparklesIcon,
  Trash2Icon,
} from "lucide-react"

import { DashboardCardTitleHeader } from "@/components/shared/dashboard-card-header"
import { FoldingMenu, MenuAction, MenuLine, MenuSection, useOpenSections } from "@/components/shared/folding-menu"
import { PanelCard } from "@/components/shared/panel-card"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { ErrorRow } from "@/components/ui/error-row"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { LoadingRow } from "@/components/ui/loading-row"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import {
  binArchiveItems,
  deleteArchiveItemForGood,
  getArchiveErrorMessage,
  loadArchiveItem,
  pinArchiveItem,
  placeArchiveItem,
  restoreArchiveItem,
  saveArchiveItem,
  type ArchiveItemView,
} from "@/lib/api/archive/items"
import { writeArchiveCaptions } from "@/lib/api/archive/posting"
import { BIN_DAYS, CAPTION_NETWORKS, type ArchiveItemKind, type CaptionNetwork } from "@/lib/archive/items"
import { formatFileSize } from "@/lib/format/format-bytes"
import { formatDate } from "@/lib/format/format-time"
import { NETWORK_NAMES, type Network } from "@/lib/social/networks"
import { CAPTION_MAX, captionProblem } from "@/lib/social/phone-apps"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"

/** Words typed in the ⋮ save themselves this long after the last letter. */
const SAVE_DELAY_MS = 700

const KIND_ICONS: Record<ArchiveItemKind, React.ComponentType<{ className?: string }>> = {
  video: FilmIcon,
  carousel: GalleryHorizontalIcon,
  picture: ImageIcon,
}

type Item = ArchiveItemView & { canDownload: boolean }

/**
 * The right panel of the Archive (`workspace/docs/archive.md`): the open
 * item played, swiped or shown (part 22), what it is and where it came from,
 * its captions per network with Write captions (part 36), where it has gone
 * out (part 41) and the drafts waiting for it (part 35). The ⋮ is its
 * details and actions, as on Travel's trip page.
 */
export function ArchiveItemPanel({
  itemId,
  canManage,
  projects,
  onChanged,
  onOpen,
}: {
  itemId: string | undefined
  canManage: boolean
  /** Every project, for Copy and Move. Empty for a guest. */
  projects: { id: string; name: string }[]
  /** The list behind should read again: the item changed, moved or left. */
  onChanged: () => void
  /** Opens another item, such as the copy just made. */
  onOpen: (itemId: string | undefined) => void
}) {
  const [item, setItem] = React.useState<Item | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [reloads, setReloads] = React.useState(0)

  React.useEffect(() => {
    if (!itemId) return
    let cancelled = false
    loadArchiveItem(itemId).then(
      (loaded) => {
        if (!cancelled) {
          setItem(loaded)
          setError(null)
        }
      },
      (failure: unknown) => {
        if (!cancelled) setError(getArchiveErrorMessage(failure))
      }
    )
    return () => {
      cancelled = true
    }
  }, [itemId, reloads])

  // Still copying from Video: ask again until it lands.
  React.useEffect(() => {
    if (item?.status !== "copying") return
    const timer = setTimeout(() => setReloads((count) => count + 1), 4_000)
    return () => clearTimeout(timer)
  }, [item])

  if (!itemId) {
    return (
      <>
        <DashboardCardTitleHeader icon={<FilmIcon className="size-4" />} title="Item" />
        <p className="p-4 text-center text-sm text-muted-foreground">Click a video, carousel or picture to play it and see where it went.</p>
      </>
    )
  }

  const shown = item && item.id === itemId ? item : null
  const Icon = shown ? KIND_ICONS[shown.kind] : FilmIcon
  return (
    <>
      <DashboardCardTitleHeader
        icon={<Icon className="size-4" />}
        title={shown?.title || (shown ? "Untitled" : "Opening…")}
        action={
          shown ? (
            <ItemMenu
              item={shown}
              canManage={canManage}
              projects={projects}
              onSaved={(patch) => setItem({ ...shown, ...patch })}
              onChanged={() => {
                setReloads((count) => count + 1)
                onChanged()
              }}
              onLeft={(next) => {
                onChanged()
                onOpen(next)
              }}
            />
          ) : null
        }
      />
      <ScrollArea className="min-h-0 flex-1">
        {error ? (
          <div className="p-3">
            <ErrorRow message={error} onRetry={() => setReloads((count) => count + 1)} />
          </div>
        ) : !shown ? (
          <div className="p-3">
            <LoadingRow label="Opening the item…" />
          </div>
        ) : (
          <div className="grid gap-3 p-3">
            <Preview item={shown} />
            <p className="text-sm text-muted-foreground">{facts(shown)}</p>
            {shown.deletedAt ? (
              <p className="text-sm text-muted-foreground">In the Bin since {formatDate(shown.deletedAt)}. It goes for good {BIN_DAYS} days after that.</p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              {shown.videoEditUrl ? (
                <Button asChild variant="outline" size="sm">
                  <a href={shown.videoEditUrl} target="_blank" rel="noreferrer">
                    <ExternalLinkIcon className="size-4" />
                    Edit in Video
                  </a>
                </Button>
              ) : null}
              {shown.canDownload && shown.fileUrl ? (
                <Button asChild variant="outline" size="sm">
                  <a href={shown.fileUrl} download target="_blank" rel="noreferrer">
                    <DownloadIcon className="size-4" />
                    Download
                  </a>
                </Button>
              ) : null}
              {shown.canDownload && shown.pdfUrl ? (
                <Button asChild variant="outline" size="sm">
                  <a href={shown.pdfUrl} download target="_blank" rel="noreferrer">
                    <DownloadIcon className="size-4" />
                    PDF
                  </a>
                </Button>
              ) : null}
            </div>
            {shown.caption ? (
              <PanelCard storageId="promo-archive-caption" title="Caption from Video">
                <p className="text-sm whitespace-pre-wrap">{shown.caption}</p>
              </PanelCard>
            ) : null}
            {shown.status === "ready" && !shown.deletedAt ? (
              <CaptionsCard item={shown} onSaved={(captions) => setItem({ ...shown, captions })} />
            ) : null}
            <PostedCard item={shown} />
          </div>
        )}
      </ScrollArea>
    </>
  )
}

/** "9:16 · 0:42 · 18 MB · from Launch (Video)". */
function facts(item: Item): string {
  const length =
    item.kind === "carousel"
      ? `${item.slideFiles.length} slides`
      : item.durationMs
        ? `${Math.floor(item.durationMs / 60_000)}:${String(Math.round(item.durationMs / 1000) % 60).padStart(2, "0")}`
        : ""
  return [
    item.aspect,
    length,
    formatFileSize(item.fileSize),
    item.language,
    item.source === "upload" ? "uploaded" : item.videoProjectName ? `from ${item.videoProjectName} in Video` : "from Video",
    item.hasSubtitles ? "has subtitles" : "",
  ]
    .filter(Boolean)
    .join(" · ")
}

/** The video played, the carousel swiped one slide at a time, or the picture shown (part 22). */
function Preview({ item }: { item: Item }) {
  const [slide, setSlide] = React.useState(0)
  if (item.status === "copying") {
    return (
      <div className="flex aspect-video items-center justify-center gap-2 rounded-md bg-muted text-sm text-muted-foreground">
        <Loader2Icon className="size-4 animate-spin" />
        Arriving from Video…
      </div>
    )
  }
  if (item.kind === "carousel") {
    const current = item.slideFiles[Math.min(slide, item.slideFiles.length - 1)]
    return (
      <div className="grid gap-2">
        <div className="flex aspect-square items-center justify-center overflow-hidden rounded-md bg-muted">
          {current?.kind === "video" ? (
            <video key={current.url} src={current.url} controls playsInline className="size-full object-contain" />
          ) : current ? (
            <img src={current.url} alt={`Slide ${slide + 1}`} className="size-full object-contain" />
          ) : null}
        </div>
        <div className="flex items-center justify-between">
          <Button type="button" variant="ghost" size="icon" aria-label="Previous slide" onClick={() => setSlide((at) => Math.max(0, at - 1))}>
            <ChevronLeftIcon className="size-4" />
          </Button>
          <span className="text-sm text-muted-foreground">
            Slide {slide + 1} of {item.slideFiles.length}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Next slide"
            onClick={() => setSlide((at) => Math.min(item.slideFiles.length - 1, at + 1))}
          >
            <ChevronRightIcon className="size-4" />
          </Button>
        </div>
      </div>
    )
  }
  if (item.kind === "video") {
    return <video key={item.fileUrl} src={item.fileUrl} poster={item.coverUrl || undefined} controls playsInline className="max-h-[60vh] w-full rounded-md bg-black" />
  }
  return <img src={item.fileUrl} alt={item.title} className="max-h-[60vh] w-full rounded-md bg-muted object-contain" />
}

/** Instagram and TikTok captions, written by Write captions in the accounts' voice, saving as they are edited (part 36). */
function CaptionsCard({ item, onSaved }: { item: Item; onSaved: (captions: Item["captions"]) => void }) {
  const [captions, setCaptions] = React.useState(item.captions)
  const [writing, setWriting] = React.useState(false)
  const timer = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  React.useEffect(() => () => clearTimeout(timer.current), [])

  function change(network: CaptionNetwork, value: string) {
    const next = { ...captions, [network]: value }
    setCaptions(next)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      saveArchiveItem({ itemId: item.id, captions: next }).then(
        () => onSaved(next),
        (failure: unknown) => showErrorToast(getArchiveErrorMessage(failure))
      )
    }, SAVE_DELAY_MS)
  }

  async function write() {
    setWriting(true)
    dismissErrorToast()
    try {
      const written = await writeArchiveCaptions(item.id)
      setCaptions(written.captions)
      onSaved(written.captions)
    } catch (failure) {
      showErrorToast(getArchiveErrorMessage(failure))
    } finally {
      setWriting(false)
    }
  }

  return (
    <PanelCard storageId="promo-archive-captions" title="Captions">
      <div className="grid gap-3">
        {CAPTION_NETWORKS.map((network) => {
          const words = captions[network] ?? ""
          const problem = words ? captionProblem(network, words) : null
          return (
            <div key={network} className="grid gap-1.5">
              <div className="flex items-baseline justify-between gap-2">
                <Label htmlFor={`archive-caption-${network}`}>{NETWORK_NAMES[network]}</Label>
                <span className="text-xs text-muted-foreground">
                  {words.length.toLocaleString()} of {CAPTION_MAX[network].toLocaleString()}
                </span>
              </div>
              <Textarea
                id={`archive-caption-${network}`}
                value={words}
                aria-invalid={problem ? true : undefined}
                placeholder={`Press Write captions, or type the ${NETWORK_NAMES[network]} caption.`}
                onChange={(event) => change(network, event.target.value)}
              />
              {problem ? <p className="text-sm text-destructive">{problem}</p> : null}
            </div>
          )
        })}
        <Button type="button" variant="outline" size="sm" className="justify-self-start" disabled={writing} onClick={() => void write()}>
          {writing ? <Loader2Icon className="size-4 animate-spin" /> : <SparklesIcon className="size-4" />}
          Write captions
        </Button>
        <p className="text-xs text-muted-foreground">One AI call for each network the project has an account on.</p>
      </div>
    </PanelCard>
  )
}

/** Where it went out, and the drafts waiting for it (parts 35 and 41). */
function PostedCard({ item }: { item: Item }) {
  return (
    <PanelCard storageId="promo-archive-posted" title="Posted" badge={item.posts.length ? item.posts.length : undefined}>
      {item.posts.length ? (
        <ul className="grid gap-1.5 text-sm">
          {item.posts.map((post, index) => (
            <li key={index} className="flex flex-wrap items-center gap-x-1.5">
              <span className="font-medium">{NETWORK_NAMES[post.network as Network] ?? post.network}</span>
              {post.handle ? <span className="text-muted-foreground">as {post.handle}</span> : null}
              <span className="text-muted-foreground">· {post.postedAt ? formatDate(post.postedAt) : post.status}</span>
              {post.views !== null ? <span className="text-muted-foreground">· {post.views.toLocaleString()} views</span> : null}
              {post.url ? (
                <a href={post.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline-offset-2 hover:underline">
                  Open
                  <ExternalLinkIcon className="size-3" />
                </a>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">Not posted yet.</p>
      )}
      {item.drafts.length ? (
        <p className="mt-2 text-sm text-muted-foreground">
          Draft waiting in {item.drafts.map((network) => NETWORK_NAMES[network as Network] ?? network).join(", ")}.
        </p>
      ) : null}
    </PanelCard>
  )
}

/** The item's ⋮: Name, Description and Project as folding rows, then Pin, and Delete last (Travel's activity menu). */
function ItemMenu({
  item,
  canManage,
  projects,
  onSaved,
  onChanged,
  onLeft,
}: {
  item: Item
  canManage: boolean
  projects: { id: string; name: string }[]
  onSaved: (patch: Partial<Item>) => void
  onChanged: () => void
  onLeft: (next: string | undefined) => void
}) {
  const [open, setOpen] = React.useState(false)
  const [shown, toggle] = useOpenSections<"name" | "description" | "project">()
  const [title, setTitle] = React.useState(item.title)
  const [description, setDescription] = React.useState(item.description)
  const [target, setTarget] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const [forGood, setForGood] = React.useState(false)
  const timer = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  React.useEffect(() => () => clearTimeout(timer.current), [])

  function saveLater(patch: { title?: string; description?: string }) {
    clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      saveArchiveItem({ itemId: item.id, ...patch }).then(
        () => {
          onSaved(patch)
          onChanged()
        },
        (failure: unknown) => showErrorToast(getArchiveErrorMessage(failure))
      )
    }, SAVE_DELAY_MS)
  }

  async function act(work: () => Promise<void>) {
    setBusy(true)
    dismissErrorToast()
    try {
      await work()
    } catch (failure) {
      showErrorToast(getArchiveErrorMessage(failure))
    } finally {
      setBusy(false)
    }
  }

  const others = projects.filter((project) => project.id !== item.projectId)

  if (!canManage) return null
  return (
    <>
      <FoldingMenu label="More for this item" busy={busy} open={open} onOpenChange={setOpen}>
        <MenuSection label="Name" value={title || "Untitled"} open={shown.has("name")} onToggle={() => toggle("name")}>
          <Input
            aria-label="Name"
            value={title}
            maxLength={200}
            onChange={(event) => {
              setTitle(event.target.value)
              saveLater({ title: event.target.value })
            }}
          />
        </MenuSection>
        <MenuSection label="Description" value={description ? "Written" : "None"} open={shown.has("description")} onToggle={() => toggle("description")}>
          <Textarea
            aria-label="Description"
            value={description}
            onChange={(event) => {
              setDescription(event.target.value)
              saveLater({ description: event.target.value })
            }}
          />
        </MenuSection>
        {others.length ? (
          <MenuSection label="Project" value="Copy or move" open={shown.has("project")} onToggle={() => toggle("project")}>
            <div className="grid gap-2">
              <Select value={target} onValueChange={setTarget}>
                <SelectTrigger aria-label="Project to copy or move to" className="w-full">
                  <SelectValue placeholder="Pick a project" />
                </SelectTrigger>
                <SelectContent>
                  {others.map((project) => (
                    <SelectItem key={project.id} value={project.id}>
                      {project.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex gap-2">
                {(["copy", "move"] as const).map((keep) => (
                  <Button
                    key={keep}
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={() =>
                      void act(async () => {
                        if (!target) {
                          showErrorToast("Pick a project first.")
                          return
                        }
                        await placeArchiveItem(item.id, target, keep)
                        setOpen(false)
                        // A moved item leaves this project's list; a copy leaves this one open.
                        onLeft(keep === "move" ? undefined : item.id)
                      })
                    }
                  >
                    {keep === "copy" ? <CopyIcon className="size-4" /> : null}
                    {keep === "copy" ? "Copy" : "Move"}
                  </Button>
                ))}
              </div>
            </div>
          </MenuSection>
        ) : null}
        <MenuLine />
        {item.deletedAt ? (
          <>
            <MenuAction
              icon={<RotateCcwIcon className="size-4" />}
              onClick={() =>
                void act(async () => {
                  await restoreArchiveItem(item.id)
                  setOpen(false)
                  onChanged()
                })
              }
            >
              Put back
            </MenuAction>
            <MenuAction
              icon={<Trash2Icon className="size-4" />}
              destructive
              onClick={() => {
                setOpen(false)
                setForGood(true)
              }}
            >
              Delete for good
            </MenuAction>
          </>
        ) : (
          <>
            <MenuAction
              icon={item.pinned ? <PinOffIcon className="size-4" /> : <PinIcon className="size-4" />}
              onClick={() =>
                void act(async () => {
                  await pinArchiveItem(item.id, !item.pinned)
                  setOpen(false)
                  onChanged()
                })
              }
            >
              {item.pinned ? "Take the pin off" : "Pin to the top"}
            </MenuAction>
            <MenuAction
              icon={<Trash2Icon className="size-4" />}
              destructive
              onClick={() =>
                void act(async () => {
                  await binArchiveItems([item.id])
                  setOpen(false)
                  // It goes to the Bin, where it can be put back, so it doesn't ask first.
                  onLeft(undefined)
                })
              }
            >
              Delete
            </MenuAction>
          </>
        )}
      </FoldingMenu>
      <ConfirmDialog
        open={forGood}
        onOpenChange={setForGood}
        title="Delete this for good?"
        description="Its files go from storage now, and it can't be put back. Posts already made stay on their networks."
        confirmLabel="Delete for good"
        loading={busy}
        onConfirm={() =>
          void act(async () => {
            await deleteArchiveItemForGood(item.id)
            setForGood(false)
            onLeft(undefined)
          })
        }
      />
    </>
  )
}
