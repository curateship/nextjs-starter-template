import * as React from "react"
import Image from "@tiptap/extension-image"
import Placeholder from "@tiptap/extension-placeholder"
import {
  EditorContent,
  useEditor,
  useEditorState,
  type Editor,
} from "@tiptap/react"
import { BubbleMenu } from "@tiptap/react/menus"
import StarterKit from "@tiptap/starter-kit"
import {
  BoldIcon,
  Heading2Icon,
  Heading3Icon,
  Heading4Icon,
  ImageIcon,
  ItalicIcon,
  LinkIcon,
  ListIcon,
  ListOrderedIcon,
  StrikethroughIcon,
  TextQuoteIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import { focusRing } from "@/lib/layout/focus-ring"
import {
  cleanWrittenPageBody,
  writtenPageBodyIsEmpty,
  type WrittenPageNode,
} from "@/lib/pages/written-page-body"

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
    <Button
      type="button"
      variant={active ? "secondary" : "ghost"}
      size="icon-sm"
      aria-label={label}
      title={label}
      // Keeps the text selection alive while the button is pressed, so the
      // formatting lands on what was selected rather than on nothing.
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
    >
      {children}
    </Button>
  )
}

function UrlPopover({
  label,
  icon,
  active,
  initialUrl,
  buttonLabel,
  onSubmit,
  onRemove,
}: {
  label: string
  icon: React.ReactNode
  active?: boolean
  initialUrl?: string
  buttonLabel: string
  onSubmit: (url: string) => void
  onRemove?: () => void
}) {
  const [open, setOpen] = React.useState(false)
  const [url, setUrl] = React.useState("")

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) setUrl(initialUrl ?? "")
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant={active ? "secondary" : "ghost"}
          size="icon-sm"
          aria-label={label}
          title={label}
        >
          {icon}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-3" align="start">
        <div className="grid gap-2">
          <Label htmlFor={`url-${label}`}>{label}</Label>
          <Input
            id={`url-${label}`}
            value={url}
            placeholder="https://example.com"
            onChange={(event) => setUrl(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Enter" || !url.trim()) return
              onSubmit(url.trim())
              setOpen(false)
            }}
          />
          <div className="flex justify-end gap-2">
            {onRemove ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  onRemove()
                  setOpen(false)
                }}
              >
                Remove
              </Button>
            ) : null}
            <Button
              type="button"
              size="sm"
              disabled={!url.trim()}
              onClick={() => {
                onSubmit(url.trim())
                setOpen(false)
              }}
            >
              {buttonLabel}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}

function ImagePopover({ editor }: { editor: Editor }) {
  const [open, setOpen] = React.useState(false)
  const [url, setUrl] = React.useState("")
  const [description, setDescription] = React.useState("")
  const [editing, setEditing] = React.useState(false)

  const submit = React.useCallback(() => {
    const source = url.trim()
    const alt = description.trim()
    if (!source || !alt) return

    const chain = editor.chain().focus()
    if (editing) chain.updateAttributes("image", { src: source, alt }).run()
    else chain.setImage({ src: source, alt }).run()
    setOpen(false)
  }, [description, editing, editor, url])

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) return
        const selected = editor.isActive("image")
        const image = selected ? editor.getAttributes("image") : {}
        setEditing(selected)
        setUrl(typeof image.src === "string" ? image.src : "")
        setDescription(typeof image.alt === "string" ? image.alt : "")
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Image"
          title="Image"
        >
          <ImageIcon className="size-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-3" align="start">
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault()
            submit()
          }}
        >
          <div className="grid gap-2">
            <Label htmlFor="email-image-url">Image URL</Label>
            <Input
              id="email-image-url"
              type="url"
              value={url}
              placeholder="https://example.com/image.jpg"
              maxLength={2000}
              onChange={(event) => setUrl(event.target.value)}
              required
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="email-image-description">Image description</Label>
            <Input
              id="email-image-description"
              value={description}
              placeholder="Two people talking at a table"
              maxLength={500}
              onChange={(event) => setDescription(event.target.value)}
              required
            />
          </div>
          <div className="flex justify-end">
            <Button
              type="submit"
              size="sm"
              disabled={!url.trim() || !description.trim()}
            >
              {editing ? "Save" : "Insert"}
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  )
}

