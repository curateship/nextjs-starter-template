'use client'

import { useEffect, useState } from 'react'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { BlockEditorSection, BlockTabs } from "@/components/ui/tabs"
import { Check } from "lucide-react"
import { cn } from "@/lib/utils/tailwind"
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import Image from '@tiptap/extension-image'
import { MediaPicker } from "@/components/admin/media-library/MediaPicker"
import { DIRECTORY_CONTENT_STYLES } from "./directory-content-styles"
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

interface DirectoryContentBlockProps {
  content: Record<string, any>
  onContentChange: (field: string, value: any) => void
  siteId: string
  blockId: string
  directoryData?: {
    title?: string
    name?: string
    featured_image?: string | null
    [key: string]: any
  }
  onDirectoryTitleChange?: (title: string) => void
  onDirectoryFeaturedImageChange?: (featuredImage: string) => void
  onBack?: () => void
  showDirectoryTitleField?: boolean
}

export function DirectoryContentBlock({
  content,
  onContentChange,
  siteId,
  blockId,
  directoryData,
  onDirectoryTitleChange,
  onDirectoryFeaturedImageChange,
  onBack,
  showDirectoryTitleField = true,
}: DirectoryContentBlockProps) {
  const [isImagePickerOpen, setIsImagePickerOpen] = useState(false)
  const [localTitle, setLocalTitle] = useState(directoryData?.title || directoryData?.name || 'Untitled Directory')

  const directoryContentStyle = content.directoryContentStyle || 'default'
  const styleConfig = content.styleConfig || {}
  const currentStyleConfig = styleConfig[directoryContentStyle] || {}

  const showFeaturedImage = content.showFeaturedImage ?? true

  // Update local title when directory data changes
  useEffect(() => {
    setLocalTitle(directoryData?.title || directoryData?.name || 'Untitled Directory')
  }, [directoryData?.title, directoryData?.name])

  // Lazy migration: ensure directoryContentStyle is set
  useEffect(() => {
    if (!content.directoryContentStyle) {
      onContentChange('directoryContentStyle', 'default')
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleStyleConfigChange = (field: string, value: any) => {
    onContentChange('styleConfig', {
      ...styleConfig,
      [directoryContentStyle]: { ...currentStyleConfig, [field]: value },
    })
  }

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({
        placeholder: 'Write your directory description here...',
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
    if (onDirectoryTitleChange) {
      onDirectoryTitleChange(value)
    }
  }

  const handleImageSelect = (imageUrl: string, altText?: string) => {
    if (editor) {
      editor.chain().focus().setImage({ src: imageUrl, alt: altText || '' }).run()
    }
  }

  const ActiveContentPanel = DIRECTORY_CONTENT_STYLES[directoryContentStyle]?.ContentPanel
  const ActiveStylingPanel = DIRECTORY_CONTENT_STYLES[directoryContentStyle]?.AdminPanel
  const isListingDefaultStyle = directoryContentStyle === 'listing-default'

  if (!editor) {
    return <div>Loading editor...</div>
  }

  const tabs = [
    {
      value: "content",
      label: "Content",
      content: (
        <>
          {showDirectoryTitleField && (
            <div className="space-y-2 mb-4">
              <Label htmlFor="directory-title">Directory Title</Label>
              <Input
                id="directory-title"
                value={localTitle}
                onChange={(e) => handleTitleChange(e.target.value)}
                placeholder="Enter directory title..."
                className="text-lg font-medium"
              />
            </div>
          )}

          <div className="space-y-2">
            <Label>About</Label>
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

          {ActiveContentPanel ? (
            <ActiveContentPanel
              content={content}
              onContentChange={onContentChange}
              siteId={siteId}
              blockId={blockId}
              section="content"
              directoryData={{
                title: directoryData?.title || directoryData?.name,
                featured_image: directoryData?.featured_image || null,
              }}
              onDirectoryFeaturedImageChange={onDirectoryFeaturedImageChange}
            />
          ) : null}
        </>
      ),
    },
  ]

  if (isListingDefaultStyle && ActiveContentPanel) {
    tabs.push(
      {
        value: "claim-listing",
        label: "Claim Listing",
        content: (
          <ActiveContentPanel
            content={content}
            onContentChange={onContentChange}
            siteId={siteId}
            blockId={blockId}
            section="claim-listing"
            directoryData={{
              title: directoryData?.title || directoryData?.name,
              featured_image: directoryData?.featured_image || null,
            }}
            onDirectoryFeaturedImageChange={onDirectoryFeaturedImageChange}
          />
        ),
      },
      {
        value: "custom-buttons",
        label: "Custom Buttons",
        content: (
          <ActiveContentPanel
            content={content}
            onContentChange={onContentChange}
            siteId={siteId}
            blockId={blockId}
            section="custom-buttons"
            directoryData={{
              title: directoryData?.title || directoryData?.name,
              featured_image: directoryData?.featured_image || null,
            }}
            onDirectoryFeaturedImageChange={onDirectoryFeaturedImageChange}
          />
        ),
      }
    )
  }

  tabs.push({
    value: "settings",
    label: "Settings",
    content: (
      <>
        <div className="space-y-2 mb-4">
          <Label className="text-sm font-medium">Block Style</Label>
          <div className="grid grid-cols-2 gap-2 max-w-sm">
            {Object.entries(DIRECTORY_CONTENT_STYLES).map(([key, style]) => (
              <button
                key={key}
                type="button"
                onClick={() => onContentChange('directoryContentStyle', key)}
                className={cn(
                  "relative flex items-start gap-3 rounded-lg border p-3 text-left transition-colors",
                  directoryContentStyle === key
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-muted-foreground/50 hover:bg-muted/50"
                )}
              >
                <div className={cn(
                  "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                  directoryContentStyle === key
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-muted-foreground/30"
                )}>
                  {directoryContentStyle === key && <Check className="h-3 w-3" />}
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-medium">{style.label}</div>
                  {style.description && (
                    <div className="mt-0.5 text-xs text-muted-foreground">{style.description}</div>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>

        <BlockEditorSection heading="Display Options">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="show-featured-image">Show Featured Image</Label>
              <p className="text-sm text-muted-foreground">Display the directory featured image</p>
            </div>
            <Switch
              id="show-featured-image"
              checked={showFeaturedImage}
              onCheckedChange={(checked) => onContentChange('showFeaturedImage', checked)}
            />
          </div>

        </BlockEditorSection>

        {!isListingDefaultStyle && ActiveStylingPanel ? (
          <div className="pt-6">
            <ActiveStylingPanel
              config={currentStyleConfig}
              onConfigChange={handleStyleConfigChange}
              siteId={siteId}
              blockId={blockId}
            />
          </div>
        ) : null}
      </>
    ),
  })

  return (
    <>
      <BlockTabs
        onBack={onBack}
        headerClassName="pt-0"
        tabs={tabs}
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
