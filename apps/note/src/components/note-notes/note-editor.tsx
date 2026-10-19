import * as React from "react"
import type { Editor, JSONContent, Range } from "@tiptap/core"
import Placeholder from "@tiptap/extension-placeholder"
import {
  EditorContent,
  NodeViewContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  useEditor,
  useEditorState,
  type NodeViewProps,
} from "@tiptap/react"
import { BubbleMenu } from "@tiptap/react/menus"
import {
  BetweenHorizontalStartIcon,
  BetweenVerticalStartIcon,
  BoldIcon,
  CodeIcon,
  FileTextIcon,
  Heading1Icon,
  Heading2Icon,
  Heading3Icon,
  HighlighterIcon,
  ImageIcon,
  InfoIcon,
  ItalicIcon,
  LinkIcon,
  ListChecksIcon,
  ListCollapseIcon,
  ListIcon,
  ListOrderedIcon,
  Loader2Icon,
  MinusIcon,
  PaletteIcon,
  PilcrowIcon,
  StrikethroughIcon,
  TableIcon,
  TableRowsSplitIcon,
  TextQuoteIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react"

import { createSuggestionMenu, type MenuItem } from "@/components/note-notes/suggestion-menu"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { getMediaErrorMessage, uploadMedia } from "@/lib/api/media/media"
import { findNoteTitles } from "@/lib/api/note/notes"
import { getMediaUploadError, IMAGE_MIME_TYPES } from "@/lib/media/media-upload"
import { Callout, NoteLink, noteBodyExtensions } from "@/lib/note/notes/body"
import {
  CALLOUT_CLASS,
  CALLOUT_TONE_LABELS,
  CALLOUT_TONES,
  HIGHLIGHT_CLASS,
  HIGHLIGHT_COLOURS,
  isOneOf,
  SWATCH_CLASS,
  TEXT_COLOUR_CLASS,
  TEXT_COLOURS,
  type CalloutTone,
} from "@/lib/note/notes/colours"
import { noteTitle, type LinkedNoteState } from "@/lib/note/notes/notes"
import { focusRing } from "@/lib/layout/focus-ring"
import { showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"

/**
 * The note editor. Built on Tiptap straight, not on the shell's
 * `DocumentEditor`, because that one cleans everything down to what a
 * written page may hold and checklists, tables, toggles, images and note
 * links would be thrown away (`rich-text-editor.tsx:620-647`). The toolbar
 * and the bubble menu are copied from that file; the file itself is never
 * edited.
 *
 * What it may hold is `noteBodyExtensions` in `lib/note/notes/body.ts`, the
 * same list the server checks every save against. This file only adds what
 * is drawn: the callout's tone picker, the link to another note, the "/"
 * and "[[" menus, the placeholder and picture uploads.
 */

type LinkTitles = Record<string, { title: string; state: LinkedNoteState }>

const NoteLinkContext = React.createContext<{ titles: LinkTitles; open: (id: string) => void }>({
  titles: {},
  open: () => undefined,
})

/** A link to another note, showing its title as it is now. */
function NoteLinkView({ node }: NodeViewProps) {
  const { titles, open } = React.useContext(NoteLinkContext)
  const id = String(node.attrs.id ?? "")
  const known = titles[id]
  const gone = known?.state === "gone"
  const title = gone ? "Deleted note" : noteTitle(known?.title || String(node.attrs.label ?? ""))
  return (
    <NodeViewWrapper as="span" className="inline">
      <button
        type="button"
        contentEditable={false}
        data-note-link={id}
        disabled={gone}
        onClick={() => open(id)}
        className={cn(
          "inline-flex items-baseline gap-1 rounded-sm px-0.5 font-medium text-primary underline decoration-primary/40 underline-offset-2 hover:decoration-primary disabled:cursor-default disabled:text-muted-foreground disabled:no-underline",
          known?.state === "trash" && "line-through",
          focusRing
        )}
      >
        <FileTextIcon aria-hidden className="size-3.5 self-center" />
        {title}
      </button>
    </NodeViewWrapper>
  )
}

/** A callout box with its tone picker in the corner. */
function CalloutView({ node, updateAttributes, editor }: NodeViewProps) {
  const tone: CalloutTone = isOneOf(CALLOUT_TONES, node.attrs.tone) ? node.attrs.tone : "grey"
  return (
    <NodeViewWrapper data-callout="" className={cn("my-2 flex gap-2 rounded-md border px-3 py-2", CALLOUT_CLASS[tone])}>
      {editor.isEditable ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              contentEditable={false}
              aria-label={`Callout colour: ${CALLOUT_TONE_LABELS[tone]}`}
              className={cn("mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md hover:bg-background/60", focusRing)}
            >
              <InfoIcon className="size-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {CALLOUT_TONES.map((each) => (
              <DropdownMenuItem key={each} onSelect={() => updateAttributes({ tone: each })}>
                <span className={cn("size-3 rounded-full border", CALLOUT_CLASS[each])} />
                {CALLOUT_TONE_LABELS[each]}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <InfoIcon aria-hidden className="mt-1 size-4 shrink-0" />
      )}
      <NodeViewContent className="min-w-0 flex-1 [&>*:last-child]:mb-0" />
    </NodeViewWrapper>
  )
}

const DrawnCallout = Callout.extend({ addNodeView: () => ReactNodeViewRenderer(CalloutView) })
const DrawnNoteLink = NoteLink.extend({ addNodeView: () => ReactNodeViewRenderer(NoteLinkView) })

type SlashItem = MenuItem & { keywords: string; run: (editor: Editor) => void }

function slashItems(pickImage: () => void): SlashItem[] {
  return [
    { id: "text", title: "Text", icon: <PilcrowIcon />, keywords: "paragraph plain", run: (e) => e.chain().focus().setParagraph().run() },
    { id: "h1", title: "Heading 1", icon: <Heading1Icon />, keywords: "title big", run: (e) => e.chain().focus().setHeading({ level: 1 }).run() },
    { id: "h2", title: "Heading 2", icon: <Heading2Icon />, keywords: "subtitle", run: (e) => e.chain().focus().setHeading({ level: 2 }).run() },
    { id: "h3", title: "Heading 3", icon: <Heading3Icon />, keywords: "small", run: (e) => e.chain().focus().setHeading({ level: 3 }).run() },
    { id: "bullets", title: "Bulleted list", icon: <ListIcon />, keywords: "unordered points", run: (e) => e.chain().focus().toggleBulletList().run() },
    { id: "numbers", title: "Numbered list", icon: <ListOrderedIcon />, keywords: "ordered steps", run: (e) => e.chain().focus().toggleOrderedList().run() },
    { id: "checklist", title: "Checklist", icon: <ListChecksIcon />, keywords: "todo tasks tick", run: (e) => e.chain().focus().toggleTaskList().run() },
    { id: "toggle", title: "Toggle", icon: <ListCollapseIcon />, keywords: "fold details collapse", run: (e) => e.chain().focus().setDetails().run() },
    { id: "callout", title: "Callout", hint: "A box for a tip or a warning", icon: <InfoIcon />, keywords: "tip warning note box", run: (e) => e.chain().focus().wrapIn("callout", { tone: "blue" }).run() },
    { id: "quote", title: "Quote", icon: <TextQuoteIcon />, keywords: "blockquote", run: (e) => e.chain().focus().toggleBlockquote().run() },
    { id: "code", title: "Code", icon: <CodeIcon />, keywords: "pre monospace", run: (e) => e.chain().focus().toggleCodeBlock().run() },
    { id: "divider", title: "Divider", icon: <MinusIcon />, keywords: "line rule hr", run: (e) => e.chain().focus().setHorizontalRule().run() },
    { id: "table", title: "Table", icon: <TableIcon />, keywords: "grid rows columns", run: (e) => e.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run() },
    { id: "image", title: "Image", hint: "Upload a picture", icon: <ImageIcon />, keywords: "picture photo upload", run: () => pickImage() },
    { id: "link", title: "Link to a note", hint: "Or type [[", icon: <FileTextIcon />, keywords: "note page reference", run: (e) => e.chain().focus().insertContent("[[").run() },
  ]
}

const IMAGE_ACCEPT = IMAGE_MIME_TYPES.join(",")

/**
 * What the note editor holds and does: the blocks a note may hold, drawn,
 * plus the placeholder and the "/" and "[[" menus. The "/" menu's Image
 * opens the editor's own hidden file picker, found by its id.
 */
function editorExtensions(noteId: string, fileInputId: string) {
  return [
    ...noteBodyExtensions({ callout: DrawnCallout, noteLink: DrawnNoteLink }),
    Placeholder.configure({ placeholder: "Write, or type / for blocks" }),
    createSuggestionMenu<SlashItem>({
      name: "noteSlashMenu",
      char: "/",
      label: "Blocks",
      emptyText: "No block by that name",
      items: (query) => {
        const words = query.toLowerCase()
        return slashItems(() => document.getElementById(fileInputId)?.click()).filter((item) =>
          `${item.title} ${item.keywords}`.toLowerCase().includes(words)
        )
      },
      pick: (editor, range, item) => {
        editor.chain().focus().deleteRange(range).run()
        item.run(editor)
      },
    }),
    createSuggestionMenu<MenuItem>({
      name: "noteLinkMenu",
      char: "[[",
      label: "Notes",
      emptyText: "No note by that title",
      debounce: 150,
      items: async (query) => {
        try {
          const found = await findNoteTitles(query, noteId)
          return found.map((note) => ({
            id: note.id,
            title: noteTitle(note.title),
            hint: note.folderName ?? "Loose note",
          }))
        } catch {
          return []
        }
      },
      pick: (editor: Editor, range: Range, item: MenuItem) => {
        editor
          .chain()
          .focus()
          .deleteRange(range)
          .insertContent([{ type: "noteLink", attrs: { id: item.id, label: item.title } }, { type: "text", text: " " }])
          .run()
      },
    }),
  ]
}

export type NoteEditorHandle = {
  /** Scrolls the nth heading into view, for the outline. */
  scrollToHeading: (index: number) => void
}

export const NoteEditor = React.forwardRef<
  NoteEditorHandle,
  {
    noteId: string
    initial: JSONContent
    editable: boolean
    linkTitles: LinkTitles
    onChange?: (body: JSONContent) => void
    onOpenNote?: (id: string) => void
  }
>(function NoteEditor({ noteId, initial, editable, linkTitles, onChange, onOpenNote }, ref) {
  const fileInputId = React.useId()
  const [uploading, setUploading] = React.useState<string[]>([])
  const changed = React.useRef(onChange)
  React.useEffect(() => {
    changed.current = onChange
  })
  // The editor keeps the handlers it was built with, so they reach the
  // upload through this ref, which always holds the newest one.
  const upload = React.useRef<(file: File, at: number | null) => Promise<void>>(async () => undefined)

  // Built once per editor, so the extension list never changes under it.
  const [extensions] = React.useState(() => editorExtensions(noteId, fileInputId))

  const editor = useEditor({
    immediatelyRender: false,
    extensions,
    content: initial,
    editable,
    editorProps: {
      handlePaste: (_view, event) => {
        const files = imageFiles(event.clipboardData?.files)
        if (!files.length) return false
        event.preventDefault()
        files.forEach((file) => void upload.current(file, null))
        return true
      },
      handleDrop: (view, event, _slice, moved) => {
        if (moved) return false
        const files = imageFiles(event.dataTransfer?.files)
        if (!files.length) return false
        event.preventDefault()
        const at = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos ?? null
        files.forEach((file) => void upload.current(file, at))
        return true
      },
    },
    onUpdate: ({ editor: current }) => changed.current?.(current.getJSON()),
  })

  /**
   * Uploads a picture to the media library and puts it where it was dropped,
   * or at the cursor. Nothing goes into the note until the picture is stored,
   * so a failed upload leaves no broken picture behind, only the reason.
   */
  async function uploadInto(file: File, at: number | null) {
    const refusal = getMediaUploadError(file, false)
    if (refusal) {
      showErrorToast(refusal)
      return
    }
    const key = `${file.name}-${crypto.randomUUID()}`
    setUploading((current) => [...current, key])
    try {
      const media = await uploadMedia(file, file.name.replace(/\.[^.]+$/, ""))
      if (!editor || editor.isDestroyed) return
      const image = { type: "image", attrs: { src: media.url, alt: media.alt_text ?? "" } }
      const end = editor.state.doc.content.size
      if (at === null) editor.chain().focus().insertContent(image).run()
      else editor.chain().focus().insertContentAt(Math.min(at, end), image).run()
    } catch (error) {
      showErrorToast(getMediaErrorMessage(error))
    } finally {
      setUploading((current) => current.filter((each) => each !== key))
    }
  }
  React.useEffect(() => {
    upload.current = uploadInto
  })

  React.useImperativeHandle(
    ref,
    () => ({
      scrollToHeading(index) {
        const heading = editor?.view.dom.querySelectorAll("h1, h2, h3")[index]
        heading?.scrollIntoView({ block: "start", behavior: "smooth" })
      },
    }),
    [editor]
  )

  React.useEffect(() => {
    editor?.setEditable(editable)
  }, [editor, editable])

  const links = React.useMemo(
    () => ({ titles: linkTitles, open: (id: string) => onOpenNote?.(id) }),
    [linkTitles, onOpenNote]
  )

  return (
    <NoteLinkContext.Provider value={links}>
      <div className="note-rte grid min-w-0">
        <style>{NOTE_EDITOR_STYLES}</style>
        {editor && editable ? <Toolbar editor={editor} onImage={() => document.getElementById(fileInputId)?.click()} /> : null}
        {editor && editable ? <TableBar editor={editor} /> : null}
        {editor && editable ? <SelectionMenu editor={editor} /> : null}
        {uploading.length ? (
          <p className="flex items-center gap-2 px-1 py-1 text-xs text-muted-foreground" role="status">
            <Loader2Icon className="size-3.5 animate-spin" />
            Uploading {uploading.length === 1 ? "a picture" : `${uploading.length} pictures`}…
          </p>
        ) : null}
        <EditorContent editor={editor} />
        <input
          id={fileInputId}
          type="file"
          accept={IMAGE_ACCEPT}
          multiple
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(event) => {
            const files = imageFiles(event.target.files)
            event.target.value = ""
            files.forEach((file) => void upload.current(file, null))
          }}
        />
      </div>
    </NoteLinkContext.Provider>
  )
})

