'use client'

import { useEffect, useState, useCallback } from 'react'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { BlockTabs } from "@/components/ui/tabs"
import { Check } from "lucide-react"
import { cn } from "@/lib/utils/tailwind"
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import Image from '@tiptap/extension-image'
import { MediaPicker } from "@/components/admin/media-library/MediaPicker"
import { CATEGORY_CONTENT_STYLES } from "./category-content-styles"
import {
  Bold,
  Italic,
  List,
  ListOrdered,
  Quote,
  Heading2,
  Heading3,
  Undo,
  Redo,
  Code,
  ImageIcon
} from 'lucide-react'

interface CategoryContentBlockProps {
  content: Record<string, any>
  onContentChange: (field: string, value: any) => void
  siteId: string
  blockId: string
  categoryData?: {
    title?: string
    name?: string
    [key: string]: any
  }
  onCategoryTitleChange?: (title: string) => void
  onBack?: () => void
}

export function CategoryContentBlock({ content, onContentChange, siteId, blockId, categoryData, onCategoryTitleChange, onBack }: CategoryContentBlockProps) {
  const [isImagePickerOpen, setIsImagePickerOpen] = useState(false)
  const [localTitle, setLocalTitle] = useState(categoryData?.title || categoryData?.name || 'Untitled Category')

  const taxonomyContentStyle = content.taxonomyContentStyle || 'default'
  const styleConfig = content.styleConfig || {}
  const currentStyleConfig = styleConfig[taxonomyContentStyle] || {}

  const showFeaturedImage = content.showFeaturedImage ?? true

  useEffect(() => {
    setLocalTitle(categoryData?.title || categoryData?.name || 'Untitled Category')
  }, [categoryData?.title, categoryData?.name])

  // Lazy migration: ensure taxonomyContentStyle is set
  useEffect(() => {
    if (!content.taxonomyContentStyle) {
      onContentChange('taxonomyContentStyle', 'default')
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleStyleConfigChange = useCallback((field: string, value: any) => {
    onContentChange('styleConfig', {
      ...styleConfig,
      [taxonomyContentStyle]: { ...currentStyleConfig, [field]: value },
    })
  }, [styleConfig, taxonomyContentStyle, currentStyleConfig, onContentChange])

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({
        placeholder: 'Write your category description here...',
      }),
      Image.configure({
        HTMLAttributes: {
          class: 'rounded-lg max-w-full h-auto',
        },
      }),
    ],
    content: content.body || '',
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: 'prose prose-sm max-w-none focus:outline-none min-h-[200px] px-3 py-2',
      },
    },
    onUpdate: ({ editor }) => {
      onContentChange('body', editor.getHTML())
      if (!content.format) {
        onContentChange('format', 'html')
      }
    },
  })

  // Update editor content when block changes
  useEffect(() => {
    if (editor) {
      const editorContent = content.body || ''
      if (editor.getHTML() !== editorContent) {
        editor.commands.setContent(editorContent)
      }
    }
  }, [blockId, content.body, editor])

  const handleTitleChange = (value: string) => {
    setLocalTitle(value)
    if (onCategoryTitleChange) {
      onCategoryTitleChange(value)
    }
  }

  const handleImageSelect = (imageUrl: string, altText?: string) => {
    if (editor) {
      editor.chain().focus().setImage({ src: imageUrl, alt: altText || '' }).run()
    }
  }

  const ActivePanel = CATEGORY_CONTENT_STYLES[taxonomyContentStyle]?.AdminPanel

  if (!editor) {
    return <div>Loading editor...</div>
  }

  return (
    <>
      <BlockTabs
        onBack={onBack}
        tabs={[
          {
            value: "content",
            label: "Content",
            content: (
              <>
                {/* Style Selector */}
                <div className="space-y-2 mb-4 mx-4">
                  <Label className="text-sm font-medium px-1">Block Style</Label>
                  <div className="grid grid-cols-2 gap-2 max-w-sm">
                    {Object.entries(CATEGORY_CONTENT_STYLES).map(([key, style]) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => onContentChange('taxonomyContentStyle', key)}
                        className={cn(
                          "relative flex items-start gap-3 rounded-lg border p-3 text-left transition-colors",
                          taxonomyContentStyle === key
                            ? "border-primary bg-primary/5"
                            : "border-border hover:border-muted-foreground/50 hover:bg-muted/50"
                        )}
                      >
                        <div className={cn(
                          "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                          taxonomyContentStyle === key
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-muted-foreground/30"
                        )}>
                          {taxonomyContentStyle === key && <Check className="h-3 w-3" />}
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-medium">{style.label}</div>
                          {style.description && (
                            <div className="text-xs text-muted-foreground mt-0.5">{style.description}</div>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Category Title */}
                <div className="space-y-2 px-6 mb-4">
                  <Label htmlFor="category-title">Category Title</Label>
                  <Input
                    id="category-title"
                    value={localTitle}
                    onChange={(e) => handleTitleChange(e.target.value)}
                    placeholder="Enter category title..."
                    className="text-lg font-medium"
                  />
                </div>

                {/* Rich Text Editor */}
                <div className="space-y-2 px-6">
                  <Label>Content</Label>
                  <div className="border rounded-md overflow-hidden">
                        {/* TipTap Toolbar */}
                        <div className="bg-muted/30 p-2 flex flex-wrap gap-1">
                          <Button
                            size="sm"
                            variant={editor.isActive('bold') ? 'secondary' : 'ghost'}
                            onClick={() => editor.chain().focus().toggleBold().run()}
                            disabled={!editor.can().chain().focus().toggleBold().run()}
                            className="h-8 w-8 p-0"
                            type="button"
                          >
                            <Bold className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant={editor.isActive('italic') ? 'secondary' : 'ghost'}
                            onClick={() => editor.chain().focus().toggleItalic().run()}
                            disabled={!editor.can().chain().focus().toggleItalic().run()}
                            className="h-8 w-8 p-0"
                            type="button"
                          >
                            <Italic className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant={editor.isActive('code') ? 'secondary' : 'ghost'}
                            onClick={() => editor.chain().focus().toggleCode().run()}
                            disabled={!editor.can().chain().focus().toggleCode().run()}
                            className="h-8 w-8 p-0"
                            type="button"
                          >
                            <Code className="h-4 w-4" />
                          </Button>

                          <div className="w-px h-8 bg-border mx-1" />

                          <Button
                            size="sm"
                            variant={editor.isActive('heading', { level: 2 }) ? 'secondary' : 'ghost'}
                            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
                            className="h-8 w-8 p-0"
                            type="button"
                          >
                            <Heading2 className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant={editor.isActive('heading', { level: 3 }) ? 'secondary' : 'ghost'}
                            onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
                            className="h-8 w-8 p-0"
                            type="button"
                          >
                            <Heading3 className="h-4 w-4" />
                          </Button>

                          <div className="w-px h-8 bg-border mx-1" />

                          <Button
                            size="sm"
                            variant={editor.isActive('bulletList') ? 'secondary' : 'ghost'}
                            onClick={() => editor.chain().focus().toggleBulletList().run()}
                            className="h-8 w-8 p-0"
                            type="button"
                          >
                            <List className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant={editor.isActive('orderedList') ? 'secondary' : 'ghost'}
                            onClick={() => editor.chain().focus().toggleOrderedList().run()}
                            className="h-8 w-8 p-0"
                            type="button"
                          >
                            <ListOrdered className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant={editor.isActive('blockquote') ? 'secondary' : 'ghost'}
                            onClick={() => editor.chain().focus().toggleBlockquote().run()}
                            className="h-8 w-8 p-0"
                            type="button"
                          >
                            <Quote className="h-4 w-4" />
                          </Button>

                          <div className="w-px h-8 bg-border mx-1" />

                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setIsImagePickerOpen(true)}
                            className="h-8 w-8 p-0"
                            type="button"
                          >
                            <ImageIcon className="h-4 w-4" />
                          </Button>

                          <div className="w-px h-8 bg-border mx-1" />

                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => editor.chain().focus().undo().run()}
                            disabled={!editor.can().chain().focus().undo().run()}
                            className="h-8 w-8 p-0"
                            type="button"
                          >
                            <Undo className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => editor.chain().focus().redo().run()}
                            disabled={!editor.can().chain().focus().redo().run()}
                            className="h-8 w-8 p-0"
                            type="button"
                          >
                            <Redo className="h-4 w-4" />
                          </Button>
                        </div>

                        {/* TipTap Editor */}
                        <div className="bg-background">
                          <EditorContent editor={editor} />
                        </div>
                  </div>
                </div>
              </>
            ),
          },
          {
            value: "styling",
            label: "Styling",
            content: ActivePanel ? (
              <ActivePanel
                config={currentStyleConfig}
                onConfigChange={handleStyleConfigChange}
                siteId={siteId}
                blockId={blockId}
              />
            ) : null,
          },
          {
            value: "settings",
            label: "Settings",
            content: (
              <Card className="shadow-sm">
                <CardHeader>
                  <CardTitle className="text-base">Display Options</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label htmlFor="show-featured-image">Show Featured Image</Label>
                      <p className="text-sm text-muted-foreground">Display the category featured image</p>
                    </div>
                    <Switch
                      id="show-featured-image"
                      checked={showFeaturedImage}
                      onCheckedChange={(checked) => onContentChange('showFeaturedImage', checked)}
                    />
                  </div>
                </CardContent>
              </Card>
            ),
          },
        ]}
      />

      {/* Image Picker Modal */}
      <MediaPicker
        open={isImagePickerOpen}
        onOpenChange={setIsImagePickerOpen}
        onSelectMedia={handleImageSelect}
        showVideos={false}
      />
    </>
  )
}
