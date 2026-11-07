import * as React from "react"
import { NodeViewContent, NodeViewWrapper, type NodeViewProps } from "@tiptap/react"
import {
  ChevronRightIcon,
  CircleCheckIcon,
  ExternalLinkIcon,
  InfoIcon,
  LinkIcon,
  Loader2Icon,
  PlayIcon,
  SettingsIcon,
  Trash2Icon,
  TriangleAlertIcon,
  XIcon,
  type LucideIcon,
} from "lucide-react"

import { GoogleMap } from "@/components/travel/google-map"
import { toggleFold, useFolded } from "@/components/travel/note-folds"
import { dayLabel } from "@/components/travel/new-activity"
import { NoteCardPicker } from "@/components/travel/note-card-picker"
import { typeOf, useTrip } from "@/components/travel/trip-context"
import { ActivityTypeIcon } from "@/components/travel/type-icon"
import { PhotoCreditLine, UnsplashPicker } from "@/components/travel/unsplash-picker"
import { ImageUpload } from "@/components/shared/image-upload"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { formatWhen } from "@/lib/travel/board"
import { DAY_COLORS } from "@/lib/travel/day-colors"
import { readLink } from "@/lib/api/travel/link-preview"
import { getTravelErrorMessage } from "@/lib/travel/errors"
import {
  LINK_LABEL_MAX,
  LINKS_BLOCK_MAX,
  linkWords,
  type CalloutKind,
  type NoteImageAttrs,
  type NoteLink,
  type NoteLinkAttrs,
  type NoteMapAttrs,
} from "@/lib/travel/note-blocks"
import type { PhotoCredit } from "@/lib/travel/rules"
import { readVideoLink, VIDEO_SITE_LABEL, videoLinkProblem } from "@/lib/travel/video-links"
import { showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"

/**
 * How each "/" block in a Travel note looks (Travel features 3, parts 1 to
 * 4). A block that isn't filled in yet shows how to fill it, only while the
 * note can be written in; it's never saved, so a read-only note never shows
 * one. Each block's bin shows while it's pointed at or focused.
 */

/** The bin on a block, shown while it's pointed at or focused, and only while the note can be written in. */
/** The bin in a block's top corner. `placed` when it already sits in a row of the block's buttons. */
function RemoveBlock({ label, onRemove, placed = false }: { label: string; onRemove: () => void; placed?: boolean }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="secondary"
          size="icon-sm"
          aria-label={label}
          className={placed ? undefined : "absolute top-2 right-2 opacity-0 group-hover/block:opacity-100 group-data-[selected]/block:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100"}
          onClick={onRemove}
        >
          <Trash2Icon className="size-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

/**
 * A selected block (clicked, ready for Backspace) is marked on its picture,
 * player, card or map only, following its rounded corners, not on a box drawn
 * round the whole block and its links (Tyler, 5 Nov 2026: "this ui outline
 * here is really ugly"). Its bin shows while it's selected.
 */
const SELECTED = "group-data-[selected]/block:ring-2 group-data-[selected]/block:ring-primary/30"

/** The buttons in a block's top corner: shown while it's pointed at, focused or selected, and always on a phone. */
const BLOCK_TOOLS =
  "absolute top-2 right-2 flex gap-1 opacity-0 group-hover/block:opacity-100 group-data-[selected]/block:opacity-100 focus-within:opacity-100 [@media(hover:none)]:opacity-100"

function BlockFrame({ selected, children }: { selected: boolean; children: React.ReactNode }) {
  return (
    <NodeViewWrapper
      data-selected={selected || undefined}
      // The note's own link style (primary, underlined) is for links in the writing, not a block's small print.
      className="group/block relative my-2 [&_a]:text-inherit! [&_a:hover]:text-foreground!"
    >
      {children}
    </NodeViewWrapper>
  )
}

export function ImageBlockView({ node, editor, selected, updateAttributes, deleteNode }: NodeViewProps) {
  const attrs = node.attrs as Partial<NoteImageAttrs>
  const editable = editor.isEditable
  const [broken, setBroken] = React.useState(false)
  const [address, setAddress] = React.useState("")
  const [invalid, setInvalid] = React.useState(false)
  const inputId = React.useId()

  function pick(src: string, credit: PhotoCredit | null, alt = "") {
    setBroken(false)
    updateAttributes({ src, alt, credit })
  }

  if (!attrs.src) {
    // A block with no picture yet is never saved, so a note that can't be written in never shows one.
    if (!editable) return <NodeViewWrapper />
    return (
      <BlockFrame selected={selected}>
        <div className={cn("grid gap-3 rounded-md border bg-muted/40 p-3 pr-12", SELECTED)}>
          <ImageUpload
            label="Picture"
            showLabel={false}
            value=""
            aspect="video"
            fit="cover"
            emptyLabel="Upload a picture"
            onChange={(url, altText) => {
              if (url) pick(url, null, altText ?? "")
            }}
          />
          <div>
            <UnsplashPicker startQuery="" onPick={(photo) => pick(photo.url, photo.credit)} />
          </div>
          <form
            className="grid gap-2"
            onSubmit={(event) => {
              event.preventDefault()
              const text = address.trim()
              let ok = false
              try {
                ok = new URL(text).protocol === "https:"
              } catch {
                ok = false
              }
              if (!ok) {
                setInvalid(true)
                showErrorToast("Paste a picture's address that starts with https://")
                return
              }
              setInvalid(false)
              pick(text, null)
            }}
          >
            <Label htmlFor={inputId}>Web address</Label>
            <div className="flex gap-2">
              <Input
                id={inputId}
                value={address}
                placeholder="https://…"
                aria-invalid={invalid || undefined}
                onChange={(event) => setAddress(event.target.value)}
              />
              <Button type="submit" variant="outline">
                Add
              </Button>
            </div>
          </form>
        </div>
        <RemoveBlock label="Remove image" onRemove={deleteNode} />
      </BlockFrame>
    )
  }

  return (
    <BlockFrame selected={selected}>
      <figure className="grid gap-1">
        {broken ? (
          <p className={cn("rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground", SELECTED)}>This picture no longer loads.</p>
        ) : (
          <img
            src={attrs.src}
            alt={attrs.alt ?? ""}
            loading="lazy"
            className={cn("max-h-96 w-full rounded-md border bg-muted object-contain", SELECTED)}
            onError={() => setBroken(true)}
          />
        )}
        {attrs.credit ? <PhotoCreditLine credit={attrs.credit} /> : null}
      </figure>
      {editable ? <RemoveBlock label="Remove image" onRemove={deleteNode} /> : null}
    </BlockFrame>
  )
}

export function PlaceBlockView({ node, editor, selected, deleteNode }: NodeViewProps) {
  const { page, typesById, openActivity } = useTrip()
  const card = page.activities.find((activity) => activity.id === node.attrs.activityId)
  const editable = editor.isEditable
  if (!card) {
    return (
      <BlockFrame selected={selected}>
        <p className={cn("rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground", SELECTED)}>Removed: this card is no longer on the trip.</p>
        {editable ? <RemoveBlock label="Remove place" onRemove={deleteNode} /> : null}
      </BlockFrame>
    )
  }
  const when = formatWhen(card)
  const where = card.day === null || card.day > page.trip.days ? "Ideas" : dayLabel(card.day, page.trip.startDate)
  return (
    <BlockFrame selected={selected}>
      <button
        type="button"
        className={cn("flex w-full min-w-0 items-center gap-3 rounded-md border bg-card p-2 pr-12 text-left hover:bg-accent focus-visible:bg-accent focus-visible:outline-none", SELECTED)}
        onClick={() => openActivity(card.id)}
      >
        {card.photoUrl ? (
          <img src={card.photoUrl} alt="" loading="lazy" className="size-12 shrink-0 rounded-md object-cover" />
        ) : (
          <span className="flex size-12 shrink-0 items-center justify-center rounded-md bg-muted">
            <ActivityTypeIcon type={typeOf(card, typesById)} />
          </span>
        )}
        <span className="grid min-w-0">
          <span className="truncate text-sm font-medium">{card.title}</span>
          <span className="truncate text-xs text-muted-foreground">{when ? `${where} · ${when}` : where}</span>
        </span>
      </button>
      {editable ? <RemoveBlock label="Remove place" onRemove={deleteNode} /> : null}
    </BlockFrame>
  )
}

export function VideoBlockView({ node, editor, selected, updateAttributes, deleteNode }: NodeViewProps) {
  const editable = editor.isEditable
  const video = typeof node.attrs.url === "string" ? readVideoLink(node.attrs.url) : null
  const [playing, setPlaying] = React.useState(false)
  const [link, setLink] = React.useState("")
  const [invalid, setInvalid] = React.useState(false)
  const inputId = React.useId()

  if (!video) {
    if (!editable) return <NodeViewWrapper />
    return (
      <BlockFrame selected={selected}>
        <form
          className={cn("grid gap-2 rounded-md border bg-muted/40 p-3 pr-12", SELECTED)}
          onSubmit={(event) => {
            event.preventDefault()
            const found = readVideoLink(link)
            if (!found) {
              setInvalid(true)
              showErrorToast(videoLinkProblem(link))
              return
            }
            updateAttributes({ url: found.url })
          }}
        >
          <Label htmlFor={inputId}>Video link</Label>
          <div className="flex gap-2">
            <Input
              id={inputId}
              value={link}
              placeholder="A YouTube, TikTok or Instagram link"
              aria-invalid={invalid || undefined}
              onChange={(event) => setLink(event.target.value)}
            />
            <Button type="submit" variant="outline">
              Add
            </Button>
          </div>
        </form>
        <RemoveBlock label="Remove video" onRemove={deleteNode} />
      </BlockFrame>
    )
  }

  const site = VIDEO_SITE_LABEL[video.site]
  // YouTube is wide; TikTok and Instagram are tall.
  const tall = video.site !== "youtube"
  const shape = cn("w-full", tall ? "aspect-[9/16]" : "aspect-video")
  return (
    <BlockFrame selected={selected}>
      {/* Sized to the video, so the buttons sit on its corner even when it's a tall one. */}
      <div className={cn("relative grid w-full", tall && "max-w-80")}>
        {playing ? (
          <iframe
            src={video.playerUrl}
            title={`${site} video`}
            className={cn(shape, "rounded-md border bg-muted", SELECTED)}
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
            sandbox="allow-scripts allow-same-origin allow-popups allow-presentation"
          />
        ) : (
          // The player only loads once the still is clicked, so a note full of videos opens fast.
          <button
            type="button"
            aria-label={`Play the ${site} video`}
            className={cn(
              shape,
              "relative flex items-center justify-center overflow-hidden rounded-md border bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
              SELECTED
            )}
            onClick={() => setPlaying(true)}
          >
            {video.stillUrl ? <img src={video.stillUrl} alt="" loading="lazy" className="absolute inset-0 size-full object-cover" /> : null}
            <span className="relative flex items-center gap-2 rounded-full bg-background/90 px-3 py-1.5 text-sm font-medium">
              <PlayIcon className="size-4" aria-hidden />
              {site}
            </span>
          </button>
        )}
        {/* Shown on hover, like the bin: a player that won't load still leaves the way to the video. */}
        <div className={BLOCK_TOOLS}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button asChild variant="secondary" size="icon-sm">
                <a href={video.url} target="_blank" rel="noopener noreferrer" aria-label={`Open on ${site}`}>
                  <ExternalLinkIcon className="size-4" />
                </a>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Open on {site}</TooltipContent>
          </Tooltip>
          {editable ? <RemoveBlock label="Remove video" onRemove={deleteNode} placed /> : null}
        </div>
      </div>
    </BlockFrame>
  )
}

export function MapBlockView({ node, editor, selected, updateAttributes, deleteNode }: NodeViewProps) {
  const { page, openActivity } = useTrip()
  const editable = editor.isEditable
  const [changing, setChanging] = React.useState(false)
  const ids = ((node.attrs as Partial<NoteMapAttrs>).activityIds ?? []) as string[]
  const byId = new Map(page.activities.map((activity) => [activity.id, activity]))
  const cards = ids.flatMap((id) => {
    const card = byId.get(id)
    return card && typeof card.place?.lat === "number" && typeof card.place?.lng === "number" ? [card] : []
  })
  const pins = cards.map((card, index) => ({
    id: card.id,
    lat: card.place!.lat!,
    lng: card.place!.lng!,
    label: String(index + 1),
    title: card.title,
    color: card.day === null ? "#6b7280" : DAY_COLORS[(card.day - 1) % DAY_COLORS.length],
  }))
  return (
    <BlockFrame selected={selected}>
      <div className="grid gap-1">
        {cards.length ? (
          <GoogleMap className={cn("h-64 rounded-lg", SELECTED)} pins={pins} onPick={openActivity} emptyText="None of these cards has a place on the map." />
        ) : (
          <p className={cn("rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground", SELECTED)}>The cards on this map were removed.</p>
        )}
        <p className="text-xs text-muted-foreground">
          {cards.map((card, index) => `${index + 1}. ${card.title}`).join(" · ")}
        </p>
      </div>
      {editable ? (
        <div className={BLOCK_TOOLS}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button type="button" variant="secondary" size="icon-sm" aria-label="Change the cards on the map" onClick={() => setChanging(true)}>
                <SettingsIcon className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Change the cards</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button type="button" variant="secondary" size="icon-sm" aria-label="Remove map" onClick={deleteNode}>
                <Trash2Icon className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Remove map</TooltipContent>
          </Tooltip>
        </div>
      ) : null}
      <NoteCardPicker
        open={changing}
        mode="map"
        picked={cards.map((card) => card.id)}
        onClose={() => setChanging(false)}
        onPick={(activityIds) => {
          setChanging(false)
          updateAttributes({ activityIds })
        }}
      />
    </BlockFrame>
  )
}

/**
 * A web page as a small card (Travel features 4, part 5; Tyler, 6 Nov 2026:
 * "Title, picture, site"). Pasting an address asks the server to read the
 * page once; the card keeps what it found and opens the page in a new tab.
 */
export function LinkBlockView({ node, editor, selected, updateAttributes, deleteNode }: NodeViewProps) {
  const editable = editor.isEditable
  const attrs = node.attrs as Partial<NoteLinkAttrs>
  const [link, setLink] = React.useState("")
  const [invalid, setInvalid] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [brokenImage, setBrokenImage] = React.useState(false)
  const inputId = React.useId()

  if (!attrs.url) {
    if (!editable) return <NodeViewWrapper />
    return (
      <BlockFrame selected={selected}>
        <form
          className={cn("grid gap-2 rounded-md border bg-muted/40 p-3 pr-12", SELECTED)}
          onSubmit={async (event) => {
            event.preventDefault()
            if (busy) return
            setBusy(true)
            try {
              const card = await readLink(link)
              if (!editor.isDestroyed) updateAttributes(card)
            } catch (error) {
              setInvalid(true)
              showErrorToast(getTravelErrorMessage(error))
            } finally {
              setBusy(false)
            }
          }}
        >
          <Label htmlFor={inputId}>Web address</Label>
          <div className="flex gap-2">
            <Input
              id={inputId}
              value={link}
              placeholder="example.com"
              aria-invalid={invalid || undefined}
              onChange={(event) => {
                setLink(event.target.value)
                setInvalid(false)
              }}
            />
            <Button type="submit" variant="outline" disabled={busy}>
              {busy ? <Loader2Icon className="size-4 animate-spin" aria-hidden /> : null}
              Add
            </Button>
          </div>
        </form>
        <RemoveBlock label="Remove link" onRemove={deleteNode} />
      </BlockFrame>
    )
  }

  return (
    <BlockFrame selected={selected}>
      <a
        href={attrs.url}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(
          "flex w-full min-w-0 items-center gap-3 rounded-md border bg-card p-2 pr-12 no-underline! hover:bg-accent focus-visible:bg-accent focus-visible:outline-none",
          SELECTED
        )}
      >
        {attrs.image && !brokenImage ? (
          <img src={attrs.image} alt="" loading="lazy" className="size-12 shrink-0 rounded-md object-cover" onError={() => setBrokenImage(true)} />
        ) : (
          <span className="flex size-12 shrink-0 items-center justify-center rounded-md bg-muted">
            <LinkIcon className="size-4 text-muted-foreground" aria-hidden />
          </span>
        )}
        <span className="grid min-w-0">
          <span className="truncate text-sm font-medium">{attrs.title || attrs.site}</span>
          <span className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
            <span className="truncate">{attrs.title ? attrs.site : attrs.url}</span>
            <ExternalLinkIcon className="size-3 shrink-0" aria-hidden />
          </span>
        </span>
      </a>
      {editable ? <RemoveBlock label="Remove link" onRemove={deleteNode} /> : null}
    </BlockFrame>
  )
}

/*
 * Checklist, Callout, Divider, Fold section and Links: Project's basic blocks,
 * copied from `apps/project/src/components/project/notes/note-block-drawings.tsx`
 * (Tyler, 6 Nov 2026: "travel is missing some basic blocks"). A Checklist is
 * the editor's own ticked list and a Divider its own line, so only these three
 * have views.
 */

const CALLOUTS: Record<CalloutKind, { label: string; icon: LucideIcon; box: string; mark: string }> = {
  note: { label: "Note", icon: InfoIcon, box: "bg-muted", mark: "text-muted-foreground" },
  warning: { label: "Warning", icon: TriangleAlertIcon, box: "bg-amber-500/15", mark: "text-amber-700 dark:text-amber-300" },
  decision: { label: "Decision", icon: CircleCheckIcon, box: "bg-green-600/10", mark: "text-green-700 dark:text-green-300" },
}

/**
 * Callout: a tinted box of words with its kind's icon, Note, Warning or
 * Decision. In the editor the icon opens the menu that changes the kind, and
 * the bin is the only button in the corner.
 */
export function CalloutBlockView({ node, editor, selected, updateAttributes, deleteNode }: NodeViewProps) {
  const kind = (node.attrs.kind as CalloutKind) ?? "note"
  const look = CALLOUTS[kind] ?? CALLOUTS.note
  const Icon = look.icon
  const editable = editor.isEditable
  return (
    <BlockFrame selected={selected}>
      <div className={cn("flex gap-2.5 rounded-md px-3 py-2.5", editable && "pr-11", look.box, SELECTED)}>
        {editable ? (
          <DropdownMenu>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    contentEditable={false}
                    aria-label={`${look.label}. Change the kind of callout`}
                    className="-m-1 mt-0 h-fit shrink-0 rounded-sm p-1 outline-none hover:bg-background/60 focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <Icon className={cn("size-4", look.mark)} aria-hidden />
                  </button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent>Note, Warning or Decision</TooltipContent>
            </Tooltip>
            <DropdownMenuContent align="start">
              {(Object.keys(CALLOUTS) as CalloutKind[]).map((each) => (
                <DropdownMenuCheckboxItem key={each} checked={each === kind} onCheckedChange={() => updateAttributes({ kind: each })}>
                  {CALLOUTS[each].label}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <Icon className={cn("mt-1 size-4 shrink-0", look.mark)} aria-label={look.label} />
        )}
        {/* The box's own words: its last paragraph's gap would make the box look bottom-heavy. */}
        <NodeViewContent className="min-w-0 flex-1 [&_ol]:mb-0! [&_p:last-child]:mb-0! [&_ul]:mb-0!" />
      </div>
      {editable ? <RemoveBlock label="Remove callout" onRemove={deleteNode} /> : null}
    </BlockFrame>
  )
}

/** Fold section: a heading line with an arrow that hides or shows what's under it, for this reader only. */
export function FoldBlockView({ node, editor, selected, deleteNode }: NodeViewProps) {
  const id = String(node.attrs.id)
  const folded = useFolded(id)
  const editable = editor.isEditable
  return (
    <BlockFrame selected={selected}>
      <div className={cn("flex items-start gap-1 rounded-md", editable && "pr-10", SELECTED)}>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          contentEditable={false}
          aria-expanded={!folded}
          aria-label={folded ? "Show what's under this heading" : "Hide what's under this heading"}
          className="mt-0.5 shrink-0"
          // Pressing the arrow must not move the cursor into the heading.
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => toggleFold(id)}
        >
          <ChevronRightIcon className={cn("size-4 transition-transform motion-reduce:transition-none", !folded && "rotate-90")} />
        </Button>
        <NodeViewContent className="min-w-0 flex-1 text-[1.1em] leading-snug font-semibold [&>*]:py-1" />
      </div>
      {editable ? (
        <div className={cn(BLOCK_TOOLS, "top-0.5")}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button type="button" variant="secondary" size="icon-sm" aria-label="Remove fold section" onClick={deleteNode}>
                <Trash2Icon className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Remove fold section</TooltipContent>
          </Tooltip>
        </div>
      ) : null}
    </BlockFrame>
  )
}

/**
 * Links: labelled web addresses, one a line, each opening in a new tab. In
 * the editor the cog opens the block's own add and remove controls; an empty
 * block opens with them. A block with no links is never saved.
 */
export function LinksBlockView({ node, editor, selected, updateAttributes, deleteNode }: NodeViewProps) {
  const links = (Array.isArray(node.attrs.links) ? node.attrs.links : []) as NoteLink[]
  const editable = editor.isEditable
  const [changing, setChanging] = React.useState(false)
  const [words, setWords] = React.useState("")
  const [address, setAddress] = React.useState("")
  const [invalid, setInvalid] = React.useState(false)
  const wordsId = React.useId()
  const addressId = React.useId()
  const open = editable && (changing || links.length === 0)
  if (!links.length && !editable) return <NodeViewWrapper />

  function add(event: React.FormEvent) {
    event.preventDefault()
    event.stopPropagation()
    let url: string | null = null
    try {
      const parsed = new URL(address.trim())
      url = parsed.protocol === "https:" && parsed.href.length <= 1000 ? parsed.href : null
    } catch {
      url = null
    }
    if (!url) {
      setInvalid(true)
      showErrorToast("Paste an address that starts with https://")
      return
    }
    if (links.length >= LINKS_BLOCK_MAX) {
      showErrorToast(`A Links block holds up to ${LINKS_BLOCK_MAX} links. Start another for the rest.`)
      return
    }
    setInvalid(false)
    setWords("")
    setAddress("")
    updateAttributes({ links: [...links, { label: words.trim().slice(0, LINK_LABEL_MAX), url }] })
  }

  return (
    <BlockFrame selected={selected}>
      <div className={cn("grid gap-3 rounded-md", open && "border bg-muted/40 p-3", editable && "pr-12", SELECTED)}>
        {links.length ? (
          <ul className="m-0! grid list-none! gap-1.5 pl-0!" aria-label="Links">
            {links.map((link, index) => (
              <li key={`${index}-${link.url}`} className="m-0! flex min-w-0 items-center gap-2 text-sm">
                <LinkIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <a href={link.url} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 truncate no-underline! hover:underline!">
                  {linkWords(link)}
                </a>
                {open ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    aria-label={`Remove ${linkWords(link)}`}
                    onClick={() => updateAttributes({ links: links.filter((_, at) => at !== index) })}
                  >
                    <XIcon className="size-3.5" />
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
        {open ? (
          <form className="grid gap-2" onSubmit={add}>
            <div className="grid gap-2">
              <Label htmlFor={wordsId}>Words to show</Label>
              <Input id={wordsId} value={words} maxLength={LINK_LABEL_MAX} placeholder="Ryokan booking" onChange={(event) => setWords(event.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor={addressId}>Web address</Label>
              <div className="flex gap-2">
                <Input
                  id={addressId}
                  value={address}
                  placeholder="https://…"
                  aria-invalid={invalid || undefined}
                  onChange={(event) => setAddress(event.target.value)}
                />
                <Button type="submit" variant="outline">
                  Add
                </Button>
              </div>
            </div>
            {links.length ? (
              <div>
                <Button type="button" variant="ghost" size="sm" onClick={() => setChanging(false)}>
                  Done
                </Button>
              </div>
            ) : null}
          </form>
        ) : null}
      </div>
      {editable ? (
        <div className={BLOCK_TOOLS}>
          {links.length && !changing ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button type="button" variant="secondary" size="icon-sm" aria-label="Change the links" onClick={() => setChanging(true)}>
                  <SettingsIcon className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Change the links</TooltipContent>
            </Tooltip>
          ) : null}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button type="button" variant="secondary" size="icon-sm" aria-label="Remove links" onClick={deleteNode}>
                <Trash2Icon className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Remove links</TooltipContent>
          </Tooltip>
        </div>
      ) : null}
    </BlockFrame>
  )
}