function imageFiles(list: FileList | null | undefined) {
  return Array.from(list ?? []).filter((file) => file.type.startsWith("image/"))
}

function ToolbarButton({
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
          // Keeps the selection alive while the button is pressed, so the
          // change lands on what was selected rather than on nothing.
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

function ToolbarDivider() {
  return <div className="mx-1 h-5 w-px bg-border" />
}

/** The row of blocks above the note. The "/" menu offers the same ones. */
function Toolbar({ editor, onImage }: { editor: Editor; onImage: () => void }) {
  const state = useEditorState({
    editor,
    selector: ({ editor: current }) => ({
      h1: current.isActive("heading", { level: 1 }),
      h2: current.isActive("heading", { level: 2 }),
      h3: current.isActive("heading", { level: 3 }),
      bullet: current.isActive("bulletList"),
      ordered: current.isActive("orderedList"),
      tasks: current.isActive("taskList"),
      quote: current.isActive("blockquote"),
      code: current.isActive("codeBlock"),
      callout: current.isActive("callout"),
    }),
  })
  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b pb-1" role="toolbar" aria-label="Blocks">
      <ToolbarButton label="Heading 1" active={state?.h1} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}>
        <Heading1Icon />
      </ToolbarButton>
      <ToolbarButton label="Heading 2" active={state?.h2} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
        <Heading2Icon />
      </ToolbarButton>
      <ToolbarButton label="Heading 3" active={state?.h3} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>
        <Heading3Icon />
      </ToolbarButton>
      <ToolbarDivider />
      <ToolbarButton label="Bulleted list" active={state?.bullet} onClick={() => editor.chain().focus().toggleBulletList().run()}>
        <ListIcon />
      </ToolbarButton>
      <ToolbarButton label="Numbered list" active={state?.ordered} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
        <ListOrderedIcon />
      </ToolbarButton>
      <ToolbarButton label="Checklist" active={state?.tasks} onClick={() => editor.chain().focus().toggleTaskList().run()}>
        <ListChecksIcon />
      </ToolbarButton>
      <ToolbarDivider />
      <ToolbarButton label="Toggle" onClick={() => editor.chain().focus().setDetails().run()}>
        <ListCollapseIcon />
      </ToolbarButton>
      <ToolbarButton
        label="Callout"
        active={state?.callout}
        onClick={() =>
          state?.callout
            ? editor.chain().focus().lift("callout").run()
            : editor.chain().focus().wrapIn("callout", { tone: "blue" }).run()
        }
      >
        <InfoIcon />
      </ToolbarButton>
      <ToolbarButton label="Quote" active={state?.quote} onClick={() => editor.chain().focus().toggleBlockquote().run()}>
        <TextQuoteIcon />
      </ToolbarButton>
      <ToolbarButton label="Code" active={state?.code} onClick={() => editor.chain().focus().toggleCodeBlock().run()}>
        <CodeIcon />
      </ToolbarButton>
      <ToolbarButton
        label="Table"
        onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
      >
        <TableIcon />
      </ToolbarButton>
      <ToolbarButton label="Image" onClick={onImage}>
        <ImageIcon />
      </ToolbarButton>
    </div>
  )
}

