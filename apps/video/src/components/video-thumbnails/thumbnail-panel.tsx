import * as React from "react"
import {
  CheckIcon,
  CopyIcon,
  DownloadIcon,
  ImageIcon,
  LanguagesIcon,
  LightbulbIcon,
  Loader2Icon,
  PlusIcon,
  StarIcon,
  Trash2Icon,
  WandSparklesIcon,
} from "lucide-react"
import {
  toast,
} from "sonner"

import {
  InspectorCard,
} from "@/components/broadcasts/inspector-fields"
import {
  DashboardCardTitleHeader,
} from "@/components/shared/dashboard-card-header"
import {
  Button,
} from "@/components/ui/button"
import {
  ConfirmDialog,
} from "@/components/ui/confirm-dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

import {
  LoadingRow,
} from "@/components/ui/loading-row"
import {
  ScrollArea,
} from "@/components/ui/scroll-area"

import {
  Hint,
} from "@/components/video-assets/hint"
import {
  useEditorRuntime,
  useEditorSelector,
} from "@/components/video-editor/editor-store"
import {
  FittedPreview,
} from "@/components/video-thumbnails/thumbnail-layer"
import {
  AddLayers,
} from "@/components/video-thumbnails/thumbnail-add-layers"
import {
  ThumbnailMenu,
} from "@/components/video-thumbnails/thumbnail-menu"
import {
  useThumbnails,
} from "@/components/video-thumbnails/thumbnail-store"
import {
  aiUnitCostCents,
} from "@/lib/ai/ai-models"

import {
  loadAiToolsAvailability,
} from "@/lib/api/video/ai-tools"
import {
  askForIdeas,
  listLanguageCopies,
  makeThumbnailIdea,
  translateThumbnailTo,
  writeTitles,
} from "@/lib/api/video/thumbnail-ai"
import {
  downloadThumbnailJpeg,
  pickThumbnailTitle,
  removeThumbnail,
  starThumbnail,
} from "@/lib/api/video/thumbnails"
import {
  writerCostCents,
  withEstimate,
} from "@/lib/video/ai-estimates"
import type { WriterId } from "@/lib/video/ai-choices"

import {
  formatCents,
} from "@/lib/video/project-spend"
import {
  ideasCostCents,
  type ThumbnailIdea,
} from "@/lib/video/thumbnail-ai"
import {
  formatClock,
} from "@/lib/video/timeline-utils"
import {
  THUMBNAIL_SHAPE_LABELS,
  type ThumbnailShape,
} from "@/lib/video/thumbnails"

import {
  cn,
} from "@/lib/utils"

/**
 * The Thumbnail section in the editor's rail (thumbnails.md): the open
 * video's thumbnails, the AI that makes them, its title and check, and the
 * site's templates. The board itself is in the middle of the editor and the
 * picked layer's settings are on the right.
 */
export function ThumbnailPanel() {
  const { list, open, saving } = useThumbnails()
  return (
    <div className="flex h-full min-h-0 flex-col">
      <DashboardCardTitleHeader
        icon={<ImageIcon className="size-4" />}
        title="Thumbnail"
        meta={open ? (saving === "saving" ? "Saving…" : saving === "error" ? "Not saved" : undefined) : undefined}
        action={
          <div className="flex items-center gap-1">
            <NewThumbnailMenu />
            <ThumbnailMenu />
          </div>
        }
      />
      <ScrollArea className="min-h-0 flex-1">
        <div className="grid gap-3 p-3">
          <Versions />
          {list ? (
            <>
              <IdeasCard />
              {open ? (
                <>
                  <AddLayers />
                  <TitlesCard />
                  <LanguagesCard />
                  <DownloadCard />
                </>
              ) : null}
            </>
          ) : null}
        </div>
      </ScrollArea>
    </div>
  )
}

