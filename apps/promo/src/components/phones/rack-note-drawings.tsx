import * as React from "react"
import {
  ChevronRightIcon,
  CircleCheckIcon,
  ExternalLinkIcon,
  InfoIcon,
  LinkIcon,
  PlayIcon,
  SettingsIcon,
  Trash2Icon,
  TriangleAlertIcon,
  XIcon,
  type LucideIcon,
} from "lucide-react"

import { toggleFold, useFolded } from "@/components/phones/rack-note-folds"
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
import {
  httpsAddress,
  LINK_LABEL_MAX,
  LINKS_BLOCK_MAX,
  linkWords,
  type CalloutKind,
  type NoteImageAttrs,
  type NoteLink,
} from "@/lib/phones/rack-notes"
import { readVideoLink, VIDEO_SITE_LABEL, videoLinkProblem } from "@/lib/phones/video-links"
import { showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"

/**
 * How each "/" block in a rack's notes looks (Racks dashboard, part 90),
 * copied from Project's (`apps/project/src/components/project/notes/note-block-drawings.tsx`)
 * and trimmed to the blocks a rack has: Image, Video, Links, Callout and Fold
 * section. A picture is uploaded to the media library or pasted as a web
 * address. A block that isn't filled in yet shows how to fill it; it's never
 * saved. Every block sits inside a `group/block` frame, whose
 * `data-selected` marks it chosen.
 */

/** A selected block (clicked, ready for Backspace) is marked on its picture, card or box only. */
export const SELECTED = "group-data-[selected]/block:ring-2 group-data-[selected]/block:ring-primary/30"

/** The buttons in a block's top corner: shown while it's pointed at, focused or selected, and always on a phone. */
const BLOCK_TOOLS =
  "absolute right-2 flex gap-1 opacity-0 group-hover/block:opacity-100 group-data-[selected]/block:opacity-100 focus-within:opacity-100 [@media(hover:none)]:opacity-100"

/** The frame every block sits in. The notes' own link style is for their writing, not a block's small print. */
export const BLOCK_FRAME = "group/block relative my-2 [&_a]:text-inherit! [&_a]:no-underline! [&_a:hover]:text-foreground!"

/** Whether the notes can be written in, and how to remove the block, from the editor. */
export type BlockEditing = { editable: boolean; remove: () => void }

function ToolButton({ label, icon: Icon, onClick }: { label: string; icon: LucideIcon; onClick: () => void }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button type="button" variant="secondary" size="icon-sm" aria-label={label} onClick={onClick}>
          <Icon className="size-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

/** The block's buttons, inside its top-right corner: the bin, and any of its own. */
function BlockTools({
  editing,
  label,
  top = "top-2",
  children,
}: {
  editing: BlockEditing
  label: string
  top?: string
  children?: React.ReactNode
}) {
  if (!editing.editable && !children) return null
  return (
    <div className={cn(BLOCK_TOOLS, top)}>
      {children}
      {editing.editable ? <ToolButton label={label} icon={Trash2Icon} onClick={editing.remove} /> : null}
    </div>
  )
}

/** A web address field with Add, for an Image or Video block not filled in yet. */
function AddressForm({
  label,
  placeholder,
  check,
  onAdd,
}: {
  label: string
  placeholder: string
  /** The address to keep, or the sentence saying why it can't be used. */
  check: (text: string) => { url: string } | { problem: string }
  onAdd: (url: string) => void
}) {
  const [text, setText] = React.useState("")
  const [invalid, setInvalid] = React.useState(false)
  const inputId = React.useId()
  return (
    <form
      className="grid gap-2"
      onSubmit={(event) => {
        event.preventDefault()
        const result = check(text)
        if ("problem" in result) {
          setInvalid(true)
          showErrorToast(result.problem)
          return
        }
        setInvalid(false)
        onAdd(result.url)
      }}
    >
      <Label htmlFor={inputId}>{label}</Label>
      <div className="flex gap-2">
        <Input id={inputId} value={text} placeholder={placeholder} aria-invalid={invalid || undefined} onChange={(event) => setText(event.target.value)} />
        <Button type="submit" variant="outline">
          Add
        </Button>
      </div>
    </form>
  )
}

const checkPictureAddress = (text: string) => {
  const url = httpsAddress(text, 1000)
  return url ? { url } : { problem: "Paste a picture's address that starts with https://" }
}

/** Image: a picture uploaded to the media library, or a pasted web address. */
export function ImageDrawing({
  attrs,
  editing,
  onPick,
}: {
  attrs: Partial<NoteImageAttrs>
  editing: BlockEditing
  onPick: (attrs: NoteImageAttrs) => void
}) {
  const [broken, setBroken] = React.useState(false)
  const src = attrs.src

  function pick(next: { src: string; alt?: string }) {
    setBroken(false)
    onPick({ src: next.src, alt: next.alt ?? "" })
  }

  if (!src) {
    if (!editing.editable) return null
    return (
      <>
        <div className={cn("grid gap-3 rounded-md border bg-muted/40 p-3 pr-12", SELECTED)}>
          <ImageUpload label="Picture" showLabel={false} value="" aspect="video" fit="contain" emptyLabel="Upload or pick a picture" onChange={(url) => (url ? pick({ src: url }) : undefined)} />
          <AddressForm label="Web address" placeholder="https://…" check={checkPictureAddress} onAdd={(url) => pick({ src: url })} />
        </div>
        <BlockTools editing={editing} label="Remove image" />
      </>
    )
  }

  return (
    <>
      <figure className="grid gap-1">
        {broken ? (
          <p className={cn("rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground", SELECTED)}>This picture no longer loads.</p>
        ) : (
          <img
            src={src}
            alt={attrs.alt ?? ""}
            loading="lazy"
            className={cn("max-h-96 w-full rounded-md border bg-muted object-contain", SELECTED)}
            onError={() => setBroken(true)}
          />
        )}
      </figure>
      <BlockTools editing={editing} label="Remove image" />
    </>
  )
}

const checkVideoLink = (text: string) => {
  const found = readVideoLink(text)
  return found ? { url: found.url } : { problem: videoLinkProblem(text) }
}

/** Video: a still with a Play button; the player loads only when it's pressed, so notes full of videos open fast. */
export function VideoDrawing({ url, editing, onSet }: { url: string | null; editing: BlockEditing; onSet: (url: string) => void }) {
  const video = url ? readVideoLink(url) : null
  const [playing, setPlaying] = React.useState(false)

  if (!video) {
    if (!editing.editable) return null
    return (
      <>
        <div className={cn("rounded-md border bg-muted/40 p-3 pr-12", SELECTED)}>
          <AddressForm label="Video link" placeholder="A YouTube, TikTok, Instagram or Loom link" check={checkVideoLink} onAdd={onSet} />
        </div>
        <BlockTools editing={editing} label="Remove video" />
      </>
    )
  }

  const site = VIDEO_SITE_LABEL[video.site]
  // YouTube and Loom are wide; TikTok and Instagram are tall.
  const tall = video.site === "tiktok" || video.site === "instagram"
  const shape = cn("w-full", tall ? "aspect-[9/16]" : "aspect-video")
  return (
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
      <BlockTools editing={editing} label="Remove video">
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
      </BlockTools>
    </div>
  )
}

/**
 * Links: labelled web addresses, one a line, each opening in a new tab. In
 * the editor the cog opens the block's own add and remove controls; an empty
 * block opens with them.
 */
export function LinksDrawing({ links, editing, onChange }: { links: NoteLink[]; editing: BlockEditing; onChange: (links: NoteLink[]) => void }) {
  const [changing, setChanging] = React.useState(false)
  const [words, setWords] = React.useState("")
  const [address, setAddress] = React.useState("")
  const [invalid, setInvalid] = React.useState(false)
  const wordsId = React.useId()
  const addressId = React.useId()
  const open = editing.editable && (changing || links.length === 0)
  if (!links.length && !editing.editable) return null

  function add(event: React.FormEvent) {
    event.preventDefault()
    const url = httpsAddress(address, 2000)
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
    onChange([...links, { label: words.trim().slice(0, LINK_LABEL_MAX), url }])
  }

  return (
    <>
      <div className={cn("grid gap-3 rounded-md", open && "border bg-muted/40 p-3", editing.editable && "pr-12", SELECTED)}>
        {links.length ? (
          <ul className="grid gap-1.5" aria-label="Links">
            {links.map((link, index) => (
              <li key={`${index}-${link.url}`} className="flex min-w-0 items-center gap-2 text-sm">
                <LinkIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <a href={link.url} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 truncate hover:underline!">
                  {linkWords(link)}
                </a>
                {open ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    aria-label={`Remove ${linkWords(link)}`}
                    onClick={() => onChange(links.filter((_, at) => at !== index))}
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
              <Input id={wordsId} value={words} maxLength={LINK_LABEL_MAX} placeholder="Router admin" onChange={(event) => setWords(event.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor={addressId}>Web address</Label>
              <div className="flex gap-2">
                <Input id={addressId} value={address} placeholder="https://…" aria-invalid={invalid || undefined} onChange={(event) => setAddress(event.target.value)} />
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
      <BlockTools editing={editing} label="Remove links">
        {editing.editable && links.length && !changing ? <ToolButton label="Change the links" icon={SettingsIcon} onClick={() => setChanging(true)} /> : null}
      </BlockTools>
    </>
  )
}

const CALLOUTS: Record<CalloutKind, { label: string; icon: LucideIcon; box: string; mark: string }> = {
  note: { label: "Note", icon: InfoIcon, box: "bg-muted", mark: "text-muted-foreground" },
  warning: { label: "Warning", icon: TriangleAlertIcon, box: "bg-amber-500/15", mark: "text-amber-700 dark:text-amber-300" },
  decision: { label: "Decision", icon: CircleCheckIcon, box: "bg-green-600/10", mark: "text-green-700 dark:text-green-300" },
}

/** Callout: a tinted box of words with its kind's icon, which opens the menu that changes the kind. */
export function CalloutFrame({
  kind,
  editing,
  onKind,
  children,
}: {
  kind: CalloutKind
  editing: BlockEditing
  onKind?: (kind: CalloutKind) => void
  children: React.ReactNode
}) {
  const look = CALLOUTS[kind] ?? CALLOUTS.note
  const Icon = look.icon
  return (
    <>
      <div className={cn("flex gap-2.5 rounded-md px-3 py-2.5", editing.editable && "pr-11", look.box, SELECTED)}>
        {editing.editable ? (
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
                <DropdownMenuCheckboxItem key={each} checked={each === kind} onCheckedChange={() => onKind?.(each)}>
                  {CALLOUTS[each].label}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <Icon className={cn("mt-1 size-4 shrink-0", look.mark)} aria-label={look.label} />
        )}
        <div className="min-w-0 flex-1 [&_ol]:mb-0! [&_p:last-child]:mb-0! [&_ul]:mb-0!">{children}</div>
      </div>
      <BlockTools editing={editing} label="Remove callout" />
    </>
  )
}

/** Fold section: a heading line with an arrow that hides or shows what's under it, for this reader only. */
export function FoldHeading({ id, editing, children }: { id: string; editing: BlockEditing; children: React.ReactNode }) {
  const folded = useFolded(id)
  return (
    <>
      <div className={cn("flex items-start gap-1 rounded-md", editing.editable && "pr-10", SELECTED)}>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-expanded={!folded}
          aria-label={folded ? "Show what's under this heading" : "Hide what's under this heading"}
          className="mt-0.5 shrink-0"
          // Pressing the arrow must not move the cursor into the heading.
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => toggleFold(id)}
        >
          <ChevronRightIcon className={cn("size-4 transition-transform motion-reduce:transition-none", !folded && "rotate-90")} />
        </Button>
        <div className="min-w-0 flex-1 text-[1.1em] leading-snug font-semibold [&>*]:py-1">{children}</div>
      </div>
      <BlockTools editing={editing} label="Remove fold section" top="top-0.5" />
    </>
  )
}
