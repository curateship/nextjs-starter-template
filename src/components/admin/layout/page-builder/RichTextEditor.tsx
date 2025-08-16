"use client"

import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import TextAlign from '@tiptap/extension-text-align'
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
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
  Eye,
  EyeOff
} from "lucide-react"
import { useState, useCallback, useEffect } from 'react'
import { cn } from "@/lib/utils"

interface RichTextBlockProps {
  content: {
    title?: string
    subtitle?: string
    headerAlign?: 'left' | 'center'
    content: string
    hideHeader?: boolean
    hideEditorHeader?: boolean
  }
  onContentChange: (content: { title?: string; subtitle?: string; headerAlign?: 'left' | 'center'; content: string }) => void
}

export function RichTextEditor({ content, onContentChange }: RichTextBlockProps) {
  const [showPreview, setShowPreview] = useState(false)
  
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
    ],
    content: content.content,
    immediatelyRender: false,
    onUpdate: ({ editor }) => {
      const html = editor.getHTML()
      onContentChange({
        ...content,
        content: html
      })
    },
  })

  // Update editor content when content prop changes
  useEffect(() => {
    if (editor && content.content !== editor.getHTML()) {
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

  if (!editor) {
    return (
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

  return (
    <div className="space-y-4">
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

      {/* Rich Text Editor Card */}
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
                {/* Text formatting */}
                <Button
                  variant="ghost"
                  size="sm"
                  className={cn(
                    "h-8 w-8 p-0",
                    editor.isActive('bold') && "bg-primary/20"
                  )}
                  onClick={() => editor.chain().focus().toggleBold().run()}
                  title="Bold"
                >
                  <Bold className="w-4 h-4" />
                </Button>
                
                <Button
                  variant="ghost"
                  size="sm"
                  className={cn(
                    "h-8 w-8 p-0",
                    editor.isActive('italic') && "bg-primary/20"
                  )}
                  onClick={() => editor.chain().focus().toggleItalic().run()}
                  title="Italic"
                >
                  <Italic className="w-4 h-4" />
                </Button>

                <div className="w-px h-6 bg-border mx-1" />

                {/* Headings */}
                <Button
                  variant="ghost"
                  size="sm"
                  className={cn(
                    "h-8 px-2 text-xs font-semibold",
                    editor.isActive('heading', { level: 2 }) && "bg-primary/20"
                  )}
                  onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
                  title="Heading 2"
                >
                  H2
                </Button>
                
                <Button
                  variant="ghost"
                  size="sm"
                  className={cn(
                    "h-8 px-2 text-xs font-semibold",
                    editor.isActive('heading', { level: 3 }) && "bg-primary/20"
                  )}
                  onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
                  title="Heading 3"
                >
                  H3
                </Button>

                <div className="w-px h-6 bg-border mx-1" />

                {/* Lists */}
                <Button
                  variant="ghost"
                  size="sm"
                  className={cn(
                    "h-8 w-8 p-0",
                    editor.isActive('bulletList') && "bg-primary/20"
                  )}
                  onClick={() => editor.chain().focus().toggleBulletList().run()}
                  title="Bullet List"
                >
                  <List className="w-4 h-4" />
                </Button>
                
                <Button
                  variant="ghost"
                  size="sm"
                  className={cn(
                    "h-8 w-8 p-0",
                    editor.isActive('orderedList') && "bg-primary/20"
                  )}
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
                  className={cn(
                    "h-8 w-8 p-0",
                    editor.isActive('link') && "bg-primary/20"
                  )}
                  onClick={addLink}
                  title="Add Link"
                >
                  <LinkIcon className="w-4 h-4" />
                </Button>

                <div className="w-px h-6 bg-border mx-1" />

                {/* Alignment */}
                <Button
                  variant="ghost"
                  size="sm"
                  className={cn(
                    "h-8 w-8 p-0",
                    editor.isActive({ textAlign: 'left' }) && "bg-primary/20"
                  )}
                  onClick={() => editor.chain().focus().setTextAlign('left').run()}
                  title="Align Left"
                >
                  <AlignLeft className="w-4 h-4" />
                </Button>
                
                <Button
                  variant="ghost"
                  size="sm"
                  className={cn(
                    "h-8 w-8 p-0",
                    editor.isActive({ textAlign: 'center' }) && "bg-primary/20"
                  )}
                  onClick={() => editor.chain().focus().setTextAlign('center').run()}
                  title="Align Center"
                >
                  <AlignCenter className="w-4 h-4" />
                </Button>
                
                <Button
                  variant="ghost"
                  size="sm"
                  className={cn(
                    "h-8 w-8 p-0",
                    editor.isActive({ textAlign: 'right' }) && "bg-primary/20"
                  )}
                  onClick={() => editor.chain().focus().setTextAlign('right').run()}
                  title="Align Right"
                >
                  <AlignRight className="w-4 h-4" />
                </Button>
              </div>

              {/* Editor */}
              <div className={content.hideEditorHeader ? '' : 'border rounded-md'}>
                <EditorContent 
                  editor={editor} 
                  className={`prose prose-sm max-w-none min-h-[200px] [&_.ProseMirror]:border-none [&_.ProseMirror]:outline-none [&_.ProseMirror]:shadow-none ${content.hideEditorHeader ? '' : 'p-4'}`}
                />
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
                  className="prose prose-sm max-w-none" 
                  dangerouslySetInnerHTML={{ 
                    __html: DOMPurify.sanitize(content.content, {
                      ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'u', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'a', 'blockquote'],
                      ALLOWED_ATTR: ['href', 'target', 'rel'],
                      ALLOW_DATA_ATTR: false
                    }) 
                  }} 
                />
              </div>
            </div>
          )}
          
          <div className="text-xs text-muted-foreground">
            {showPreview ? 
              'This is how your content will appear on the frontend.' :
              'Use the toolbar above to format your content. Links, headings, and lists are supported.'
            }
          </div>
        </CardContent>
      </Card>
    </div>
  )
}