/** Shown while the cursor is in a table: add and take away rows and columns. */
function TableBar({ editor }: { editor: Editor }) {
  const inTable = useEditorState({ editor, selector: ({ editor: current }) => current.isActive("table") })
  if (!inTable) return null
  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b py-1" role="toolbar" aria-label="Table">
      <ToolbarButton label="Add a row below" onClick={() => editor.chain().focus().addRowAfter().run()}>
        <BetweenHorizontalStartIcon />
      </ToolbarButton>
      <ToolbarButton label="Add a column to the right" onClick={() => editor.chain().focus().addColumnAfter().run()}>
        <BetweenVerticalStartIcon />
      </ToolbarButton>
      <ToolbarButton label="Header row on or off" onClick={() => editor.chain().focus().toggleHeaderRow().run()}>
        <TableRowsSplitIcon />
      </ToolbarButton>
      <ToolbarDivider />
      <Button type="button" variant="ghost" size="sm" onMouseDown={(event) => event.preventDefault()} onClick={() => editor.chain().focus().deleteRow().run()}>
        Delete row
      </Button>
      <Button type="button" variant="ghost" size="sm" onMouseDown={(event) => event.preventDefault()} onClick={() => editor.chain().focus().deleteColumn().run()}>
        Delete column
      </Button>
      <Button type="button" variant="ghost" size="sm" onMouseDown={(event) => event.preventDefault()} onClick={() => editor.chain().focus().deleteTable().run()}>
        <Trash2Icon />
        Delete table
      </Button>
    </div>
  )
}

