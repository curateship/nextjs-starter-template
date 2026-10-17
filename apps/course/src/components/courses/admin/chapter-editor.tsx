import * as React from "react"
import Image from "@tiptap/extension-image"
import Placeholder from "@tiptap/extension-placeholder"
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react"
import { TextSelection } from "@tiptap/pm/state"
import StarterKit from "@tiptap/starter-kit"
import {
  BoldIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ClipboardCopyIcon,
  FilmIcon,
  Heading2Icon,
  Heading3Icon,
  ImageIcon,
  ItalicIcon,
  LightbulbIcon,
  LinkIcon,
  ListChecksIcon,
  ListIcon,
  ListOrderedIcon,
  PlusIcon,
  SquareCheckBigIcon,
  StrikethroughIcon,
  Table2Icon,
  TextQuoteIcon,
  TriangleAlertIcon,
} from "lucide-react"

import {
  COURSE_NODE_EXTENSIONS,
  newItemId,
  newQuizQuestion,
} from "@/components/courses/admin/chapter-editor-nodes"
import { MediaPicker } from "@/components/media/media-picker"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { FieldLabel } from "@/components/ui/field-label"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import {
  cleanChapterBody,
  youtubeIdFrom,
  type ChapterBody,
} from "@/lib/courses/chapter-body"
import type { ChapterLinkChoice } from "@/lib/courses/course-types"
import { isSafeWrittenPageLink } from "@/lib/pages/written-page-body"
import { showErrorToast } from "@/lib/toast/error-toast"

/**
 * The chapter editor. It is Tiptap, the same editor the shell's pages use,
 * with the course blocks added: pictures and video from the media library,
 * Tip and Watch out boxes, prompts with a Copy button, tables, fold-outs,
 * checklists and quizzes.
 *
 * It is a courses editor of its own rather than the shell's `DocumentEditor`,
 * because that one takes no extra blocks and editing it in an app would fork
 * a shell file (Tyler chose this on 17 Oct 2026). What it saves goes through
 * `cleanChapterBody` on the way out, the same cleaner the server uses, so the
 * editor can only ever hold what a chapter may store.
 */
export function ChapterEditor({
  value,
  onChange,
  linkChoices,
}: {
  value: ChapterBody
  onChange: (body: ChapterBody) => void
  linkChoices: ChapterLinkChoice[]
}) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3, 4] },
        link: { openOnClick: false },
        // Pictures, video and boxes are blocks of their own; the rule line
        // and inline code have no place in a chapter.
        horizontalRule: false,
        code: false,
      }),
      Image.configure({ inline: false }),
      Placeholder.configure({
        placeholder: "Write the chapter. Use Add a block for pictures, video, tips and more.",
      }),
      ...COURSE_NODE_EXTENSIONS,
    ],
    content: value,
    onUpdate: ({ editor: current }) => {
      onChange(cleanChapterBody(current.getJSON()))
    },
  })

  return (
    <div className="flex min-h-0 flex-1 flex-col rounded-md border bg-background">
      <style>{`
        .chapter-rte .tiptap { min-height: 360px; padding: 16px 18px; font-size: 1rem; line-height: 1.7; outline: none; }
        .chapter-rte .tiptap > * + * { margin-top: 0.75em; }
        .chapter-rte .tiptap h2 { font-size: 1.4em; font-weight: 700; margin-top: 1em; }
        .chapter-rte .tiptap h3 { font-size: 1.2em; font-weight: 700; margin-top: 0.9em; }
        .chapter-rte .tiptap h4 { font-size: 1.05em; font-weight: 700; }
        .chapter-rte .tiptap ul { list-style: disc; padding-left: 1.4em; }
        .chapter-rte .tiptap ol { list-style: decimal; padding-left: 1.4em; }
        .chapter-rte .tiptap blockquote { border-left: 3px solid var(--border); padding-left: 0.9em; color: var(--muted-foreground); }
        .chapter-rte .tiptap a { color: var(--primary); text-decoration: underline; }
        .chapter-rte .tiptap pre { background: var(--muted); border-radius: 8px; padding: 12px 14px; font-family: var(--font-mono, ui-monospace, monospace); font-size: 0.875rem; white-space: pre-wrap; }
        .chapter-rte .tiptap pre::before { content: "Prompt (readers get a Copy button)"; display: block; font-family: inherit; font-size: 0.7rem; text-transform: uppercase; color: var(--muted-foreground); margin-bottom: 6px; }
        .chapter-rte .tiptap img { max-width: 100%; border-radius: 8px; border: 1px solid var(--border); }
        .chapter-rte .tiptap img.ProseMirror-selectednode { outline: 2px solid var(--ring); }
        .chapter-rte .tiptap p.is-editor-empty:first-child::before { content: attr(data-placeholder); color: var(--muted-foreground); float: left; height: 0; pointer-events: none; }
      `}</style>
      {editor ? <ChapterToolbar editor={editor} linkChoices={linkChoices} /> : null}
      <div className="chapter-rte min-h-0 flex-1">
        <EditorContent editor={editor} />
      </div>
    </div>
  )
}

