import * as React from "react"
import { mergeAttributes, Node } from "@tiptap/core"
import Placeholder from "@tiptap/extension-placeholder"
import {
  EditorContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  useEditor,
  useEditorState,
  type Editor,
  type ReactNodeViewProps,
} from "@tiptap/react"
import { BubbleMenu } from "@tiptap/react/menus"
import StarterKit from "@tiptap/starter-kit"
import {
  BoldIcon,
  Heading2Icon,
  Heading3Icon,
  Heading4Icon,
  ItalicIcon,
  LinkIcon,
  ListIcon,
  ListOrderedIcon,
  StoreIcon,
  TextQuoteIcon,
  Trash2Icon,
} from "lucide-react"

import { ListingPicker } from "@/components/directory/listing-picker"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import type { ListingChoice } from "@/lib/api/posts/posts"
import {
  cleanPostBody,
  LISTING_CARD_NODE,
  postBodyText,
  type PostBody,
} from "@/lib/posts/post-body"
import { cn } from "@/lib/utils"

/**
 * The writing box for a post: the shell's page editor plus a listing card.
 *
 * **Why this is a copy and not the shell's `DocumentEditor`.** The shell's
 * editor and its list of allowed blocks are closed, and an app never edits a
 * shell file. So CMS keeps its own editor with the same formatting and the same
 * floating bar, and adds one block. Tyler chose this on 17 Sep 2026 over a
 * stack of separate boxes. The cost is that a later change to the shell's
 * floating bar does not reach posts on its own.
 *
 * The card is placed with the "Listing card" button above the text, at the
 * cursor. It cannot live in the floating bar, which only appears over selected
 * text, and a card is not something you apply to a selection.
 */

/** The listings the open post's cards point at, so each card can be named. */
const ListingChoicesContext = React.createContext<Map<string, ListingChoice>>(
  new Map()
)

export function PostEditor({
  value,
  onChange,
  listings,
  onListingPicked,
  disabled,
}: {
  value: PostBody
  onChange: (body: PostBody) => void
  /** Every listing the editor knows about by id. */
  listings: Map<string, ListingChoice>
  /** A listing was picked for a new card, so the form can remember its name. */
  onListingPicked: (listing: ListingChoice) => void
  disabled?: boolean
}) {
  /** Same reason as the shell's editor: tidying "" is not an edit. */
  const untouched = React.useRef(postBodyText(value).trim() === "")

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3, 4] },
        link: { openOnClick: false },
      }),
      Placeholder.configure({ placeholder: "Write the post…" }),
      ListingCardExtension,
    ],
    content: value,
    editable: !disabled,
    onUpdate: ({ editor: current }) => {
      if (untouched.current && current.isEmpty) return
      untouched.current = false
      onChange(cleanPostBody(current.getJSON()))
    },
  })

  React.useEffect(() => {
    editor?.setEditable(!disabled)
  }, [editor, disabled])

  return (
    <ListingChoicesContext.Provider value={listings}>
      <div
        className={cn(
          "rounded-md border bg-background",
          disabled && "opacity-60"
        )}
      >
        {/* The shell's page editor sizes, so a post reads like a page. */}
        <style>{`
          .post-rte .tiptap { min-height: 260px; padding: 16px 18px; font-size: 1.0625rem; line-height: 1.7; outline: none; }
          .post-rte .tiptap p { margin: 0 0 0.8em 0; }
          .post-rte .tiptap h2 { font-size: 1.45em; font-weight: 700; margin: 0.8em 0 0.3em; }
          .post-rte .tiptap h3 { font-size: 1.2em; font-weight: 700; margin: 0.8em 0 0.3em; }
          .post-rte .tiptap h4 { font-size: 1.05em; font-weight: 700; margin: 0.8em 0 0.3em; }
          .post-rte .tiptap ul { list-style: disc; padding-left: 1.4em; margin: 0 0 0.8em 0; }
          .post-rte .tiptap ol { list-style: decimal; padding-left: 1.4em; margin: 0 0 0.8em 0; }
          .post-rte .tiptap li { margin: 0.2em 0; }
          .post-rte .tiptap blockquote { border-left: 3px solid var(--border); padding-left: 0.9em; color: var(--muted-foreground); margin: 0 0 0.8em 0; }
          .post-rte .tiptap a { color: var(--primary); text-decoration: underline; }
          .post-rte .tiptap p.is-editor-empty:first-child::before { content: attr(data-placeholder); color: var(--muted-foreground); float: left; height: 0; pointer-events: none; }
        `}</style>
        {editor && !disabled ? (
          <>
            <div className="flex items-center gap-2 border-b p-2">
              <ListingPicker
                label="Listing card"
                inputId="post-listing-card-search"
                size="sm"
                onPick={(listing) => {
                  onListingPicked(listing)
                  editor
                    .chain()
                    .focus()
                    .insertContent({
                      type: LISTING_CARD_NODE,
                      attrs: { listingId: listing.id },
                    })
                    .run()
                  // A placed card is left selected, so the next letter typed
                  // would replace it. Move the cursor to the line after the
                  // card, making one when there is none.
                  const after = editor.state.selection.to
                  if (editor.state.doc.resolve(after).nodeAfter?.isTextblock) {
                    editor.commands.setTextSelection(after + 1)
                  } else {
                    editor.commands.createParagraphNear()
                  }
                }}
              />
            </div>
            <SelectionToolbar editor={editor} />
          </>
        ) : null}
        <div className="post-rte">
          <EditorContent editor={editor} />
        </div>
      </div>
    </ListingChoicesContext.Provider>
  )
}