/**
 * The bar over selected text: bold, italic, strike, code, link, and the
 * highlighter and text colours. The colours open as a second row in the same
 * bar, because a popover would take the focus and close the bar under it.
 */
function SelectionMenu({ editor }: { editor: Editor }) {
  const [row, setRow] = React.useState<"main" | "highlight" | "colour">("main")
  const state = useEditorState({
    editor,
    selector: ({ editor: current }) => ({
      bold: current.isActive("bold"),
      italic: current.isActive("italic"),
      strike: current.isActive("strike"),
      code: current.isActive("code"),
      link: current.isActive("link"),
      highlight: current.isActive("highlight"),
      colour: current.isActive("textColour"),
    }),
  })

  return (
    <BubbleMenu
      editor={editor}
      options={{ placement: "top", offset: 10, shift: true, flip: true, onHide: () => setRow("main") }}
      shouldShow={({ editor: current, from, to }) =>
        from !== to && !current.isActive("image") && !current.isActive("noteLink")
      }
      className="z-20 flex items-center gap-1 rounded-lg border bg-background/95 p-1 shadow-lg backdrop-blur"
    >
      {row === "main" ? (
        <>
          <ToolbarButton label="Bold" active={state?.bold} onClick={() => editor.chain().focus().toggleBold().run()}>
            <BoldIcon />
          </ToolbarButton>
          <ToolbarButton label="Italic" active={state?.italic} onClick={() => editor.chain().focus().toggleItalic().run()}>
            <ItalicIcon />
          </ToolbarButton>
          <ToolbarButton label="Strikethrough" active={state?.strike} onClick={() => editor.chain().focus().toggleStrike().run()}>
            <StrikethroughIcon />
          </ToolbarButton>
          <ToolbarButton label="Inline code" active={state?.code} onClick={() => editor.chain().focus().toggleCode().run()}>
            <CodeIcon />
          </ToolbarButton>
          <LinkButton editor={editor} active={Boolean(state?.link)} />
          <ToolbarDivider />
          <ToolbarButton label="Highlight" active={state?.highlight} onClick={() => setRow("highlight")}>
            <HighlighterIcon />
          </ToolbarButton>
          <ToolbarButton label="Text colour" active={state?.colour} onClick={() => setRow("colour")}>
            <PaletteIcon />
          </ToolbarButton>
        </>
      ) : (
        <>
          {(row === "highlight" ? HIGHLIGHT_COLOURS : TEXT_COLOURS).map((colour) => (
            <ToolbarButton
              key={colour}
              label={`${row === "highlight" ? "Highlight" : "Text"} ${colour}`}
              onClick={() => {
                if (row === "highlight") editor.chain().focus().setHighlight({ colour } as never).run()
                else editor.chain().focus().setMark("textColour", { colour }).run()
                setRow("main")
              }}
            >
              <span
                className={cn(
                  "flex size-4 items-center justify-center rounded-sm text-xs font-semibold",
                  row === "highlight"
                    ? HIGHLIGHT_CLASS[colour as keyof typeof HIGHLIGHT_CLASS]
                    : TEXT_COLOUR_CLASS[colour as keyof typeof TEXT_COLOUR_CLASS]
                )}
              >
                {row === "highlight" ? (
                  <span className={cn("size-3 rounded-sm", SWATCH_CLASS[colour as keyof typeof SWATCH_CLASS])} />
                ) : (
                  "A"
                )}
              </span>
            </ToolbarButton>
          ))}
          <ToolbarDivider />
          <ToolbarButton
            label={row === "highlight" ? "No highlight" : "No colour"}
            onClick={() => {
              if (row === "highlight") editor.chain().focus().unsetHighlight().run()
              else editor.chain().focus().unsetMark("textColour").run()
              setRow("main")
            }}
          >
            <XIcon />
          </ToolbarButton>
        </>
      )}
    </BubbleMenu>
  )
}

