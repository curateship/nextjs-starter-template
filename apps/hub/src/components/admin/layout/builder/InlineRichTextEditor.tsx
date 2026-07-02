"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import type { Editor } from "@tiptap/core"
import { posToDOMRect } from "@tiptap/core"
import { NodeSelection } from "@tiptap/pm/state"
import { EditorContent, useEditor, useEditorState } from "@tiptap/react"
import { BubbleMenu } from "@tiptap/react/menus"
import StarterKit from "@tiptap/starter-kit"
import Placeholder from "@tiptap/extension-placeholder"
import Link from "@tiptap/extension-link"
import { Button } from "@/components/ui/button"
import { MediaPicker } from "@/components/admin/media-library/MediaPicker"
import { SponsorPickerDialog } from "@/components/admin/sponsors/SponsorPickerDialog"
import { Dialog, DialogContent, DialogFooter, DialogFooterActions, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Bold,
  Heading1,
  Heading2,
  Heading3,
  Heading4,
  Handshake,
  ImageIcon,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  Pilcrow,
  Quote,
  Trash2,
} from "lucide-react"
import { cn } from "@/lib/utils/tailwind"
import { DEFAULT_NEWSLETTER_IMAGE_BORDER_COLOR, normalizeNewsletterRichTextHtml } from "@/lib/actions/newsletters/render"
import type { SponsorPublic } from "@/lib/actions/sponsors/sponsor-actions"
import { SponsorEmbed } from "@/components/admin/layout/builder/InlineRichTextSponsorEmbed"
import {
  createRichTextEditorProps,
  LinkedImage,
  useRichTextContentSync,
  useRichTextLinkDialog,
  useSelectedRichTextImageControls,
} from "./richTextEditorCore"

type InlineRichTextEditorVariant = "newsletter" | "post" | "directory" | "page" | "product" | "event"
type ProseEditorVariant = Exclude<InlineRichTextEditorVariant, "newsletter">

interface InlineRichTextEditorProps {
  blockId: string
  content: Record<string, any>
  onContentChange: (htmlContent: string) => void
  siteId: string
  scrollTarget?: HTMLElement | null
  isActive: boolean
  editorPadding?: number
  variant?: InlineRichTextEditorVariant
  placeholder?: string
  hidePlaceholderOnFocus?: boolean
}

interface SlashCommandRange {
  from: number
  to: number
}

interface SlashCommandMenuState {
  query: string
  range: SlashCommandRange
  position: {
    top: number
    left: number
  }
  signature: string
}

interface SlashCommandDefinition {
  id: string
  label: string
  description: string
  keywords: string[]
  icon: React.ComponentType<{ className?: string }>
  run: (editor: Editor, range: SlashCommandRange) => void
}

const SLASH_MENU_WIDTH = 320
const SLASH_MENU_MODAL_INSET = 12
const PROSE_EDITOR_CLASS =
  "prose dark:prose-invert max-w-none w-full text-left [&_h2]:scroll-mt-24 [&_.ProseMirror]:text-black dark:[&_.ProseMirror]:text-white"
const PROSE_EDITOR_TEXT_CLASS: Record<ProseEditorVariant, string> = {
  post: "[&_.ProseMirror]:text-lg",
  directory: "[&_.ProseMirror]:text-base",
  page: "[&_.ProseMirror]:text-lg",
  product: "[&_.ProseMirror]:text-lg",
  event: "[&_.ProseMirror]:text-lg",
}
const EDITOR_CONTENT_CLASS: Record<InlineRichTextEditorVariant, string> = {
  post: "post-inline-rich-text [&_.ProseMirror]:min-h-[160px] [&_.ProseMirror]:outline-none [&_.ProseMirror]:whitespace-pre-wrap",
  event:
    "event-inline-rich-text [&_.ProseMirror]:min-h-[160px] [&_.ProseMirror]:outline-none [&_.ProseMirror]:whitespace-pre-wrap",
  directory:
    "directory-inline-rich-text [&_.ProseMirror]:min-h-0 [&_.ProseMirror]:outline-none [&_.ProseMirror]:whitespace-pre-wrap",
  page: "page-inline-rich-text [&_.ProseMirror]:min-h-0 [&_.ProseMirror]:outline-none [&_.ProseMirror]:whitespace-pre-wrap",
  product:
    "product-inline-rich-text [&_.ProseMirror]:min-h-0 [&_.ProseMirror]:outline-none [&_.ProseMirror]:whitespace-pre-wrap",
  newsletter:
    "newsletter-email-rich-text [&_.ProseMirror]:min-h-[80px] [&_.ProseMirror]:outline-none [&_.ProseMirror]:whitespace-pre-wrap",
}