function ToolButton({
  label,
  active,
  onClick,
  children,
}: {
  label: string
  active?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant={active ? "secondary" : "ghost"}
          size="icon-sm"
          aria-label={label}
          aria-pressed={active}
          // Keeps the text selection while the button is pressed, so the
          // change lands on what was selected.
          onMouseDown={(event) => event.preventDefault()}
          onClick={onClick}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

function ChapterToolbar({
  editor,
  linkChoices,
}: {
  editor: Editor
  linkChoices: ChapterLinkChoice[]
}) {
  const state = useEditorState({
    editor,
    selector: ({ editor: current }) => ({
      h2: current.isActive("heading", { level: 2 }),
      h3: current.isActive("heading", { level: 3 }),
      bold: current.isActive("bold"),
      italic: current.isActive("italic"),
      strike: current.isActive("strike"),
      bullet: current.isActive("bulletList"),
      ordered: current.isActive("orderedList"),
      quote: current.isActive("blockquote"),
      link: current.isActive("link"),
      href: (current.getAttributes("link").href as string | undefined) ?? "",
    }),
  })
  const [picker, setPicker] = React.useState<"image" | "video" | null>(null)
  const [videoOpen, setVideoOpen] = React.useState(false)

  const chain = () => editor.chain().focus()
  /**
   * Puts a block under the line the cursor is on, with an empty line after
   * it, and moves the cursor to where the writing goes next: inside a box
   * that holds words, or onto the empty line after one that does not.
   */
  const insert = (content: Record<string, unknown>, writeInside = false) => {
    const { $from, to } = editor.state.selection
    const at = $from.depth > 0 ? $from.after(1) : to
    editor
      .chain()
      .insertContentAt(at, [content, { type: "paragraph" }])
      .command(({ tr }) => {
        const block = tr.doc.nodeAt(at)
        // Inside: the first place to type within the block, which `near`
        // finds whether that is the block itself (a prompt) or its first
        // line (a Tip box). After: the empty line below the block.
        const cursor = writeInside ? at + 1 : at + (block?.nodeSize ?? 1) + 1
        tr.setSelection(TextSelection.near(tr.doc.resolve(cursor)))
        return true
      })
      .focus()
      .run()
  }

  return (
    <div className="sticky top-0 z-10 flex flex-wrap items-center gap-0.5 border-b bg-background px-2 py-1">
      <ToolButton label="Heading" active={state?.h2} onClick={() => chain().toggleHeading({ level: 2 }).run()}>
        <Heading2Icon className="size-4" />
      </ToolButton>
      <ToolButton label="Smaller heading" active={state?.h3} onClick={() => chain().toggleHeading({ level: 3 }).run()}>
        <Heading3Icon className="size-4" />
      </ToolButton>
      <Divider />
      <ToolButton label="Bold" active={state?.bold} onClick={() => chain().toggleBold().run()}>
        <BoldIcon className="size-4" />
      </ToolButton>
      <ToolButton label="Italic" active={state?.italic} onClick={() => chain().toggleItalic().run()}>
        <ItalicIcon className="size-4" />
      </ToolButton>
      <ToolButton label="Strikethrough" active={state?.strike} onClick={() => chain().toggleStrike().run()}>
        <StrikethroughIcon className="size-4" />
      </ToolButton>
      <LinkPopover editor={editor} active={state?.link} href={state?.href ?? ""} linkChoices={linkChoices} />
      <Divider />
      <ToolButton label="Bullet list" active={state?.bullet} onClick={() => chain().toggleBulletList().run()}>
        <ListIcon className="size-4" />
      </ToolButton>
      <ToolButton label="Numbered list" active={state?.ordered} onClick={() => chain().toggleOrderedList().run()}>
        <ListOrderedIcon className="size-4" />
      </ToolButton>
      <ToolButton label="Quote" active={state?.quote} onClick={() => chain().toggleBlockquote().run()}>
        <TextQuoteIcon className="size-4" />
      </ToolButton>
      <Divider />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="outline" size="sm" onMouseDown={(event) => event.preventDefault()}>
            <PlusIcon className="size-4" />
            Add a block
            <ChevronDownIcon className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          // Wider than the button that opens it, so every name fits on one
          // line with its hint under it.
          className="w-72"
          // The menu would hand focus back to its own button as it shuts,
          // which takes the typing away from the block just added.
          onCloseAutoFocus={(event) => event.preventDefault()}
        >
          <BlockMenuItem icon={ImageIcon} label="Picture" hint="From the media library" onSelect={() => setPicker("image")} />
          <BlockMenuItem icon={FilmIcon} label="Video" hint="A YouTube link or an uploaded video" onSelect={() => setVideoOpen(true)} />
          <BlockMenuItem
            icon={LightbulbIcon}
            label="Tip box"
            hint="A helpful aside, in the site's colour"
            onSelect={() =>
              insert(
                { type: "callout", attrs: { tone: "tip" }, content: [{ type: "paragraph" }] },
                true
              )
            }
          />
          <BlockMenuItem
            icon={TriangleAlertIcon}
            label="Watch out box"
            hint="A warning readers should not miss"
            onSelect={() =>
              insert(
                { type: "callout", attrs: { tone: "warning" }, content: [{ type: "paragraph" }] },
                true
              )
            }
          />
          <BlockMenuItem
            icon={ClipboardCopyIcon}
            label="Prompt"
            hint="Text readers copy with one press"
            onSelect={() => insert({ type: "codeBlock" }, true)}
          />
          <BlockMenuItem
            icon={Table2Icon}
            label="Table"
            hint="Rows and columns of words"
            onSelect={() =>
              insert({
                type: "simpleTable",
                attrs: {
                  header: true,
                  rows: [
                    ["", ""],
                    ["", ""],
                  ],
                },
              })
            }
          />
          <BlockMenuItem
            icon={ChevronRightIcon}
            label="Fold-out"
            hint="Extra detail readers open if they want it"
            onSelect={() =>
              insert(
                { type: "foldout", attrs: { summary: "" }, content: [{ type: "paragraph" }] },
                true
              )
            }
          />
          <BlockMenuItem
            icon={ListChecksIcon}
            label="Checklist"
            hint="Steps each reader ticks off"
            onSelect={() =>
              insert({ type: "checklist", attrs: { items: [{ id: newItemId(), text: "" }] } })
            }
          />
          <BlockMenuItem
            icon={SquareCheckBigIcon}
            label="Quiz"
            hint="Questions with one right answer"
            onSelect={() => insert({ type: "quiz", attrs: { questions: [newQuizQuestion()] } })}
          />
        </DropdownMenuContent>
      </DropdownMenu>

      <MediaPicker
        open={picker !== null}
        onOpenChange={(open) => {
          if (!open) setPicker(null)
        }}
        showVideos={picker === "video"}
        onSelectMedia={(url, altText) => {
          const kind = picker
          setPicker(null)
          if (kind === "video") {
            insert({ type: "video", attrs: { source: "file", src: url } })
            return
          }
          insert({ type: "image", attrs: { src: url, alt: altText ?? "" } })
        }}
      />
      <VideoDialog
        open={videoOpen}
        onClose={() => setVideoOpen(false)}
        onYouTube={(id) => {
          setVideoOpen(false)
          insert({ type: "video", attrs: { source: "youtube", src: id } })
        }}
        onLibrary={() => {
          setVideoOpen(false)
          setPicker("video")
        }}
      />
    </div>
  )
}

/** One row of the Add a block menu: the block's name, and a line on what it is for. */
function BlockMenuItem({
  icon: Icon,
  label,
  hint,
  onSelect,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  hint: string
  onSelect: () => void
}) {
  return (
    <DropdownMenuItem onSelect={onSelect} className="items-start gap-3 py-2">
      <Icon className="mt-0.5 size-4 shrink-0" />
      <span className="grid gap-0.5">
        <span className="text-sm font-medium whitespace-nowrap">{label}</span>
        <span className="text-xs text-muted-foreground">{hint}</span>
      </span>
    </DropdownMenuItem>
  )
}

function Divider() {
  return <div className="mx-1 h-5 w-px bg-border" />
}

/** The stable address a chapter link points at. See `/courses/to/$chapterId`. */
function chapterLinkHref(chapterId: string) {
  return `/courses/to/${chapterId}`
}

function LinkPopover({
  editor,
  active,
  href,
  linkChoices,
}: {
  editor: Editor
  active?: boolean
  href: string
  linkChoices: ChapterLinkChoice[]
}) {
  const [open, setOpen] = React.useState(false)
  const [url, setUrl] = React.useState("")
  const [invalid, setInvalid] = React.useState(false)
  const linkedChapter = href.startsWith("/courses/to/") ? href.slice("/courses/to/".length) : ""

  const apply = (next: string) => {
    if (!isSafeWrittenPageLink(next)) {
      setInvalid(true)
      showErrorToast("A link starts with https://, mailto:, tel: or /.")
      return
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: next }).run()
    setOpen(false)
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) {
          setUrl(linkedChapter ? "" : href)
          setInvalid(false)
        }
      }}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant={active ? "secondary" : "ghost"}
              size="icon-sm"
              aria-label="Link"
              onMouseDown={(event) => event.preventDefault()}
            >
              <LinkIcon className="size-4" />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>Link</TooltipContent>
      </Tooltip>
      <PopoverContent className="w-80 p-3" align="start">
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="chapter-link-url">Web address</Label>
            <Input
              id="chapter-link-url"
              value={url}
              aria-invalid={invalid || undefined}
              placeholder="https://example.com"
              onChange={(event) => {
                setUrl(event.target.value)
                setInvalid(false)
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" && url.trim()) {
                  event.preventDefault()
                  apply(url.trim())
                }
              }}
            />
          </div>
          {linkChoices.length ? (
            <div className="grid gap-2">
              <Label htmlFor="chapter-link-pick">Or link to a chapter</Label>
              <Select value={linkedChapter} onValueChange={(id) => apply(chapterLinkHref(id))}>
                <SelectTrigger id="chapter-link-pick" className="w-full">
                  <SelectValue placeholder="Pick a chapter" />
                </SelectTrigger>
                <SelectContent>
                  {linkChoices.map((choice) => (
                    <SelectItem key={choice.chapterId} value={choice.chapterId}>
                      {choice.courseTitle}: {choice.chapterTitle}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                A chapter link keeps working when that chapter is renamed or moved.
              </p>
            </div>
          ) : null}
          <div className="flex justify-end gap-2">
            {active ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  editor.chain().focus().extendMarkRange("link").unsetLink().run()
                  setOpen(false)
                }}
              >
                Remove link
              </Button>
            ) : null}
            <Button
              type="button"
              size="sm"
              onClick={() => {
                if (!url.trim()) {
                  showErrorToast("Type a web address, or pick a chapter.")
                  return
                }
                apply(url.trim())
              }}
            >
              Set link
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}