function LinkButton({ editor, active }: { editor: Editor; active: boolean }) {
  const [open, setOpen] = React.useState(false)
  const [url, setUrl] = React.useState("")
  const id = React.useId()
  function apply() {
    const href = url.trim()
    if (!href) {
      showErrorToast("Type the address the link should open")
      return
    }
    editor
      .chain()
      .focus()
      .extendMarkRange("link")
      .setLink({ href: /^[a-z]+:/i.test(href) ? href : `https://${href}` })
      .run()
    setOpen(false)
  }
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) setUrl((editor.getAttributes("link").href as string) ?? "")
      }}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button type="button" variant={active ? "secondary" : "ghost"} size="icon-sm" aria-label="Link">
              <LinkIcon />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>Link</TooltipContent>
      </Tooltip>
      <PopoverContent className="grid w-72 gap-2 p-3" align="start">
        <Label htmlFor={id}>Link</Label>
        <Input
          id={id}
          value={url}
          placeholder="https://example.com"
          onChange={(event) => setUrl(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault()
              apply()
            }
          }}
        />
        <div className="flex justify-end gap-2">
          {active ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                editor.chain().focus().unsetLink().run()
                setOpen(false)
              }}
            >
              Remove
            </Button>
          ) : null}
          <Button type="button" size="sm" onClick={apply}>
            Set link
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