/** "+" in the header: a new thumbnail from the frame, a blank one, or a template. */
function NewThumbnailMenu() {
  const { create, templates, busy, list } = useThumbnails()
  return (
    <DropdownMenu>
      <Hint label="New thumbnail">
        <DropdownMenuTrigger asChild>
          <Button type="button" size="icon-sm" variant="ghost" aria-label="New thumbnail" disabled={!list || busy !== null}>
            <PlusIcon />
          </Button>
        </DropdownMenuTrigger>
      </Hint>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>From the frame under the playhead</DropdownMenuLabel>
        {(["wide", "tall"] as const).map((shape) => (
          <DropdownMenuItem key={shape} onSelect={() => void create({ shape })}>
            {THUMBNAIL_SHAPE_LABELS[shape]}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Blank</DropdownMenuLabel>
        {(["wide", "tall"] as const).map((shape) => (
          <DropdownMenuItem key={shape} onSelect={() => void create({ shape, blank: true })}>
            {THUMBNAIL_SHAPE_LABELS[shape]}
          </DropdownMenuItem>
        ))}
        {templates.length ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>From a template</DropdownMenuLabel>
            {templates.map((template) => (
              <DropdownMenuItem
                key={template.id}
                onSelect={() => void create({ shape: template.shape, templateId: template.id })}
              >
                {template.name}
                <span className="ml-auto text-xs text-muted-foreground">
                  {template.shape === "wide" ? "Wide" : "Tall"}
                </span>
              </DropdownMenuItem>
            ))}
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** Every thumbnail made for this video, newest first, with its star (part 7). */
function Versions() {
  const { store } = useEditorRuntime()
  const { list, loadError, open, openThumbnail, replaceRow, removeRow, run } = useThumbnails()
  const [deleting, setDeleting] = React.useState<string | null>(null)
  if (loadError) return <p className="text-sm text-muted-foreground">{loadError}</p>
  if (!list) return <LoadingRow label="Loading the thumbnails" />
  if (!list.length) {
    return (
      <p className="text-sm text-muted-foreground">
        No thumbnail yet. The + above makes one from the frame under the playhead.
      </p>
    )
  }
  return (
    <InspectorCard title="Versions" description="The starred one is the video's picture and its export cover.">
      <ul className="grid grid-cols-2 gap-2">
        {list.map((row) => (
          <li key={row.id} className="group relative">
            <button
              type="button"
              onClick={() => openThumbnail(row.id)}
              aria-label={`Open the thumbnail made ${new Date(row.created_at).toLocaleString()}`}
              aria-current={row.id === open?.id || undefined}
              className={cn(
                "block w-full overflow-hidden rounded-md border",
                row.id === open?.id ? "ring-2 ring-ring" : "hover:opacity-90"
              )}
            >
              <FittedPreview
                design={{ shape: row.shape, backgroundColor: row.background_color, layers: row.layers }}
                filterKey={`version-${row.id}`}
              />
            </button>
            <div className="absolute top-1 right-1 flex gap-1">
              <Hint label={row.is_main ? "Take the star off" : "Make it the main one"}>
                <Button
                  type="button"
                  size="icon-xs"
                  variant="secondary"
                  aria-label={row.is_main ? "Take the star off" : "Make it the main one"}
                  aria-pressed={row.is_main}
                  onClick={() =>
                    void run(row.is_main ? "Taking the star off…" : "Making it the main one…", async () => {
                      replaceRow(await starThumbnail(row.id, !row.is_main))
                      // The main one's picture comes and goes on the media shelf.
                      store.refreshMediaShelf()
                    })
                  }
                >
                  <StarIcon className={cn(row.is_main && "fill-current")} />
                </Button>
              </Hint>
              <Hint label="Delete">
                <Button
                  type="button"
                  size="icon-xs"
                  variant="secondary"
                  aria-label="Delete this thumbnail"
                  onClick={() => setDeleting(row.id)}
                >
                  <Trash2Icon />
                </Button>
              </Hint>
            </div>
          </li>
        ))}
      </ul>
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(next) => !next && setDeleting(null)}
        title="Delete this thumbnail?"
        description="It goes for good. A starred one takes its picture out of the media library too."
        confirmLabel="Delete"
        destructive
        onConfirm={async () => {
          const id = deleting
          if (!id) return
          setDeleting(null)
          await run("Deleting…", async () => {
            await removeThumbnail(id)
            removeRow(id)
          })
        }}
      />
    </InspectorCard>
  )
}

/** Ideas from the whole video, and making one (part 16). */
function IdeasCard() {
  const { videoId } = useEditorRuntime()
  const { run, busy, tries, model, addVersion, open } = useThumbnails()
  const [ideas, setIdeas] = React.useState<ThumbnailIdea[] | null>(null)
  const endMs = useEditorSelector((state) =>
    state.tracks
      .flatMap((track) => track.clips)
      .reduce((end, clip) => Math.max(end, clip.startMs + clip.durationMs), 0)
  )
  const frames = Math.min(60, Math.ceil(endMs / 5_000) + 1)
  const shape: ThumbnailShape = open?.shape ?? "wide"
  return (
    <InspectorCard title="Ideas from the video" description="Reads the script, the transcript and a frame every 5 seconds.">
      <Button
        type="button"
        variant="outline"
        disabled={busy !== null}
        onClick={() =>
          void run("Reading the video…", async () => {
            setIdeas(await askForIdeas(videoId))
          })
        }
      >
        <LightbulbIcon />
        {withEstimate(ideas ? "Three more ideas" : "Three ideas", ideasCostCents(frames, 8_000))}
      </Button>
      {ideas?.map((idea, index) => (
        <div key={index} className="grid gap-1.5 rounded-md border bg-background p-2">
          <p className="text-sm font-semibold">{idea.words}</p>
          <p className="text-xs text-muted-foreground">
            At {formatClock(idea.atMs)} · {idea.expression} · {idea.background}
          </p>
          <Button
            type="button"
            size="sm"
            disabled={busy !== null}
            onClick={() =>
              void run(`Making ${tries} ${tries === 1 ? "version" : "versions"}…`, async () => {
                const rows = await makeThumbnailIdea({ videoId, shape, idea, model, tries })
                for (const row of rows.reverse()) addVersion(row)
                toast.success(`${rows.length} new ${rows.length === 1 ? "version" : "versions"} on the left.`)
              })
            }
          >
            <WandSparklesIcon />
            Make it · {formatCents(aiUnitCostCents(model, tries))}
          </Button>
        </div>
      ))}
    </InspectorCard>
  )
}

function useWriter() {
  const [writer, setWriter] = React.useState<WriterId | null>(null)
  React.useEffect(() => {
    let live = true
    loadAiToolsAvailability()
      .then((answer) => live && setWriter(answer.writer as WriterId | null))
      // A guest is not told the owner's AI choices, so the button has no price.
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [])
  return writer
}

/** Five titles that go with the thumbnail without repeating it (part 20). */
function TitlesCard() {
  const { open, run, busy, replaceRow } = useThumbnails()
  const writer = useWriter()
  const [titles, setTitles] = React.useState<string[] | null>(null)
  if (!open) return null
  return (
    <InspectorCard title="Title" description={open.title ? `Picked: ${open.title}` : "Titles that add to the thumbnail, never repeat it."}>
      <Button
        type="button"
        variant="outline"
        disabled={busy !== null}
        onClick={() =>
          void run("Writing titles…", async () => {
            setTitles(await writeTitles(open.id))
          })
        }
      >
        <WandSparklesIcon />
        {withEstimate("Write five titles", writer ? writerCostCents(writer, 3_500, 900) : null)}
      </Button>
      {titles?.length === 0 ? (
        <p className="text-sm text-muted-foreground">Every title it wrote repeated the thumbnail. Try again.</p>
      ) : null}
      {titles?.map((title) => (
        <div key={title} className="flex items-start gap-1 rounded-md border bg-background p-2">
          <p className="min-w-0 flex-1 text-sm">{title}</p>
          <Hint label="Copy">
            <Button
              type="button"
              size="icon-xs"
              variant="ghost"
              aria-label={`Copy "${title}"`}
              onClick={() => void navigator.clipboard.writeText(title).then(() => toast.success("Copied."))}
            >
              <CopyIcon />
            </Button>
          </Hint>
          <Hint label="Use this title">
            <Button
              type="button"
              size="icon-xs"
              variant={open.title === title ? "secondary" : "ghost"}
              aria-label={`Use "${title}"`}
              onClick={() =>
                void run("Saving the title…", async () => {
                  replaceRow(await pickThumbnailTitle(open.id, title))
                })
              }
            >
              <CheckIcon />
            </Button>
          </Hint>
        </div>
      ))}
    </InspectorCard>
  )
}

/** A button per language copy of the video (part 24). */
function LanguagesCard() {
  const { videoId } = useEditorRuntime()
  const { open, run, busy, list } = useThumbnails()
  const writer = useWriter()
  const [copies, setCopies] = React.useState<{ id: string; language: string | null }[]>([])
  React.useEffect(() => {
    let live = true
    listLanguageCopies(videoId)
      .then((rows) => live && setCopies(rows))
      .catch(() => live && setCopies([]))
    return () => {
      live = false
    }
  }, [videoId])
  const main = list?.find((row) => row.is_main && row.shape === open?.shape) ?? open
  if (!copies.length || !main) return null
  return (
    <InspectorCard title="Other languages" description="Copies the main thumbnail onto the language copy with its words translated.">
      {copies.map((copy) => (
        <Button
          key={copy.id}
          type="button"
          variant="outline"
          disabled={busy !== null}
          onClick={() =>
            void run(`Translating into ${copy.language}…`, async () => {
              await translateThumbnailTo(main.id, copy.id)
              toast.success(`Made. Open the ${copy.language} copy to see it.`)
            })
          }
        >
          <LanguagesIcon />
          {withEstimate(`Make it in ${copy.language ?? "the copy's language"}`, writer ? writerCostCents(writer, 1_200, 600) : null)}
        </Button>
      ))}
    </InspectorCard>
  )
}

/** The YouTube-ready JPEG (part 14). */
function DownloadCard() {
  const { open, run, busy } = useThumbnails()
  if (!open) return null
  return (
    <Button
      type="button"
      disabled={busy !== null}
      onClick={() =>
        void run("Drawing the download…", async () => {
          const file = await downloadThumbnailJpeg(open.id)
          const link = document.createElement("a")
          link.href = file.data_url
          link.download = file.file_name
          link.click()
          toast.success(`Downloaded, ${(file.bytes / 1024).toFixed(0)} KB.`)
        })
      }
    >
      {busy === "Drawing the download…" ? <Loader2Icon className="animate-spin" /> : <DownloadIcon />}
      Download for YouTube
    </Button>
  )
}
