"use client"

import { useEditor, EditorContent } from '@tiptap/react'
import { NodeSelection } from '@tiptap/pm/state'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import TextAlign from '@tiptap/extension-text-align'
import Placeholder from '@tiptap/extension-placeholder'
import Image from '@tiptap/extension-image'
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { MediaPicker } from "@/components/admin/media-library/MediaPicker"
import DOMPurify from "dompurify"
import { 
  Bold, 
  Italic, 
  List, 
  ListOrdered, 
  Link as LinkIcon, 
  AlignLeft, 
  AlignCenter, 
  AlignRight,
  ImageIcon,
  Trash2,
  Eye,
  EyeOff
} from "lucide-react"
import { useState, useCallback, useEffect, useRef, type MouseEvent } from 'react'
import { cn } from "@/lib/utils/tailwind"

export interface RichTextEditorProps {
  content: {
    title?: string
    subtitle?: string
    headerAlign?: 'left' | 'center'
    content: string
    hideHeader?: boolean
    hideEditorHeader?: boolean
  }
  onContentChange: (content: { title?: string; subtitle?: string; headerAlign?: 'left' | 'center'; content: string }) => void
  compact?: boolean
  inline?: boolean
  placeholder?: string
  children?: React.ReactNode
  toolbarContent?: React.ReactNode
  contentClassName?: string
  mediaPickerSiteId?: string
}