const NOTE_EDITOR_STYLES = `
.note-rte .tiptap { min-height: 240px; padding: 12px 2px 24px; font-size: 0.9375rem; line-height: 1.65; outline: none; }
.note-rte .tiptap > * + * { margin-top: 0.6em; }
.note-rte .tiptap h1 { font-size: 1.6em; font-weight: 700; line-height: 1.25; margin-top: 1em; }
.note-rte .tiptap h2 { font-size: 1.3em; font-weight: 700; line-height: 1.3; margin-top: 0.9em; }
.note-rte .tiptap h3 { font-size: 1.1em; font-weight: 650; margin-top: 0.8em; }
.note-rte .tiptap ul:not([data-type="taskList"]) { list-style: disc; padding-left: 1.4em; }
.note-rte .tiptap ol { list-style: decimal; padding-left: 1.4em; }
.note-rte .tiptap li > p { margin: 0.1em 0; }
.note-rte .tiptap ul[data-type="taskList"] { padding-left: 0.1em; }
.note-rte .tiptap ul[data-type="taskList"] li { display: flex; gap: 0.5em; align-items: flex-start; }
.note-rte .tiptap ul[data-type="taskList"] li > label { margin-top: 0.3em; flex-shrink: 0; }
.note-rte .tiptap ul[data-type="taskList"] li > label input { width: 1em; height: 1em; accent-color: var(--primary); cursor: pointer; }
.note-rte .tiptap ul[data-type="taskList"] li > div { flex: 1; min-width: 0; }
.note-rte .tiptap ul[data-type="taskList"] li[data-checked="true"] > div { color: var(--muted-foreground); text-decoration: line-through; }
.note-rte .tiptap blockquote { border-left: 3px solid var(--border); padding-left: 0.9em; color: var(--muted-foreground); }
.note-rte .tiptap a { color: var(--primary); text-decoration: underline; }
.note-rte .tiptap code { font-family: ui-monospace, monospace; font-size: 0.9em; background: var(--muted); border-radius: 4px; padding: 0.1em 0.3em; }
.note-rte .tiptap pre { font-family: ui-monospace, monospace; font-size: 0.85em; background: var(--muted); border-radius: 6px; padding: 0.75em 1em; overflow-x: auto; }
.note-rte .tiptap pre code { background: none; padding: 0; }
.note-rte .tiptap hr { border: none; border-top: 1px solid var(--border); margin: 1.2em 0; }
.note-rte .tiptap img { max-width: 100%; height: auto; border-radius: 6px; }
.note-rte .tiptap img.ProseMirror-selectednode { outline: 2px solid var(--ring); }
.note-rte .tiptap .tableWrapper { overflow-x: auto; }
.note-rte .tiptap table { border-collapse: collapse; table-layout: fixed; width: 100%; margin: 0.4em 0; }
.note-rte .tiptap th, .note-rte .tiptap td { border: 1px solid var(--border); padding: 0.35em 0.6em; vertical-align: top; min-width: 5em; position: relative; }
.note-rte .tiptap th { background: var(--muted); font-weight: 600; text-align: left; }
.note-rte .tiptap .selectedCell::after { content: ""; position: absolute; inset: 0; background: color-mix(in oklab, var(--primary) 12%, transparent); pointer-events: none; }
.note-rte .tiptap [data-type="details"] { display: flex; gap: 0.35em; }
.note-rte .tiptap [data-type="details"] > button { flex-shrink: 0; width: 1.4em; height: 1.4em; margin-top: 0.15em; border-radius: 4px; display: flex; align-items: center; justify-content: center; }
.note-rte .tiptap [data-type="details"] > button:hover { background: var(--muted); }
.note-rte .tiptap [data-type="details"] > button::before { content: "▸"; transition: transform 120ms; }
.note-rte .tiptap [data-type="details"].is-open > button::before { transform: rotate(90deg); }
.note-rte .tiptap [data-type="details"] > div { flex: 1; min-width: 0; }
.note-rte .tiptap [data-type="details"] summary { font-weight: 600; list-style: none; }
.note-rte .tiptap [data-type="details"] summary::-webkit-details-marker { display: none; }
.note-rte .tiptap [data-type="detailsContent"] > * + * { margin-top: 0.4em; }
.note-rte .tiptap p.is-editor-empty:first-child::before { content: attr(data-placeholder); color: var(--muted-foreground); float: left; height: 0; pointer-events: none; }
@media (prefers-reduced-motion: reduce) { .note-rte .tiptap [data-type="details"] > button::before { transition: none; } }
`
