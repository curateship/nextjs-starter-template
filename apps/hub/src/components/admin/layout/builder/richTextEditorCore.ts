"use client"

import { useCallback, useEffect, useRef, useState, type MutableRefObject, type RefObject } from "react"
import type { Editor } from "@tiptap/core"
import { mergeAttributes } from "@tiptap/core"
import { NodeSelection } from "@tiptap/pm/state"
import type { EditorProps } from "@tiptap/pm/view"
import Image from "@tiptap/extension-image"

export interface RichTextRange {
  from: number
  to: number
}

function normalizeLinkedImageAttribute(value: string | null): string | null {
  return value && value.trim().length > 0 ? value : null
}

function getLinkedImageAttributes(element: HTMLElement) {
  const imageElement = element instanceof HTMLImageElement ? element : element.querySelector("img[src]")

  if (!(imageElement instanceof HTMLImageElement)) {
    return false
  }

  const linkElement = imageElement.closest("a[href]")

  return {
    src: normalizeLinkedImageAttribute(imageElement.getAttribute("src")),
    alt: normalizeLinkedImageAttribute(imageElement.getAttribute("alt")),
    title: normalizeLinkedImageAttribute(imageElement.getAttribute("title")),
    width: normalizeLinkedImageAttribute(imageElement.getAttribute("width")),
    height: normalizeLinkedImageAttribute(imageElement.getAttribute("height")),
    href: normalizeLinkedImageAttribute(linkElement?.getAttribute("href") ?? null),
    target: normalizeLinkedImageAttribute(linkElement?.getAttribute("target") ?? null),
    rel: normalizeLinkedImageAttribute(linkElement?.getAttribute("rel") ?? null),
  }
}

export const LinkedImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      href: {
        default: null,
      },
      target: {
        default: "_blank",
      },
      rel: {
        default: "noopener noreferrer nofollow",
      },
    }
  },

  parseHTML() {
    const imageSelector = this.options.allowBase64 ? "img[src]" : 'img[src]:not([src^="data:"])'

    return [
      {
        tag: `a[href] ${imageSelector}`,
        getAttrs: (element) => getLinkedImageAttributes(element as HTMLElement),
      },
      {
        tag: imageSelector,
        getAttrs: (element) => getLinkedImageAttributes(element as HTMLElement),
      },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    const { href, target, rel, ...imageAttributes } = HTMLAttributes
    const mergedImageAttributes = mergeAttributes(this.options.HTMLAttributes, imageAttributes)

    if (!href) {
      return ["img", mergedImageAttributes]
    }

    return ["a", mergeAttributes({ href }, target ? { target } : {}, rel ? { rel } : {}), ["img", mergedImageAttributes]]
  },
})

function getLinkedImageEventTarget(event: Event) {
  const target = event.target

  if (!(target instanceof HTMLElement)) {
    return null
  }

  const imageElement = target.closest("img")
  const linkElement = target.closest("a[href]")

  if (!(imageElement instanceof HTMLImageElement) || !linkElement) {
    return null
  }

  return imageElement
}

export function createRichTextEditorProps(editorProps: EditorProps = {}): EditorProps {
  const { handleDOMEvents, ...restEditorProps } = editorProps

  return {
    ...restEditorProps,
    handleDOMEvents: {
      mousedown: (view, event) => {
        const imageElement = getLinkedImageEventTarget(event)

        if (!imageElement || !view.dom.contains(imageElement)) {
          return false
        }

        event.preventDefault()
        view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, view.posAtDOM(imageElement, 0))))
        view.focus()
        return true
      },
      click: (_view, event) => {
        const imageElement = getLinkedImageEventTarget(event)

        if (!imageElement) {
          return false
        }

        event.preventDefault()
        return true
      },
      ...handleDOMEvents,
    },
    transformPastedText(text) {
      return text.replace(/(?<!\n)\n(?!\n)/g, "\n\n")
    },
    transformPastedHTML(html) {
      return html
        .replace(/<br\s*\/?>\s*<br\s*\/?>/gi, "</p><p>")
        .replace(/<div>/gi, "<p>")
        .replace(/<\/div>/gi, "</p>")
    },
  }
}

export function useRichTextContentSync(
  editor: Editor | null,
  content: string,
  pendingContentRef: MutableRefObject<string | null>,
  fallbackContent?: string,
) {
  useEffect(() => {
    if (!editor) {
      return
    }

    if (pendingContentRef.current === content) {
      pendingContentRef.current = null
      return
    }

    if (pendingContentRef.current !== null) {
      return
    }

    const nextContent = content || fallbackContent || ""

    if (editor.getHTML() !== nextContent) {
      editor.commands.setContent(nextContent)
    }
  }, [content, editor, fallbackContent, pendingContentRef])
}

