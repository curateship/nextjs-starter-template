import * as React from "react"
import Image from "@tiptap/extension-image"
import Placeholder from "@tiptap/extension-placeholder"
import { EditorContent, useEditor, type Editor } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import {
  BoldIcon,
  Heading2Icon,
  Heading3Icon,
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
import { focusRing } from "@/lib/focus-ring"

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

function Toolbar({ editor }: { editor: Editor }) {
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
      <UrlPopover
        label="Image URL"
        icon={<ImageIcon className="size-3.5" />}
        buttonLabel="Insert"
        onSubmit={(url) => editor.chain().focus().setImage({ src: url }).run()}
      />
    </div>
  )
}

/**
 * The only three tokens the send loop actually swaps out per person. Adding a
 * fourth chip here without teaching `personalizeEmail` about it would mail
 * people the raw `{{whatever}}`.
 */
const MERGE_TAGS = ["firstName", "lastName", "email"] as const

export function RichTextEditor({
  value,
  onChange,
  disabled,
}: {
  value: string
  onChange: (html: string) => void
  disabled?: boolean
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
      Placeholder.configure({ placeholder: "Write your email…" }),
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
      {editor && !disabled ? <Toolbar editor={editor} /> : null}
      <div className="broadcast-rte">
        <EditorContent editor={editor} />
      </div>
      {editor && !disabled ? (
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