/**
 * The listing card block. It stores the listing's id and nothing else; the
 * name and photo shown here come from the form, and the public page reads the
 * listing fresh when it draws the card.
 */
const ListingCardExtension = Node.create({
  name: LISTING_CARD_NODE,
  group: "block",
  atom: true,
  draggable: true,
  selectable: true,
  addAttributes() {
    return {
      listingId: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-listing-id"),
        renderHTML: (attributes) => ({
          "data-listing-id": attributes.listingId as string | null,
        }),
      },
    }
  },
  parseHTML() {
    return [{ tag: "div[data-listing-card]" }]
  },
  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes({ "data-listing-card": "" }, HTMLAttributes)]
  },
  addNodeView() {
    return ReactNodeViewRenderer(ListingCardView)
  },
})

function ListingCardView({
  node,
  deleteNode,
  editor,
  selected,
}: ReactNodeViewProps) {
  const listings = React.useContext(ListingChoicesContext)
  const listingId = node.attrs.listingId as string | null
  const listing = listingId ? listings.get(listingId) : undefined

  return (
    <NodeViewWrapper
      className={cn(
        "my-3 flex items-center gap-3 rounded-md border bg-muted/40 p-2",
        selected && "ring-2 ring-ring"
      )}
      data-drag-handle
    >
      {listing?.featuredImage ? (
        <img
          src={listing.featuredImage}
          alt=""
          className="size-12 shrink-0 rounded object-cover"
        />
      ) : (
        <div className="flex size-12 shrink-0 items-center justify-center rounded bg-muted">
          <StoreIcon className="size-5 text-muted-foreground" />
        </div>
      )}
      <div className="grid min-w-0 flex-1 gap-0.5">
        <p className="truncate text-sm font-medium">
          {listing ? listing.title : "Listing not found"}
        </p>
        <p className="text-xs text-muted-foreground">
          {!listing
            ? "It was deleted. The post skips this card."
            : listing.status === "draft"
              ? "Listing card · a draft, so the post skips it until it is published"
              : "Listing card"}
        </p>
      </div>
      {editor.isEditable ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={`Remove the ${listing?.title ?? "listing"} card`}
          onClick={deleteNode}
        >
          <Trash2Icon className="size-4" />
        </Button>
      ) : null}
    </NodeViewWrapper>
  )
}

/** Searches this site's listings and hands back the one picked. */
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
      // Keeps the selection alive while the button is pressed.
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
    >
      {children}
    </Button>
  )
}

function LinkPopover({ editor, active }: { editor: Editor; active?: boolean }) {
  const [open, setOpen] = React.useState(false)
  const [url, setUrl] = React.useState("")

  const apply = () => {
    if (!url.trim()) return
    editor
      .chain()
      .focus()
      .extendMarkRange("link")
      .setLink({ href: url.trim() })
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
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant={active ? "secondary" : "ghost"}
          size="icon-sm"
          aria-label="Link"
          title="Link"
        >
          <LinkIcon className="size-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-3" align="start">
        <div className="grid gap-2">
          <Label htmlFor="post-link-url">Link</Label>
          <Input
            id="post-link-url"
            value={url}
            placeholder="https://example.com"
            onChange={(event) => setUrl(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") apply()
            }}
          />
          <div className="flex justify-end gap-2">
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
            <Button
              type="button"
              size="sm"
              disabled={!url.trim()}
              onClick={apply}
            >
              Set link
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}

/** The shell's floating formatting bar, over whatever text is selected. */
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
      // A selected card is a whole block, not text, so there is nothing to
      // format.
      shouldShow={({ editor: current, from, to }) =>
        from !== to && !current.isActive(LISTING_CARD_NODE)
      }
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
      {/* Headings start at 2, because the post's title is its h1. */}
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
      <LinkPopover editor={editor} active={state?.link} />
    </BubbleMenu>
  )
}

function ToolbarDivider() {
  return <div className="mx-1 h-5 w-px bg-border" />
}