export function useRichTextLinkDialog(editor: Editor | null) {
  const pendingLinkTargetRef = useRef<{ range: RichTextRange; isImage: boolean } | null>(null)
  const [isLinkDialogOpen, setIsLinkDialogOpen] = useState(false)
  const [linkUrl, setLinkUrl] = useState("")

  const handleLinkDialogOpenChange = useCallback((open: boolean) => {
    setIsLinkDialogOpen(open)
    if (!open) {
      pendingLinkTargetRef.current = null
    }
  }, [])

  const openLinkDialog = useCallback(() => {
    if (!editor) {
      return
    }

    const selection = editor.state.selection
    const { from, to } = selection
    const imageSelection = selection instanceof NodeSelection && selection.node.type.name === "image" ? selection : null

    pendingLinkTargetRef.current = {
      range: { from, to },
      isImage: Boolean(imageSelection),
    }
    setLinkUrl(imageSelection ? imageSelection.node.attrs.href || "" : editor.getAttributes("link").href || "")
    setIsLinkDialogOpen(true)
  }, [editor])

  const applyLink = useCallback(() => {
    if (!editor || !pendingLinkTargetRef.current) {
      return
    }

    const nextUrl = linkUrl.trim()
    const { range, isImage } = pendingLinkTargetRef.current

    if (isImage) {
      editor
        .chain()
        .focus()
        .setNodeSelection(range.from)
        .updateAttributes("image", {
          href: nextUrl || null,
          target: nextUrl ? "_blank" : null,
          rel: nextUrl ? "noopener noreferrer nofollow" : null,
        })
        .run()
    } else {
      const chain = editor.chain().focus().setTextSelection(range).extendMarkRange("link")

      if (!nextUrl) {
        chain.unsetLink().run()
      } else {
        chain.setLink({ href: nextUrl }).run()
      }
    }

    pendingLinkTargetRef.current = null
    setIsLinkDialogOpen(false)
  }, [editor, linkUrl])

  const removeLink = useCallback(() => {
    if (!editor || !pendingLinkTargetRef.current) {
      return
    }

    const { range, isImage } = pendingLinkTargetRef.current

    if (isImage) {
      editor
        .chain()
        .focus()
        .setNodeSelection(range.from)
        .updateAttributes("image", {
          href: null,
          target: null,
          rel: null,
        })
        .run()
    } else {
      editor.chain().focus().setTextSelection(range).extendMarkRange("link").unsetLink().run()
    }

    pendingLinkTargetRef.current = null
    setLinkUrl("")
    setIsLinkDialogOpen(false)
  }, [editor])

  return {
    applyLink,
    handleLinkDialogOpenChange,
    isLinkDialogOpen,
    linkUrl,
    openLinkDialog,
    removeLink,
    setLinkUrl,
  }
}

export function useSelectedRichTextImageControls(
  editor: Editor | null,
  surfaceRef: RefObject<HTMLElement | null>,
  options: { trackScroll?: boolean } = {},
) {
  const [selectedImageButtonPosition, setSelectedImageButtonPosition] = useState<{ top: number; left: number } | null>(
    null,
  )

  const updateSelectedImageButtonPosition = useCallback(() => {
    if (!editor || !surfaceRef.current) {
      setSelectedImageButtonPosition(null)
      return
    }

    const { selection } = editor.state
    if (!(selection instanceof NodeSelection) || selection.node.type.name !== "image") {
      setSelectedImageButtonPosition(null)
      return
    }

    const imageElement = editor.view.nodeDOM(selection.from)
    if (!(imageElement instanceof HTMLElement)) {
      setSelectedImageButtonPosition(null)
      return
    }

    const surfaceRect = surfaceRef.current.getBoundingClientRect()
    const imageRect = imageElement.getBoundingClientRect()
    const buttonSize = 36
    const padding = 8

    setSelectedImageButtonPosition({
      top: Math.max(padding, imageRect.top - surfaceRect.top + padding),
      left: Math.max(
        padding,
        Math.min(surfaceRect.width - buttonSize - padding, imageRect.right - surfaceRect.left - buttonSize - padding),
      ),
    })
  }, [editor, surfaceRef])

  const handleDeleteSelectedImage = useCallback(() => {
    if (!editor) {
      return
    }

    const { selection } = editor.state
    if (!(selection instanceof NodeSelection) || selection.node.type.name !== "image") {
      return
    }

    editor.chain().focus().deleteSelection().run()
    setSelectedImageButtonPosition(null)
  }, [editor])

  const clearSelectedImageButtonPosition = useCallback(() => {
    setSelectedImageButtonPosition(null)
  }, [])

  useEffect(() => {
    if (!editor) {
      return
    }

    const syncSelectedImageButton = () => {
      window.requestAnimationFrame(updateSelectedImageButtonPosition)
    }

    syncSelectedImageButton()
    editor.on("selectionUpdate", syncSelectedImageButton)
    editor.on("transaction", syncSelectedImageButton)
    editor.on("focus", syncSelectedImageButton)
    editor.on("blur", syncSelectedImageButton)

    return () => {
      editor.off("selectionUpdate", syncSelectedImageButton)
      editor.off("transaction", syncSelectedImageButton)
      editor.off("focus", syncSelectedImageButton)
      editor.off("blur", syncSelectedImageButton)
    }
  }, [editor, updateSelectedImageButtonPosition])

  useEffect(() => {
    if (!selectedImageButtonPosition) {
      return
    }

    const syncSelectedImageButton = () => {
      updateSelectedImageButtonPosition()
    }

    window.addEventListener("resize", syncSelectedImageButton)
    if (options.trackScroll) {
      window.addEventListener("scroll", syncSelectedImageButton, true)
    }

    return () => {
      window.removeEventListener("resize", syncSelectedImageButton)
      if (options.trackScroll) {
        window.removeEventListener("scroll", syncSelectedImageButton, true)
      }
    }
  }, [options.trackScroll, selectedImageButtonPosition, updateSelectedImageButtonPosition])

  return {
    clearSelectedImageButtonPosition,
    handleDeleteSelectedImage,
    selectedImageButtonPosition,
  }
}