function VideoDialog({
  open,
  onClose,
  onYouTube,
  onLibrary,
}: {
  open: boolean
  onClose: () => void
  onYouTube: (id: string) => void
  onLibrary: () => void
}) {
  const [link, setLink] = React.useState("")
  const [invalid, setInvalid] = React.useState(false)

  function addYouTube() {
    const id = youtubeIdFrom(link)
    if (!id) {
      setInvalid(true)
      showErrorToast("That isn't a YouTube link. Copy the address from the video's page.")
      return
    }
    setLink("")
    onYouTube(id)
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent variant="admin">
        <DialogHeader>
          <DialogTitle>Add a video</DialogTitle>
          <DialogDescription>
            Paste a YouTube link, or pick a video you uploaded to the media library.
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={(event) => {
            event.preventDefault()
            addYouTube()
          }}
        >
          <DialogBody>
            <div className="grid gap-2">
              <FieldLabel htmlFor="chapter-video-link">YouTube link</FieldLabel>
              <Input
                id="chapter-video-link"
                value={link}
                aria-invalid={invalid || undefined}
                placeholder="https://www.youtube.com/watch?v=…"
                onChange={(event) => {
                  setLink(event.target.value)
                  setInvalid(false)
                }}
              />
            </div>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onLibrary} className="mr-auto">
              Pick from the media library
            </Button>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit">Add video</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
