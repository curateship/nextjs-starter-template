'use client'

import { useEffect, useState, useCallback } from 'react'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { BlockTabs } from "@/components/admin/shared/BlockTabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { BlockEditorSection } from "@/components/admin/shared/BlockTabs"
import { Check } from "lucide-react"
import { cn } from "@/lib/utils/tailwind"
import { VisibilitySettings } from "@/components/admin/product-builder/blocks/shared/VisibilitySettings"
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import Image from '@tiptap/extension-image'
import { MediaPicker } from "@/components/admin/media-library/MediaPicker"
import { PRODUCT_CONTENT_STYLES } from "."
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

interface ProductContentBlockProps {
  content: Record<string, any>
  onContentChange: (field: string, value: any) => void
  siteId: string
  blockId: string
  productData?: {
    title?: string
    name?: string
    featured_image?: string | null
    description?: string | null
    [key: string]: any
  }
  onProductTitleChange?: (title: string) => void
  onProductDescriptionChange?: (description: string) => void
  onProductFeaturedImageChange?: (featuredImage: string) => void
  onBack?: () => void
}

export function ProductContentBlock({
  content,
  onContentChange,
  siteId,
  blockId,
  productData,
  onProductTitleChange,
  onProductDescriptionChange,
  onProductFeaturedImageChange,
  onBack,
}: ProductContentBlockProps) {
  const [isImagePickerOpen, setIsImagePickerOpen] = useState(false)
  const [localTitle, setLocalTitle] = useState(productData?.title || productData?.name || 'Untitled Product')

  const productContentStyle = content.productContentStyle || 'default'
  const styleConfig = content.styleConfig || {}
  const currentStyleConfig = styleConfig[productContentStyle] || {}

  const showFeaturedImage = content.showFeaturedImage ?? true

  // Update local title when product data changes
  useEffect(() => {
    setLocalTitle(productData?.title || productData?.name || 'Untitled Product')
  }, [productData?.title, productData?.name])

  // Lazy migration: ensure productContentStyle is set
  useEffect(() => {
    if (!content.productContentStyle) {
      onContentChange('productContentStyle', 'default')
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleStyleConfigChange = useCallback((field: string, value: any) => {
    onContentChange('styleConfig', {
      ...styleConfig,
      [productContentStyle]: { ...currentStyleConfig, [field]: value },
    })
  }, [styleConfig, productContentStyle, currentStyleConfig, onContentChange])

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({
        placeholder: 'Write your product description here...',
      }),
      Image.configure({
        HTMLAttributes: {
          class: 'rounded-lg max-w-full h-auto',
        },
      }),
    ],
    content: content.body || productData?.description || '',
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: 'prose prose-sm max-w-none focus:outline-none min-h-[200px] px-3 py-2',
      },
    },
    onUpdate: ({ editor }) => {
      const html = editor.getHTML()
      onContentChange('body', html)
      if (onProductDescriptionChange) {
        onProductDescriptionChange(html)
      }
    },
  })

  // Update editor content when block changes
  useEffect(() => {
    if (editor) {
      const editorContent = content.body || productData?.description || ''
      if (editor.getHTML() !== editorContent) {
        editor.commands.setContent(editorContent)
      }
    }
  }, [blockId, content.body, productData?.description, editor])

  const handleTitleChange = (value: string) => {
    setLocalTitle(value)
    if (onProductTitleChange) {
      onProductTitleChange(value)
    }
  }

  const handleImageSelect = (imageUrl: string, altText?: string) => {
    if (editor) {
      editor.chain().focus().setImage({ src: imageUrl, alt: altText || '' }).run()
    }
  }

  const ActivePanel = PRODUCT_CONTENT_STYLES[productContentStyle]?.AdminPanel

  if (!editor) {
    return <div>Loading editor...</div>
  }

  return (
    <>
      <BlockTabs
        onBack={onBack}
        headerClassName="pt-0"
        tabs={[
          {
            value: "content",
            label: "Content",
            content: (
              <>
                {/* Product Title */}
                <div className="space-y-2 px-6 mb-4">
                  <Label htmlFor="product-title">Product Title</Label>
                  <Input
                    id="product-title"
                    value={localTitle}
                    onChange={(e) => handleTitleChange(e.target.value)}
                    placeholder="Enter product title..."
                    className="text-lg font-medium"
                  />
                </div>

                {/* Rich Text Editor */}
                <div className="space-y-2 px-6">
                  <Label>Description</Label>
                  <div className="border rounded-md overflow-hidden">
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
            content: (
              <>
                {ActivePanel && (
                  <ActivePanel
                    config={currentStyleConfig}
                    onConfigChange={handleStyleConfigChange}
                    siteId={siteId}
                    blockId={blockId}
                  />
                )}
              </>
            ),
          },
          {
            value: "settings",
            label: "Settings",
            content: (
              <>
                {/* Block Style Selector */}
                <div className="space-y-2 mb-4 mx-4">
                  <Label className="text-sm font-medium px-1">Block Style</Label>
                  <div className="grid grid-cols-2 gap-2 max-w-sm">
                    {Object.entries(PRODUCT_CONTENT_STYLES).map(([key, style]) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => onContentChange('productContentStyle', key)}
                        className={cn(
                          "relative flex items-start gap-3 rounded-lg border p-3 text-left transition-colors",
                          productContentStyle === key
                            ? "border-primary bg-primary/5"
                            : "border-border hover:border-muted-foreground/50 hover:bg-muted/50"
                        )}
                      >
                        <div className={cn(
                          "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                          productContentStyle === key
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-muted-foreground/30"
                        )}>
                          {productContentStyle === key && <Check className="h-3 w-3" />}
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

                <VisibilitySettings
                  visibility={content.visibility}
                  onChange={(v) => onContentChange('visibility', v)}
                  fields={[
                    { key: 'title', label: 'Title' },
                    { key: 'body', label: 'Description' },
                    { key: 'featuredImage', label: 'Featured Image' },
                    { key: 'downloadButton', label: 'Download Button' },
                  ]}
                />

                <BlockEditorSection heading="Display Options">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label htmlFor="show-featured-image">Show Featured Image</Label>
                      <p className="text-sm text-muted-foreground">Display the product featured image</p>
                    </div>
                    <Switch
                      id="show-featured-image"
                      checked={showFeaturedImage}
                      onCheckedChange={(checked) => onContentChange('showFeaturedImage', checked)}
                    />
                  </div>
                </BlockEditorSection>

                <BlockEditorSection heading="Download Button">
                  <div className="space-y-2">
                    <Label className="text-sm">Button Text</Label>
                    <Input
                      value={content.downloadButtonText || ''}
                      onChange={(e) => onContentChange('downloadButtonText', e.target.value)}
                      placeholder="e.g., Download Product"
                      className="text-sm"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm">Button Style</Label>
                    <Select
                      value={content.downloadButtonStyle || 'black'}
                      onValueChange={(value) => onContentChange('downloadButtonStyle', value)}
                    >
                      <SelectTrigger size="button" className="text-sm">
                        <SelectValue placeholder="Select style" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="black">Black (Solid)</SelectItem>
                        <SelectItem value="default">Default (Theme)</SelectItem>
                        <SelectItem value="secondary">Secondary (Gray)</SelectItem>
                        <SelectItem value="outline">Outline</SelectItem>
                        <SelectItem value="ghost">Ghost (Transparent)</SelectItem>
                        <SelectItem value="destructive">Destructive (Red)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm">Download URL</Label>
                    <Input
                      value={content.downloadButtonUrl || ''}
                      onChange={(e) => onContentChange('downloadButtonUrl', e.target.value)}
                      placeholder="https://example.com/download"
                      type="url"
                      className="text-sm"
                    />
                  </div>
                </BlockEditorSection>
              </>
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