const BASE_SLASH_COMMANDS: SlashCommandDefinition[] = [
  {
    id: "paragraph",
    label: "Text",
    description: "Plain paragraph",
    keywords: ["paragraph", "text", "body", "normal"],
    icon: Pilcrow,
    run: (editor, range) => {
      editor.chain().focus().deleteRange(range).setParagraph().run()
    },
  },
  {
    id: "heading-1",
    label: "Heading 1",
    description: "Large section heading",
    keywords: ["heading", "title", "h1"],
    icon: Heading1,
    run: (editor, range) => {
      editor.chain().focus().deleteRange(range).setHeading({ level: 1 }).run()
    },
  },
  {
    id: "heading-2",
    label: "Heading 2",
    description: "Medium section heading",
    keywords: ["heading", "subtitle", "h2"],
    icon: Heading2,
    run: (editor, range) => {
      editor.chain().focus().deleteRange(range).setHeading({ level: 2 }).run()
    },
  },
  {
    id: "heading-3",
    label: "Heading 3",
    description: "Compact section heading",
    keywords: ["heading", "subheading", "h3"],
    icon: Heading3,
    run: (editor, range) => {
      editor.chain().focus().deleteRange(range).setHeading({ level: 3 }).run()
    },
  },
  {
    id: "heading-4",
    label: "Heading 4",
    description: "Small heading",
    keywords: ["heading", "h4"],
    icon: Heading3,
    run: (editor, range) => {
      editor.chain().focus().deleteRange(range).setHeading({ level: 4 }).run()
    },
  },
  {
    id: "heading-5",
    label: "Heading 5",
    description: "Compact heading",
    keywords: ["heading", "h5"],
    icon: Heading3,
    run: (editor, range) => {
      editor.chain().focus().deleteRange(range).setHeading({ level: 5 }).run()
    },
  },
  {
    id: "heading-6",
    label: "Heading 6",
    description: "Fine heading",
    keywords: ["heading", "h6"],
    icon: Heading3,
    run: (editor, range) => {
      editor.chain().focus().deleteRange(range).setHeading({ level: 6 }).run()
    },
  },
  {
    id: "bullet-list",
    label: "Bullet list",
    description: "Start a bulleted list",
    keywords: ["list", "bullet", "unordered", "ul"],
    icon: List,
    run: (editor, range) => {
      editor.chain().focus().deleteRange(range).toggleBulletList().run()
    },
  },
  {
    id: "ordered-list",
    label: "Numbered list",
    description: "Start a numbered list",
    keywords: ["list", "ordered", "numbered", "ol"],
    icon: ListOrdered,
    run: (editor, range) => {
      editor.chain().focus().deleteRange(range).toggleOrderedList().run()
    },
  },
  {
    id: "blockquote",
    label: "Quote",
    description: "Format as a quote",
    keywords: ["quote", "blockquote", "callout"],
    icon: Quote,
    run: (editor, range) => {
      editor.chain().focus().deleteRange(range).toggleBlockquote().run()
    },
  },
]

function getSlashMenuState(editor: Editor): SlashCommandMenuState | null {
  const { selection } = editor.state

  if (!selection.empty || !editor.isEditable || !editor.view.hasFocus()) {
    return null
  }

  const { $from, from, to } = selection
  const textBeforeCursor = $from.parent.textBetween(0, $from.parentOffset, "\n", "\0")
  const match = /(?:^|\s)\/([^\s/]*)$/.exec(textBeforeCursor)

  if (!match) {
    return null
  }

  const matchText = match[0]
  const query = match[1] || ""
  const slashOffset = textBeforeCursor.length - matchText.length + (matchText.startsWith("/") ? 0 : 1)
  const slashFrom = $from.start() + slashOffset
  const rect = posToDOMRect(editor.view, slashFrom, to)
  const maxLeft = typeof window === "undefined" ? rect.left : window.innerWidth - SLASH_MENU_WIDTH - 12

  return {
    query,
    range: {
      from: slashFrom,
      to: from,
    },
    position: {
      top: rect.bottom + 8,
      left: Math.max(12, Math.min(rect.left, maxLeft)),
    },
    signature: `${slashFrom}:${to}:${query}`,
  }
}