function Toolbar({
  editor,
  allowImages,
}: {
  editor: Editor
  allowImages: boolean
}) {
  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b bg-muted/50 p-1">
      <ToolbarButton
        label="Bold"
        active={editor.isActive("bold")}
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        <BoldIcon className="size-3.5" />
      </ToolbarButton>
      <ToolbarButton
        label="Italic"
        active={editor.isActive("italic")}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <ItalicIcon className="size-3.5" />
      </ToolbarButton>
      <ToolbarButton
        label="Strikethrough"
        active={editor.isActive("strike")}
        onClick={() => editor.chain().focus().toggleStrike().run()}
      >
        <StrikethroughIcon className="size-3.5" />
      </ToolbarButton>
      <ToolbarButton
        label="Heading 2"
        active={editor.isActive("heading", { level: 2 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
      >
        <Heading2Icon className="size-3.5" />
      </ToolbarButton>
      <ToolbarButton
        label="Heading 3"
        active={editor.isActive("heading", { level: 3 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
      >
        <Heading3Icon className="size-3.5" />
      </ToolbarButton>
      <ToolbarButton
        label="Bullet list"
        active={editor.isActive("bulletList")}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      >
        <ListIcon className="size-3.5" />
      </ToolbarButton>
      <ToolbarButton
        label="Numbered list"
        active={editor.isActive("orderedList")}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      >
        <ListOrderedIcon className="size-3.5" />
      </ToolbarButton>
      <ToolbarButton
        label="Quote"
        active={editor.isActive("blockquote")}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
      >
        <TextQuoteIcon className="size-3.5" />
      </ToolbarButton>
      <UrlPopover
        label="Link"
        icon={<LinkIcon className="size-3.5" />}
        active={editor.isActive("link")}
        initialUrl={(editor.getAttributes("link").href as string) ?? ""}
        buttonLabel="Set link"
        onSubmit={(url) =>
          editor
            .chain()
            .focus()
            .extendMarkRange("link")
            .setLink({ href: url })
            .run()
        }
        onRemove={() => editor.chain().focus().unsetLink().run()}
      />
      {allowImages ? <ImagePopover editor={editor} /> : null}
    </div>
  )
}

/**
 * The only three tokens the send loop actually swaps out per person. Adding a
 * fourth chip here without teaching `personalizeEmail` about it would mail
 * people the raw `{{whatever}}`.
 */
const MERGE_TAGS = ["firstName", "lastName", "email"] as const

/**
 * The app's one rich-text editor, used by the newsletter and by pages an admin
 * writes.
 *
 * The two differ in three ways, which are the props below rather than a second
 * copy of this file: an email personalises itself and can hold an image, and a
 * written page does neither. What comes *out* differs too — an email needs
 * HTML because that is what an email is, and a written page keeps the editor's
 * own document so nothing on a public page is ever built from a string of
 * markup. `DocumentEditor` below is that second door onto the same editor.
 */
export function RichTextEditor({
  value,
  onChange,
  disabled,
  placeholder = "Write your email…",
  mergeTags = false,
  allowImages = false,
}: {
  value: string
  onChange: (html: string) => void
  disabled?: boolean
  placeholder?: string
  /** Offer the per-person tokens. Email only — nothing else personalises. */
  mergeTags?: boolean
  /** Offer the image button. */
  allowImages?: boolean
}) {
  /**
   * True until this editor reports a real edit.
   *
   * Starting on empty content, the editor tidies "" into "<p></p>" and reports
   * that as an edit before anyone has typed a character. That is not an edit:
   * on an email it marks a draft as changed the moment it is looked at, and in
   * the blocks panel it would quietly save a default nobody chose. Cleared on
   * the first genuine change, so emptying the box afterwards still counts.
   */
  const untouched = React.useRef(!value.trim())

  const editor = useEditor({
    // Off during server rendering: the editor writes into the DOM as it starts,
    // which the server has none of, and rendering it both places would make the
    // two disagree at hydration.
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3, 4] },
        link: { openOnClick: false },
      }),
      Image,
      Placeholder.configure({ placeholder }),
    ],
    content: value,
    editable: !disabled,
    onUpdate: ({ editor: current }) => {
      if (untouched.current && current.isEmpty) return
      untouched.current = false
      onChange(current.getHTML())
    },
  })

  React.useEffect(() => {
    editor?.setEditable(!disabled)
  }, [editor, disabled])

  // Take on changes that came from somewhere else — a template applied, or the
  // server handing back cleaned-up markup after a save. Never while the cursor
  // is in here, which would yank the text out from under whoever is typing.
  React.useEffect(() => {
    if (!editor) return
    if (editor.getHTML() !== value && !editor.isFocused) {
      editor.commands.setContent(value)
    }
  }, [editor, value])

  return (
    <div
      className={cn(
        "overflow-hidden rounded-md border bg-background",
        disabled && "opacity-60"
      )}
    >
      <style>{`
        .broadcast-rte .tiptap { min-height: 160px; padding: 10px 12px; font-size: 0.875rem; line-height: 1.6; outline: none; }
        .broadcast-rte .tiptap p { margin: 0 0 0.6em 0; }
        .broadcast-rte .tiptap h1 { font-size: 1.5em; font-weight: 700; margin: 0.4em 0; }
        .broadcast-rte .tiptap h2 { font-size: 1.3em; font-weight: 700; margin: 0.4em 0; }
        .broadcast-rte .tiptap h3 { font-size: 1.15em; font-weight: 700; margin: 0.4em 0; }
        .broadcast-rte .tiptap h4 { font-size: 1em; font-weight: 700; margin: 0.4em 0; }
        .broadcast-rte .tiptap ul { list-style: disc; padding-left: 1.25em; margin: 0 0 0.6em 0; }
        .broadcast-rte .tiptap ol { list-style: decimal; padding-left: 1.25em; margin: 0 0 0.6em 0; }
        .broadcast-rte .tiptap blockquote { border-left: 3px solid var(--border); padding-left: 0.75em; color: var(--muted-foreground); margin: 0 0 0.6em 0; }
        .broadcast-rte .tiptap a { color: var(--primary); text-decoration: underline; }
        .broadcast-rte .tiptap img { max-width: 100%; height: auto; border-radius: 6px; }
        .broadcast-rte .tiptap p.is-editor-empty:first-child::before { content: attr(data-placeholder); color: var(--muted-foreground); float: left; height: 0; pointer-events: none; }
      `}</style>
      {editor && !disabled ? (
        <Toolbar editor={editor} allowImages={allowImages} />
      ) : null}
      <div className="broadcast-rte">
        <EditorContent editor={editor} />
      </div>
      {editor && !disabled && mergeTags ? (
        <div className="border-t bg-muted/30 p-2">
          <p className="mb-1.5 px-0.5 text-xs text-muted-foreground">
            Drop one of these in and each person gets their own.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {MERGE_TAGS.map((tag) => (
              <button
                key={tag}
                type="button"
                title={`Insert ${tag}`}
                // Keeps the cursor where it was, so the token lands in the
                // sentence rather than wherever the caret drifted to.
                onMouseDown={(event) => event.preventDefault()}
                onClick={() =>
                  editor.chain().focus().insertContent(`{{${tag}}}`).run()
                }
                className={cn(
                  "rounded-md border bg-background px-2 py-1 font-mono text-xs text-foreground transition-colors hover:bg-muted",
                  focusRing
                )}
              >
                {tag}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}

/**
 * The formatting a written page offers, as a bar that appears over whatever is
 * selected rather than sitting above the box.
 *
 * Copied from the Directory app's post editor, which is the house pattern for
 * writing prose: the page being written is what fills the window, and a toolbar
 * that is only there while there is something to format keeps it that way.
 *
 * `useEditorState` rather than `editor.isActive(...)` read during render — the
 * latter reads the editor while React is drawing, so a button lights up a beat
 * late or not at all.
 */
function SelectionToolbar({ editor }: { editor: Editor }) {
  const state = useEditorState({
    editor,
    selector: ({ editor: current }) => ({
      bold: current.isActive("bold"),
      italic: current.isActive("italic"),
      h2: current.isActive("heading", { level: 2 }),
      h3: current.isActive("heading", { level: 3 }),
      h4: current.isActive("heading", { level: 4 }),
      bullet: current.isActive("bulletList"),
      ordered: current.isActive("orderedList"),
      quote: current.isActive("blockquote"),
      link: current.isActive("link"),
    }),
  })

  return (
    <BubbleMenu
      editor={editor}
      options={{ placement: "top", offset: 10, shift: true, flip: true }}
      className="z-20 flex items-center gap-1 rounded-lg border bg-background/95 p-1 shadow-lg backdrop-blur"
    >
      <ToolbarButton
        label="Bold"
        active={state?.bold}
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        <BoldIcon className="size-4" />
      </ToolbarButton>
      <ToolbarButton
        label="Italic"
        active={state?.italic}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <ItalicIcon className="size-4" />
      </ToolbarButton>

      <ToolbarDivider />

      {/*
       * Headings start at 2. The page's own title is its h1, so offering
       * another would give the page two competing top-level headings — and
       * every one of these lands inside the body, under that title.
       */}
      <ToolbarButton
        label="Heading 2"
        active={state?.h2}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
      >
        <Heading2Icon className="size-4" />
      </ToolbarButton>
      <ToolbarButton
        label="Heading 3"
        active={state?.h3}
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
      >
        <Heading3Icon className="size-4" />
      </ToolbarButton>
      <ToolbarButton
        label="Heading 4"
        active={state?.h4}
        onClick={() => editor.chain().focus().toggleHeading({ level: 4 }).run()}
      >
        <Heading4Icon className="size-4" />
      </ToolbarButton>

      <ToolbarDivider />

      <ToolbarButton
        label="Bullet list"
        active={state?.bullet}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      >
        <ListIcon className="size-4" />
      </ToolbarButton>
      <ToolbarButton
        label="Numbered list"
        active={state?.ordered}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      >
        <ListOrderedIcon className="size-4" />
      </ToolbarButton>
      <ToolbarButton
        label="Quote"
        active={state?.quote}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
      >
        <TextQuoteIcon className="size-4" />
      </ToolbarButton>

      <ToolbarDivider />

      <UrlPopover
        label="Link"
        icon={<LinkIcon className="size-4" />}
        active={state?.link}
        initialUrl={(editor.getAttributes("link").href as string) ?? ""}
        buttonLabel="Set link"
        onSubmit={(url) =>
          editor
            .chain()
            .focus()
            .extendMarkRange("link")
            .setLink({ href: url })
            .run()
        }
        onRemove={() => editor.chain().focus().unsetLink().run()}
      />
    </BubbleMenu>
  )
}

function ToolbarDivider() {
  return <div className="mx-1 h-5 w-px bg-border" />
}

/**
 * The same editor, keeping the editor's own document instead of HTML.
 *
 * This is what an admin-written page uses. The public page draws that document
 * by turning named nodes into React elements, so no string of markup is ever
 * stored or handed to a browser — see `lib/pages/written-page-body.ts`. An
 * email cannot work that way (an email *is* HTML), which is why both doors
 * exist onto one editor rather than one door and a converter.
 */
export function DocumentEditor({
  value,
  onChange,
  disabled,
  placeholder = "Write the page…",
}: {
  value: WrittenPageNode
  onChange: (body: WrittenPageNode) => void
  disabled?: boolean
  placeholder?: string
}) {
  const untouched = React.useRef(writtenPageBodyIsEmpty(value))

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      // No image extension: a written page's body is words. Pictures are the
      // page's own image slot, which keeps this from drifting into a layout
      // tool one extension at a time.
      StarterKit.configure({
        heading: { levels: [2, 3, 4] },
        link: { openOnClick: false },
      }),
      Placeholder.configure({ placeholder }),
    ],
    content: value,
    editable: !disabled,
    onUpdate: ({ editor: current }) => {
      if (untouched.current && current.isEmpty) return
      untouched.current = false
      // Cleaned on the way out as well as on the way in, so what the form
      // holds is already only what a page may contain.
      onChange(cleanWrittenPageBody(current.getJSON()))
    },
  })

  React.useEffect(() => {
    editor?.setEditable(!disabled)
  }, [editor, disabled])

  return (
    <div
      className={cn(
        "rounded-md border bg-background",
        disabled && "opacity-60"
      )}
    >
      {/*
       * Bigger and airier than the newsletter's box: this is somebody writing a
       * page rather than filling in a field, and the words are the whole thing
       * on screen. Same structural rules as the email editor, one size up.
       */}
      <style>{`
        .page-rte .tiptap { min-height: 260px; padding: 16px 18px; font-size: 1.0625rem; line-height: 1.7; outline: none; }
        .page-rte .tiptap p { margin: 0 0 0.8em 0; }
        .page-rte .tiptap h2 { font-size: 1.45em; font-weight: 700; margin: 0.8em 0 0.3em; }
        .page-rte .tiptap h3 { font-size: 1.2em; font-weight: 700; margin: 0.8em 0 0.3em; }
        .page-rte .tiptap h4 { font-size: 1.05em; font-weight: 700; margin: 0.8em 0 0.3em; }
        .page-rte .tiptap ul { list-style: disc; padding-left: 1.4em; margin: 0 0 0.8em 0; }
        .page-rte .tiptap ol { list-style: decimal; padding-left: 1.4em; margin: 0 0 0.8em 0; }
        .page-rte .tiptap li { margin: 0.2em 0; }
        .page-rte .tiptap blockquote { border-left: 3px solid var(--border); padding-left: 0.9em; color: var(--muted-foreground); margin: 0 0 0.8em 0; }
        .page-rte .tiptap a { color: var(--primary); text-decoration: underline; }
        .page-rte .tiptap p.is-editor-empty:first-child::before { content: attr(data-placeholder); color: var(--muted-foreground); float: left; height: 0; pointer-events: none; }
      `}</style>
      {editor && !disabled ? <SelectionToolbar editor={editor} /> : null}
      <div className="page-rte">
        <EditorContent editor={editor} />
      </div>
    </div>
  )
}