export function RichTextEditor({
  content,
  onContentChange,
  compact = false,
  inline = false,
  placeholder,
  children,
  toolbarContent,
  contentClassName,
  mediaPickerSiteId,
}: RichTextEditorProps) {
  const [showPreview, setShowPreview] = useState(false)
  const [isImagePickerOpen, setIsImagePickerOpen] = useState(false)
  const [selectedImageButtonPosition, setSelectedImageButtonPosition] = useState<{ top: number; left: number } | null>(null)
  const pendingContentRef = useRef<string | null>(null)
  const editorSurfaceRef = useRef<HTMLDivElement | null>(null)
  
  const editor = useEditor({
    extensions: [
      StarterKit,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: 'text-blue-600 underline',
        },
      }),
      TextAlign.configure({
        types: ['heading', 'paragraph'],
      }),
      Placeholder.configure({
        placeholder: placeholder || 'Start writing...',
      }),
      Image.configure({
        HTMLAttributes: {
          class: 'max-w-full h-auto rounded-lg',
        },
      }),
    ],
    content: content.content,
    immediatelyRender: false,
    editorProps: {
      transformPastedText(text) {
        // Convert single newlines to double so Tiptap creates
        // separate <p> tags instead of <br> within one <p>
        return text.replace(/(?<!\n)\n(?!\n)/g, '\n\n')
      },
      transformPastedHTML(html) {
        // Convert <br> sequences and <div>s into paragraph breaks
        return html
          .replace(/<br\s*\/?>\s*<br\s*\/?>/gi, '</p><p>')
          .replace(/<div>/gi, '<p>')
          .replace(/<\/div>/gi, '</p>')
      },
    },
    onUpdate: ({ editor }) => {
      const html = editor.getHTML()
      pendingContentRef.current = html
      onContentChange({
        ...content,
        content: html
      })
    },
  })

  // Update editor content when content prop changes
  useEffect(() => {
    if (!editor) {
      return
    }

    if (pendingContentRef.current === content.content) {
      pendingContentRef.current = null
      return
    }

    if (pendingContentRef.current !== null) {
      return
    }

    if (content.content !== editor.getHTML()) {
      editor.commands.setContent(content.content)
    }
  }, [content.content, editor])

  const handleTitleChange = (value: string) => {
    onContentChange({
      ...content,
      title: value
    })
  }

  const handleSubtitleChange = (value: string) => {
    onContentChange({
      ...content,
      subtitle: value
    })
  }

  const handleHeaderAlignChange = (value: 'left' | 'center') => {
    onContentChange({
      ...content,
      headerAlign: value
    })
  }

  const addLink = useCallback(() => {
    const previousUrl = editor?.getAttributes('link').href
    const url = window.prompt('URL:', previousUrl)

    if (url === null) {
      return
    }

    if (url === '') {
      editor?.chain().focus().extendMarkRange('link').unsetLink().run()
      return
    }

    editor?.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
  }, [editor])

  const handleImageSelect = useCallback((imageUrl: string, altText?: string) => {
    if (!imageUrl) {
      return
    }

    editor?.chain().focus().setImage({ src: imageUrl, alt: altText || '' }).run()
  }, [editor])

  const updateSelectedImageButtonPosition = useCallback(() => {
    if (!editor || !editorSurfaceRef.current) {
      setSelectedImageButtonPosition(null)
      return
    }

    const { selection } = editor.state
    if (!(selection instanceof NodeSelection) || selection.node.type.name !== 'image') {
      setSelectedImageButtonPosition(null)
      return
    }

    const imageElement = editor.view.nodeDOM(selection.from)
    if (!(imageElement instanceof HTMLElement)) {
      setSelectedImageButtonPosition(null)
      return
    }

    const surfaceRect = editorSurfaceRef.current.getBoundingClientRect()
    const imageRect = imageElement.getBoundingClientRect()
    const buttonSize = 36
    const padding = 8

    setSelectedImageButtonPosition({
      top: Math.max(padding, imageRect.top - surfaceRect.top + padding),
      left: Math.max(
        padding,
        Math.min(
          surfaceRect.width - buttonSize - padding,
          imageRect.right - surfaceRect.left - buttonSize - padding
        )
      ),
    })
  }, [editor])

  const handleDeleteSelectedImage = useCallback(() => {
    if (!editor) {
      return
    }

    const { selection } = editor.state
    if (!(selection instanceof NodeSelection) || selection.node.type.name !== 'image') {
      return
    }

    editor.chain().focus().deleteSelection().run()
    setSelectedImageButtonPosition(null)
  }, [editor])

  const handleEditorContainerMouseDown = useCallback((event: MouseEvent<HTMLDivElement>) => {
    const target = event.target

    if (!(target instanceof HTMLElement)) {
      return
    }

    if (target.closest('.ProseMirror')) {
      return
    }

    event.preventDefault()
    editor?.commands.focus('end')
  }, [editor])

  useEffect(() => {
    if (!editor) {
      return
    }

    const syncSelectedImageButton = () => {
      window.requestAnimationFrame(updateSelectedImageButtonPosition)
    }

    syncSelectedImageButton()
    editor.on('selectionUpdate', syncSelectedImageButton)
    editor.on('transaction', syncSelectedImageButton)
    editor.on('focus', syncSelectedImageButton)
    editor.on('blur', syncSelectedImageButton)

    return () => {
      editor.off('selectionUpdate', syncSelectedImageButton)
      editor.off('transaction', syncSelectedImageButton)
      editor.off('focus', syncSelectedImageButton)
      editor.off('blur', syncSelectedImageButton)
    }
  }, [editor, updateSelectedImageButtonPosition])

  useEffect(() => {
    if (!selectedImageButtonPosition) {
      return
    }

    const syncSelectedImageButton = () => {
      updateSelectedImageButtonPosition()
    }

    window.addEventListener('resize', syncSelectedImageButton)
    window.addEventListener('scroll', syncSelectedImageButton, true)

    return () => {
      window.removeEventListener('resize', syncSelectedImageButton)
      window.removeEventListener('scroll', syncSelectedImageButton, true)
    }
  }, [selectedImageButtonPosition, updateSelectedImageButtonPosition])

  if (!editor) {
    return inline ? (
      <div className="border rounded-md p-4 flex items-center justify-center h-32">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
      </div>
    ) : (
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle>Rich Text Content</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-32">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
          </div>
        </CardContent>
      </Card>
    )
  }

  const toolbarButtons = (
    <>
      {/* Text formatting */}
      <Button
        variant="ghost"
        size="sm"
        className={cn("h-8 w-8 p-0", editor.isActive('bold') && "bg-primary/20")}
        onClick={() => editor.chain().focus().toggleBold().run()}
        title="Bold"
      >
        <Bold className="w-4 h-4" />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className={cn("h-8 w-8 p-0", editor.isActive('italic') && "bg-primary/20")}
        onClick={() => editor.chain().focus().toggleItalic().run()}
        title="Italic"
      >
        <Italic className="w-4 h-4" />
      </Button>
      <div className="w-px h-6 bg-border mx-1" />
      {/* Headings */}
      {([1, 2, 3, 4, 5, 6] as const).map((level) => (
        <Button
          key={level}
          variant="ghost"
          size="sm"
          className={cn("h-8 px-2 text-xs font-semibold", editor.isActive('heading', { level }) && "bg-primary/20")}
          onClick={() => editor.chain().focus().toggleHeading({ level }).run()}
          title={`Heading ${level}`}
        >
          {`H${level}`}
        </Button>
      ))}
      <div className="w-px h-6 bg-border mx-1" />
      {/* Lists */}
      <Button
        variant="ghost"
        size="sm"
        className={cn("h-8 w-8 p-0", editor.isActive('bulletList') && "bg-primary/20")}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        title="Bullet List"
      >
        <List className="w-4 h-4" />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className={cn("h-8 w-8 p-0", editor.isActive('orderedList') && "bg-primary/20")}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        title="Numbered List"
      >
        <ListOrdered className="w-4 h-4" />
      </Button>
      <div className="w-px h-6 bg-border mx-1" />
      {/* Link */}
      <Button
        variant="ghost"
        size="sm"
        className={cn("h-8 w-8 p-0", editor.isActive('link') && "bg-primary/20")}
        onClick={addLink}
        title="Add Link"
      >
        <LinkIcon className="w-4 h-4" />
      </Button>
      {mediaPickerSiteId && (
        <>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={() => setIsImagePickerOpen(true)}
            title="Add Image"
          >
            <ImageIcon className="w-4 h-4" />
          </Button>
        </>
      )}
      <div className="w-px h-6 bg-border mx-1" />
      {/* Alignment */}
      <Button
        variant="ghost"
        size="sm"
        className={cn("h-8 w-8 p-0", editor.isActive({ textAlign: 'left' }) && "bg-primary/20")}
        onClick={() => editor.chain().focus().setTextAlign('left').run()}
        title="Align Left"
      >
        <AlignLeft className="w-4 h-4" />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className={cn("h-8 w-8 p-0", editor.isActive({ textAlign: 'center' }) && "bg-primary/20")}
        onClick={() => editor.chain().focus().setTextAlign('center').run()}
        title="Align Center"
      >
        <AlignCenter className="w-4 h-4" />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className={cn("h-8 w-8 p-0", editor.isActive({ textAlign: 'right' }) && "bg-primary/20")}
        onClick={() => editor.chain().focus().setTextAlign('right').run()}
        title="Align Right"
      >
        <AlignRight className="w-4 h-4" />
      </Button>
    </>
  )

  return (
    <div className="space-y-4">
      {children}

      {/* Header Settings Card - Only show if hideHeader is not true */}
      {!content.hideHeader && (
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Section Header</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="title">Section Title</Label>
              <Input
                id="title"
                value={content.title || ''}
                onChange={(e) => handleTitleChange(e.target.value)}
                placeholder="Enter section title..."
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="subtitle">Section Subtitle</Label>
              <Input
                id="subtitle"
                value={content.subtitle || ''}
                onChange={(e) => handleSubtitleChange(e.target.value)}
                placeholder="Enter section subtitle..."
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="headerAlign">Header Alignment</Label>
              <Select value={content.headerAlign || 'left'} onValueChange={handleHeaderAlignChange}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select alignment" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="left">Left</SelectItem>
                  <SelectItem value="center">Center</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Rich Text Editor */}
      {inline ? (
        <div className="border rounded-md overflow-hidden">
          {/* Toolbar */}
          <div className="flex flex-wrap gap-1 p-2 bg-muted/20 border-b">
            {toolbarButtons}
            {toolbarContent && (
              <div className="flex items-center gap-1">
                {toolbarContent}
              </div>
            )}
          </div>
          {/* Editor */}
          <div
            ref={editorSurfaceRef}
            className="relative cursor-text"
            onMouseDown={handleEditorContainerMouseDown}
          >
            <EditorContent
              editor={editor}
              className={`${contentClassName || 'prose prose-sm max-w-none [&_p]:my-1.5!'} ${compact ? 'min-h-[80px]' : 'min-h-[200px]'} [&_.ProseMirror]:border-none [&_.ProseMirror]:outline-none [&_.ProseMirror]:shadow-none [&_.ProseMirror]:p-3`}
            />
            {selectedImageButtonPosition && (
              <Button
                type="button"
                variant="destructive"
                size="icon"
                className="absolute z-10 size-8 rounded-full shadow-lg"
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
          </div>
        </div>
      ) : (
        <Card className="shadow-sm">
          {!content.hideEditorHeader && (
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Rich Text Content</CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowPreview(!showPreview)}
                  className="text-xs"
                >
                  {showPreview ? (
                    <>
                      <EyeOff className="w-4 h-4 mr-1" />
                      Edit
                    </>
                  ) : (
                    <>
                      <Eye className="w-4 h-4 mr-1" />
                      Preview
                    </>
                  )}
                </Button>
              </div>
            </CardHeader>
          )}
          <CardContent className="space-y-4">
            {!showPreview ? (
              <>
                {/* Toolbar */}
                <div className={`flex flex-wrap gap-1 p-2 bg-muted/20 ${content.hideEditorHeader ? '' : 'border rounded-md'}`}>
                  {toolbarButtons}
                  {toolbarContent && (
                    <div className="flex items-center gap-1">
                      {toolbarContent}
                    </div>
                  )}
                </div>

                {/* Editor */}
                <div
                  ref={editorSurfaceRef}
                  className={`relative cursor-text ${content.hideEditorHeader ? '' : 'border rounded-md'}`}
                  onMouseDown={handleEditorContainerMouseDown}
                >
                  <EditorContent
                    editor={editor}
                    className={`${contentClassName || 'prose prose-sm max-w-none [&_p]:my-1.5!'} ${compact ? 'min-h-[80px]' : 'min-h-[200px]'} [&_.ProseMirror]:border-none [&_.ProseMirror]:outline-none [&_.ProseMirror]:shadow-none ${content.hideEditorHeader ? '' : 'p-4'}`}
                  />
                  {selectedImageButtonPosition && (
                    <Button
                      type="button"
                      variant="destructive"
                      size="icon"
                      className="absolute z-10 size-8 rounded-full shadow-lg"
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
                </div>
              </>
            ) : (
              /* Preview Mode */
              <div className="border rounded-md p-4 bg-muted/5">
                <div className={`min-h-[200px] ${content.headerAlign === 'center' ? 'text-center' : 'text-left'}`}>
                  {content.title && (
                    <h2 className={`text-3xl font-bold md:text-5xl mb-4 max-w-3xl ${content.headerAlign === 'center' ? 'mx-auto' : ''}`}>
                      {content.title}
                    </h2>
                  )}
                  {content.subtitle && (
                    <p className={`text-lg text-muted-foreground mb-6 max-w-3xl ${content.headerAlign === 'center' ? 'mx-auto' : ''}`}>
                      {content.subtitle}
                    </p>
                  )}
                  <div
                    className={contentClassName || "prose prose-sm max-w-none [&_p]:my-1.5!"}
                    dangerouslySetInnerHTML={{
                      __html: DOMPurify.sanitize(content.content, {
                        ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'u', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'a', 'blockquote', 'img'],
                        ALLOWED_ATTR: ['href', 'target', 'rel', 'src', 'alt', 'class'],
                        ALLOW_DATA_ATTR: false
                      })
                    }}
                  />
                </div>
              </div>
            )}

            {showPreview && (
              <div className="text-xs text-muted-foreground">
                This is how your content will appear on the frontend.
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {mediaPickerSiteId && (
        <MediaPicker
          open={isImagePickerOpen}
          onOpenChange={setIsImagePickerOpen}
          onSelectMedia={handleImageSelect}
          showVideos={false}
          site_id={mediaPickerSiteId}
        />
      )}
    </div>
  )
}