export function InlineRichTextEditor({
  blockId,
  content,
  onContentChange,
  siteId,
  scrollTarget,
  isActive,
  editorPadding,
  variant = "newsletter",
  placeholder = "Write your content here...",
  hidePlaceholderOnFocus = false,
}: InlineRichTextEditorProps) {
  const pendingContentRef = useRef<string | null>(null)
  const pendingImageRangeRef = useRef<SlashCommandRange | null>(null)
  const pendingSponsorRangeRef = useRef<SlashCommandRange | null>(null)
  const activationPositionRef = useRef<{ left: number; top: number } | null>(null)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const slashMenuElementRef = useRef<HTMLDivElement | null>(null)
  const slashMenuInteractingRef = useRef(false)
  const slashMenuInteractionTimeoutRef = useRef<number | null>(null)
  const slashMenuPreserveAfterInteractionRef = useRef(false)
  const slashMenuRef = useRef<SlashCommandMenuState | null>(null)
  const slashCommandPointerStartRef = useRef<{ x: number; y: number } | null>(null)
  const slashCommandPointerMovedRef = useRef(false)
  const dismissedSlashSignatureRef = useRef<string | null>(null)
  const selectedSlashIndexRef = useRef(0)
  const filteredSlashCommandsRef = useRef<SlashCommandDefinition[]>([])
  const [slashMenu, setSlashMenu] = useState<SlashCommandMenuState | null>(null)
  const [selectedSlashIndex, setSelectedSlashIndex] = useState(0)
  const [isImagePickerOpen, setIsImagePickerOpen] = useState(false)
  const [isSponsorPickerOpen, setIsSponsorPickerOpen] = useState(false)
  const normalizedContent = useMemo(
    () => normalizeNewsletterRichTextHtml(content.htmlContent || ""),
    [content.htmlContent],
  )
  const imageBorderSize = Math.max(0, Math.min(48, parseInt(String(content.imageBorderSize ?? 0), 10) || 0))
  const imageBorderColor = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(content.imageBorderColor || "")
    ? content.imageBorderColor
    : DEFAULT_NEWSLETTER_IMAGE_BORDER_COLOR
  const supportsSponsors = variant === "post" || variant === "newsletter"

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        code: false,
        codeBlock: false,
        horizontalRule: false,
        strike: false,
        link: false,
        heading: {
          levels: [1, 2, 3, 4, 5, 6],
        },
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          rel: "noopener noreferrer nofollow",
          class: "text-blue-600 underline",
        },
      }),
      Placeholder.configure({
        placeholder,
        showOnlyWhenEditable: !hidePlaceholderOnFocus,
      }),
      LinkedImage.configure({
        HTMLAttributes: {
          class: "max-w-full h-auto",
        },
      }),
      ...(supportsSponsors ? [SponsorEmbed.configure({ siteId })] : []),
    ],
    content: normalizedContent,
    immediatelyRender: false,
    editable: isActive,
    editorProps: createRichTextEditorProps({
      handleKeyDown: (_view, event) => {
        if (!slashMenuRef.current) {
          return false
        }

        if (event.key === "ArrowDown") {
          event.preventDefault()
          setSelectedSlashIndex((currentIndex) => {
            if (filteredSlashCommandsRef.current.length === 0) {
              return 0
            }

            return (currentIndex + 1) % filteredSlashCommandsRef.current.length
          })
          return true
        }

        if (event.key === "ArrowUp") {
          event.preventDefault()
          setSelectedSlashIndex((currentIndex) => {
            if (filteredSlashCommandsRef.current.length === 0) {
              return 0
            }

            return (currentIndex - 1 + filteredSlashCommandsRef.current.length) % filteredSlashCommandsRef.current.length
          })
          return true
        }

        if (event.key === "Enter") {
          if (!editor) {
            return false
          }

          const command = filteredSlashCommandsRef.current[selectedSlashIndexRef.current]
          if (!command) {
            return true
          }

          event.preventDefault()
          runSlashCommand(command, slashMenuRef.current.range)
          return true
        }

        if (event.key === "Escape") {
          event.preventDefault()
          dismissedSlashSignatureRef.current = slashMenuRef.current.signature
          setSlashMenu(null)
          return true
        }

        return false
      },
      attributes: {
        class: "outline-none min-h-[80px]",
      },
    }),
    onUpdate: ({ editor: currentEditor }) => {
      const html = normalizeNewsletterRichTextHtml(currentEditor.getHTML())
      pendingContentRef.current = html
      onContentChange(html)
    },
  })

  useRichTextContentSync(editor, normalizedContent, pendingContentRef, "<p></p>")

  const {
    applyLink,
    handleLinkDialogOpenChange,
    isLinkDialogOpen,
    linkUrl,
    openLinkDialog: handleLink,
    removeLink,
    setLinkUrl,
  } = useRichTextLinkDialog(editor)

  const {
    clearSelectedImageButtonPosition,
    handleDeleteSelectedImage,
    selectedImageButtonPosition,
  } = useSelectedRichTextImageControls(editor, rootRef)

  const handleImageSelect = useCallback(
    (imageUrl: string, altText?: string) => {
      if (!editor || !imageUrl) {
        return
      }

      const range = pendingImageRangeRef.current
      const command = editor.chain().focus()

      if (range) {
        command.deleteRange(range)
      }

      command.setImage({ src: imageUrl, alt: altText || "" }).run()
      pendingImageRangeRef.current = null
    },
    [editor],
  )

  const handleImagePickerOpenChange = useCallback((open: boolean) => {
    setIsImagePickerOpen(open)
    if (!open) {
      pendingImageRangeRef.current = null
    }
  }, [])

  const handleSponsorSelect = useCallback(
    (sponsor: SponsorPublic) => {
      if (!editor) {
        return
      }

      const range = pendingSponsorRangeRef.current
      const command = editor.chain().focus()

      if (range) {
        command.deleteRange(range)
      }

      command.insertContent({ type: "sponsor", attrs: { sponsorId: sponsor.id } }).run()
      pendingSponsorRangeRef.current = null
    },
    [editor],
  )

  const handleSponsorPickerOpenChange = useCallback((open: boolean) => {
    setIsSponsorPickerOpen(open)
    if (!open) {
      pendingSponsorRangeRef.current = null
    }
  }, [])

  const slashCommands = useMemo(() => {
    const commands = [...BASE_SLASH_COMMANDS]

    if (siteId) {
      commands.push({
        id: "image",
        label: "Image",
        description: "Insert image from media library",
        keywords: ["image", "photo", "picture", "media", "upload"],
        icon: ImageIcon,
        run: (_editor: Editor, range: SlashCommandRange) => {
          pendingImageRangeRef.current = range
          setSlashMenu(null)
          setIsImagePickerOpen(true)
        },
      })
    }

    if (siteId && supportsSponsors) {
      commands.push({
        id: "sponsor",
        label: "Sponsor",
        description: "Insert a sponsor card",
        keywords: ["sponsor", "ad", "advertisement", "partner"],
        icon: Handshake,
        run: (_editor: Editor, range: SlashCommandRange) => {
          pendingSponsorRangeRef.current = range
          setSlashMenu(null)
          setIsSponsorPickerOpen(true)
        },
      })
    }

    return commands
  }, [siteId, supportsSponsors])

  useEffect(() => {
    if (!editor) {
      return
    }

    editor.setEditable(isActive)
  }, [editor, isActive])

  useEffect(() => {
    if (!editor || !isActive) {
      return
    }

    const nextPosition = activationPositionRef.current
    activationPositionRef.current = null

    window.requestAnimationFrame(() => {
      if (!editor) {
        return
      }

      if (nextPosition) {
        const targetPosition = editor.view.posAtCoords(nextPosition)

        if (targetPosition) {
          editor.chain().focus(targetPosition.pos).run()
          return
        }
      }

      editor.commands.focus()
    })
  }, [editor, isActive])

  useEffect(() => {
    if (isActive) {
      return
    }

    setSlashMenu(null)
    clearSelectedImageButtonPosition()
  }, [clearSelectedImageButtonPosition, isActive])

  const filteredSlashCommands = useMemo(() => {
    if (!slashMenu) {
      return []
    }

    const normalizedQuery = slashMenu.query.trim().toLowerCase()
    if (!normalizedQuery) {
      return slashCommands
    }

    return slashCommands.filter((command) => {
      const haystack = [command.label, command.description, ...command.keywords].join(" ").toLowerCase()
      return haystack.includes(normalizedQuery)
    })
  }, [slashCommands, slashMenu])

  useEffect(() => {
    filteredSlashCommandsRef.current = filteredSlashCommands
  }, [filteredSlashCommands])

  useEffect(() => {
    selectedSlashIndexRef.current = selectedSlashIndex
  }, [selectedSlashIndex])

  useEffect(() => {
    slashMenuRef.current = slashMenu
  }, [slashMenu])

  useEffect(() => {
    setSelectedSlashIndex(0)
  }, [slashMenu?.signature])

  useEffect(() => {
    if (selectedSlashIndex < filteredSlashCommands.length) {
      return
    }

    setSelectedSlashIndex(filteredSlashCommands.length > 0 ? filteredSlashCommands.length - 1 : 0)
  }, [filteredSlashCommands.length, selectedSlashIndex])

  const runSlashCommand = useCallback(
    (command: SlashCommandDefinition, range: SlashCommandRange) => {
      if (!editor) {
        return
      }

      command.run(editor, range)
      dismissedSlashSignatureRef.current = null
      slashMenuPreserveAfterInteractionRef.current = false
      slashMenuInteractingRef.current = false
      setSlashMenu(null)
    },
    [editor],
  )

  const keepSlashMenuInteraction = useCallback(() => {
    if (slashMenuInteractionTimeoutRef.current !== null) {
      window.clearTimeout(slashMenuInteractionTimeoutRef.current)
      slashMenuInteractionTimeoutRef.current = null
    }

    slashMenuInteractingRef.current = true
    slashMenuPreserveAfterInteractionRef.current = true
  }, [])

  const releaseSlashMenuInteraction = useCallback(() => {
    if (!slashMenuInteractingRef.current) {
      return
    }

    if (slashMenuInteractionTimeoutRef.current !== null) {
      window.clearTimeout(slashMenuInteractionTimeoutRef.current)
    }

    slashMenuInteractionTimeoutRef.current = window.setTimeout(() => {
      slashMenuInteractingRef.current = false
      slashMenuInteractionTimeoutRef.current = null
    }, 250)
  }, [])

  const refreshSlashMenu = useCallback(() => {
    if (!editor) {
      return
    }

    const nextSlashMenu = getSlashMenuState(editor)

    setSlashMenu((currentSlashMenu) => {
      if (!nextSlashMenu) {
        dismissedSlashSignatureRef.current = null
        if (
          slashMenuInteractingRef.current ||
          slashCommandPointerStartRef.current ||
          currentSlashMenu && slashMenuPreserveAfterInteractionRef.current && !editor.view.hasFocus()
        ) {
          return currentSlashMenu
        }

        slashMenuPreserveAfterInteractionRef.current = false
        return currentSlashMenu === null ? currentSlashMenu : null
      }

      if (dismissedSlashSignatureRef.current === nextSlashMenu.signature) {
        return currentSlashMenu === null ? currentSlashMenu : null
      }

      if (
        currentSlashMenu &&
        currentSlashMenu.signature === nextSlashMenu.signature &&
        currentSlashMenu.position.top === nextSlashMenu.position.top &&
        currentSlashMenu.position.left === nextSlashMenu.position.left
      ) {
        return currentSlashMenu
      }

      return nextSlashMenu
    })
  }, [editor])

  useEffect(() => {
    if (!slashMenu) {
      return
    }

    const isInsideSlashMenu = (event: PointerEvent | MouseEvent | WheelEvent) => {
      const rect = slashMenuElementRef.current?.getBoundingClientRect()
      return Boolean(
        rect &&
        event.clientX >= rect.left &&
        event.clientX <= rect.right &&
        event.clientY >= rect.top &&
        event.clientY <= rect.bottom,
      )
    }

    const handleInteractionStart = (event: PointerEvent | MouseEvent) => {
      if (isInsideSlashMenu(event)) {
        keepSlashMenuInteraction()
        return
      }

      if (event.target instanceof Node && rootRef.current?.contains(event.target)) {
        return
      }

      slashMenuPreserveAfterInteractionRef.current = false
      slashMenuInteractingRef.current = false
      setSlashMenu(null)
    }

    const handleWheel = (event: WheelEvent) => {
      if (isInsideSlashMenu(event)) {
        keepSlashMenuInteraction()
        event.stopPropagation()
      }
    }

    document.addEventListener("pointerdown", handleInteractionStart, true)
    document.addEventListener("pointerup", releaseSlashMenuInteraction, true)
    document.addEventListener("pointercancel", releaseSlashMenuInteraction, true)
    document.addEventListener("mousedown", handleInteractionStart, true)
    document.addEventListener("mouseup", releaseSlashMenuInteraction, true)
    document.addEventListener("wheel", handleWheel, true)

    return () => {
      document.removeEventListener("pointerdown", handleInteractionStart, true)
      document.removeEventListener("pointerup", releaseSlashMenuInteraction, true)
      document.removeEventListener("pointercancel", releaseSlashMenuInteraction, true)
      document.removeEventListener("mousedown", handleInteractionStart, true)
      document.removeEventListener("mouseup", releaseSlashMenuInteraction, true)
      document.removeEventListener("wheel", handleWheel, true)
      if (slashMenuInteractionTimeoutRef.current !== null) {
        window.clearTimeout(slashMenuInteractionTimeoutRef.current)
        slashMenuInteractionTimeoutRef.current = null
      }
      slashMenuInteractingRef.current = false
      slashMenuPreserveAfterInteractionRef.current = false
    }
  }, [keepSlashMenuInteraction, releaseSlashMenuInteraction, slashMenu])

  useEffect(() => {
    if (!editor) {
      return
    }

    refreshSlashMenu()

    editor.on("selectionUpdate", refreshSlashMenu)
    editor.on("transaction", refreshSlashMenu)
    editor.on("focus", refreshSlashMenu)

    return () => {
      editor.off("selectionUpdate", refreshSlashMenu)
      editor.off("transaction", refreshSlashMenu)
      editor.off("focus", refreshSlashMenu)
    }
  }, [editor, refreshSlashMenu])

  useEffect(() => {
    if (!slashMenu) {
      return
    }

    const updatePosition = () => {
      window.requestAnimationFrame(refreshSlashMenu)
    }

    const resolvedScrollTarget = scrollTarget ?? window

    window.addEventListener("resize", updatePosition)
    resolvedScrollTarget.addEventListener("scroll", updatePosition)

    return () => {
      window.removeEventListener("resize", updatePosition)
      resolvedScrollTarget.removeEventListener("scroll", updatePosition)
    }
  }, [refreshSlashMenu, scrollTarget, slashMenu])

  const editorState = useEditorState({
    editor,
    selector: ({ editor: currentEditor }) => ({
      isBold: currentEditor?.isActive("bold") ?? false,
      isItalic: currentEditor?.isActive("italic") ?? false,
      isHeading1: currentEditor?.isActive("heading", { level: 1 }) ?? false,
      isHeading2: currentEditor?.isActive("heading", { level: 2 }) ?? false,
      isHeading3: currentEditor?.isActive("heading", { level: 3 }) ?? false,
      isHeading4: currentEditor?.isActive("heading", { level: 4 }) ?? false,
      isBulletList: currentEditor?.isActive("bulletList") ?? false,
      isOrderedList: currentEditor?.isActive("orderedList") ?? false,
      isBlockquote: currentEditor?.isActive("blockquote") ?? false,
      isLink:
        currentEditor?.isActive("link") ||
        (currentEditor?.state.selection instanceof NodeSelection &&
          currentEditor.state.selection.node.type.name === "image" &&
          Boolean(currentEditor.state.selection.node.attrs.href)) ||
        false,
    }),
  })

  if (!editor) {
    return null
  }

  const resolvedScrollTarget = scrollTarget ?? (typeof window === "undefined" ? undefined : window)
  const slashMenuHeight = Math.min(320, Math.max(72, filteredSlashCommands.length * 56 + 8))
  const slashMenuDialogContainer = (rootRef.current?.closest("[role='dialog']") as HTMLElement | null) ?? null
  const slashMenuPortalContainer = slashMenuDialogContainer ?? (typeof document === "undefined" ? null : document.body)
  const slashMenuDialogRect = slashMenuDialogContainer?.getBoundingClientRect()
  const slashMenuPosition = slashMenu
    ? slashMenuDialogContainer && slashMenuDialogRect
      ? {
          top: Math.max(
            SLASH_MENU_MODAL_INSET,
            Math.min(
              slashMenu.position.top - slashMenuDialogRect.top,
              Math.max(SLASH_MENU_MODAL_INSET, slashMenuDialogRect.height - slashMenuHeight - SLASH_MENU_MODAL_INSET),
            ),
          ),
          left: Math.max(
            0,
            Math.min(
              slashMenu.position.left - slashMenuDialogRect.left,
              Math.max(0, slashMenuDialogRect.width - SLASH_MENU_WIDTH),
            ),
          ),
        }
      : typeof window === "undefined"
        ? null
        : {
            top: Math.max(
              SLASH_MENU_MODAL_INSET,
              Math.min(
                slashMenu.position.top,
                Math.max(SLASH_MENU_MODAL_INSET, window.innerHeight - slashMenuHeight - SLASH_MENU_MODAL_INSET),
              ),
            ),
            left: Math.max(
              SLASH_MENU_MODAL_INSET,
              Math.min(
                slashMenu.position.left,
                Math.max(SLASH_MENU_MODAL_INSET, window.innerWidth - SLASH_MENU_WIDTH - SLASH_MENU_MODAL_INSET),
              ),
            ),
          }
    : null
  const slashMenuNode = isActive && slashMenu && slashMenuPosition ? (
    <div
      ref={slashMenuElementRef}
      data-newsletter-inline-editor-menu="true"
      className={cn(slashMenuDialogContainer ? "absolute" : "fixed", "z-60")}
      style={{
        top: slashMenuPosition.top,
        left: slashMenuPosition.left,
        width: `${SLASH_MENU_WIDTH}px`,
      }}
      onPointerDown={(event) => {
        keepSlashMenuInteraction()
        event.stopPropagation()
      }}
      onMouseDownCapture={() => {
        keepSlashMenuInteraction()
      }}
      onMouseMove={(event) => {
        const pointerStart = slashCommandPointerStartRef.current
        if (!pointerStart) {
          return
        }

        if (Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y) > 8) {
          slashCommandPointerMovedRef.current = true
        }
      }}
      onWheel={(event) => {
        keepSlashMenuInteraction()
        event.stopPropagation()
      }}
    >
      <ScrollArea
        className="overscroll-contain rounded-xl border bg-background/95 shadow-xl backdrop-blur"
        style={{ height: `${slashMenuHeight}px` }}
      >
        {filteredSlashCommands.length === 0 ? (
          <div className="py-4 text-center text-sm text-muted-foreground">No commands found.</div>
        ) : (
          <div className="p-1 pr-3">
            {filteredSlashCommands.map((command, index) => {
              const Icon = command.icon

              return (
                <button
                  key={command.id}
                  type="button"
                  className={cn(
                    "flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm transition-colors",
                    index === selectedSlashIndex ? "bg-accent text-accent-foreground" : "hover:bg-accent/60",
                  )}
                  onPointerEnter={() => setSelectedSlashIndex(index)}
                  onMouseDown={(event) => {
                    slashCommandPointerStartRef.current = { x: event.clientX, y: event.clientY }
                    slashCommandPointerMovedRef.current = false
                    event.preventDefault()
                    event.stopPropagation()
                  }}
                  onClick={(event) => {
                    event.preventDefault()
                    event.stopPropagation()

                    const pointerStart = slashCommandPointerStartRef.current
                    const pointerMoved = slashCommandPointerMovedRef.current
                    slashCommandPointerStartRef.current = null
                    slashCommandPointerMovedRef.current = false

                    if (
                      pointerMoved ||
                      pointerStart &&
                      Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y) > 8
                    ) {
                      return
                    }

                    runSlashCommand(command, slashMenu.range)
                  }}
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-md border bg-muted/50">
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-medium">{command.label}</span>
                    <span className="truncate text-xs text-muted-foreground">{command.description}</span>
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </ScrollArea>
    </div>
  ) : null

  const isProseEditor = variant === "post" || variant === "directory" || variant === "page" || variant === "product"
  const editorContent = (
    <EditorContent
      editor={editor}
      className={EDITOR_CONTENT_CLASS[variant]}
      style={{
        ["--newsletter-image-border-size" as string]: `${imageBorderSize}px`,
        ["--newsletter-image-border-color" as string]: imageBorderColor,
      }}
    />
  )

  return (
    <div
      ref={rootRef}
      data-inline-newsletter-editor-root="true"
      data-inline-newsletter-block-id={blockId}
      className={cn("relative", hidePlaceholderOnFocus && "hide-placeholder-on-focus")}
      style={{
        backgroundColor: variant === "newsletter" ? content.backgroundColor || "#ffffff" : undefined,
      }}
      onMouseDownCapture={(event) => {
        if (isActive) {
          return
        }

        activationPositionRef.current = { left: event.clientX, top: event.clientY }
      }}
    >
      {isActive && (
        <BubbleMenu
          editor={editor}
          appendTo={() => rootRef.current ?? document.body}
          options={{
            placement: "top",
            offset: 10,
            shift: true,
            flip: true,
            scrollTarget: resolvedScrollTarget,
          }}
          className="z-20 flex items-center gap-1 rounded-lg border bg-background/95 p-1 shadow-lg backdrop-blur"
        >
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={cn("h-8 w-8 p-0", editorState?.isBold && "bg-primary/15")}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => editor.chain().focus().toggleBold().run()}
            title="Bold"
          >
            <Bold className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={cn("h-8 w-8 p-0", editorState?.isItalic && "bg-primary/15")}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => editor.chain().focus().toggleItalic().run()}
            title="Italic"
          >
            <Italic className="h-4 w-4" />
          </Button>
          <div className="mx-1 h-5 w-px bg-border" />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={cn("h-8 w-8 p-0", editorState?.isHeading1 && "bg-primary/15")}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
            title="Heading 1"
          >
            <Heading1 className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={cn("h-8 w-8 p-0", editorState?.isHeading2 && "bg-primary/15")}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            title="Heading 2"
          >
            <Heading2 className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={cn("h-8 w-8 p-0", editorState?.isHeading3 && "bg-primary/15")}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
            title="Heading 3"
          >
            <Heading3 className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={cn("h-8 w-8 p-0", editorState?.isHeading4 && "bg-primary/15")}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => editor.chain().focus().toggleHeading({ level: 4 }).run()}
            title="Heading 4"
          >
            <Heading4 className="h-4 w-4" />
          </Button>
          <div className="mx-1 h-5 w-px bg-border" />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={cn("h-8 w-8 p-0", editorState?.isBulletList && "bg-primary/15")}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            title="Bullet list"
          >
            <List className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={cn("h-8 w-8 p-0", editorState?.isOrderedList && "bg-primary/15")}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            title="Numbered list"
          >
            <ListOrdered className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={cn("h-8 w-8 p-0", editorState?.isBlockquote && "bg-primary/15")}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
            title="Quote"
          >
            <Quote className="h-4 w-4" />
          </Button>
          <div className="mx-1 h-5 w-px bg-border" />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={cn("h-8 w-8 p-0", editorState?.isLink && "bg-primary/15")}
            onMouseDown={(event) => event.preventDefault()}
            onClick={handleLink}
            title="Edit link"
          >
            <LinkIcon className="h-4 w-4" />
          </Button>
        </BubbleMenu>
      )}

      {isProseEditor ? (
        <div className={cn(PROSE_EDITOR_CLASS, PROSE_EDITOR_TEXT_CLASS[variant])}>
          {editorContent}
        </div>
      ) : (
        <table width="100%" cellPadding="0" cellSpacing="0" border={0}>
          <tbody>
            <tr>
              <td
                style={{
                  padding: `${editorPadding ?? content.padding ?? 20}px`,
                  fontFamily: "Arial, sans-serif",
                  fontSize: "16px",
                  lineHeight: 1.6,
                  color: "#333333",
                }}
              >
                {editorContent}
              </td>
            </tr>
          </tbody>
        </table>
      )}

      {isActive && selectedImageButtonPosition && (
        <Button
          type="button"
          variant="destructive"
          size="icon"
          className="absolute z-20 size-8 rounded-full shadow-lg"
          style={selectedImageButtonPosition}
          onMouseDown={(event) => {
            event.preventDefault()
            event.stopPropagation()
          }}
          onClick={(event) => {
            event.preventDefault()
            event.stopPropagation()
            handleDeleteSelectedImage()
          }}
          title="Delete image"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      )}

      {slashMenuPortalContainer && slashMenuNode
        ? createPortal(slashMenuNode, slashMenuPortalContainer)
        : slashMenuNode}

      <MediaPicker
        open={isImagePickerOpen}
        onOpenChange={handleImagePickerOpenChange}
        onSelectMedia={handleImageSelect}
        showVideos={false}
        site_id={siteId}
      />

      {supportsSponsors && (
        <SponsorPickerDialog
          open={isSponsorPickerOpen}
          onOpenChange={handleSponsorPickerOpenChange}
          siteId={siteId}
          onSelectSponsor={handleSponsorSelect}
        />
      )}

      <Dialog open={isLinkDialogOpen} onOpenChange={handleLinkDialogOpenChange}>
        <DialogContent data-newsletter-inline-link-dialog="true" className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit link</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor={`newsletter-inline-link-${blockId}`}>URL</Label>
            <Input
              id={`newsletter-inline-link-${blockId}`}
              value={linkUrl}
              onChange={(event) => setLinkUrl(event.target.value)}
              placeholder="https://example.com"
              autoFocus
            />
          </div>
          <DialogFooter>
            <DialogFooterActions>
              <Button type="button" variant="outline" onClick={removeLink}>
                Remove link
              </Button>
              <Button type="button" variant="ghost" onClick={() => handleLinkDialogOpenChange(false)}>
                Cancel
              </Button>
              <Button type="button" onClick={applyLink}>
                Apply
              </Button>
            </DialogFooterActions>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
