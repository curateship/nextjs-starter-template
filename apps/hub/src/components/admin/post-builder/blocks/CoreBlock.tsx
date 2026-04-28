'use client'

import { useEffect, useState, useCallback } from 'react'
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { BlockEditorSection } from "@/components/ui/tabs"
import { NewsletterInlineRichTextEditor } from "@/components/admin/newsletter-builder/layout/NewsletterInlineRichTextEditor"
import { Check } from "lucide-react"
import { cn } from "@/lib/utils/tailwind"
import { CORE_STYLES } from "./core-styles"

export type CoreBlockTab = "content" | "styling" | "settings"

interface CoreBlockProps {
  content: Record<string, any>
  onContentChange: (field: string, value: any) => void
  siteId: string
  blockId: string
  postData?: {
    title?: string
    name?: string
    [key: string]: any
  }
  onPostTitleChange?: (title: string) => void
  activeTab?: CoreBlockTab
  onBack?: () => void
}

export function CoreBlock({ content, onContentChange, siteId, blockId, postData, onPostTitleChange, activeTab = "content" }: CoreBlockProps) {
  const [localTitle, setLocalTitle] = useState(postData?.title || postData?.name || 'Untitled Post')

  const coreStyle = content.coreStyle || 'default'
  const styleConfig = content.styleConfig || {}
  const currentStyleConfig = styleConfig[coreStyle] || {}

  const showAuthor = content.showAuthor ?? true
  const showDate = content.showDate ?? true
  const showFeaturedImage = content.showFeaturedImage ?? postData?.show_featured_image ?? true
  const showExcerpt = content.showExcerpt ?? postData?.show_excerpt ?? true

  // Update local title when post data changes
  useEffect(() => {
    setLocalTitle(postData?.title || postData?.name || 'Untitled Post')
  }, [postData?.title, postData?.name])

  // Lazy migration: ensure coreStyle is set
  useEffect(() => {
    if (!content.coreStyle) {
      onContentChange('coreStyle', 'default')
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleStyleConfigChange = useCallback((field: string, value: any) => {
    onContentChange('styleConfig', {
      ...styleConfig,
      [coreStyle]: { ...currentStyleConfig, [field]: value },
    })
  }, [styleConfig, coreStyle, currentStyleConfig, onContentChange])

  const handleTitleChange = (value: string) => {
    setLocalTitle(value)
    if (onPostTitleChange) {
      onPostTitleChange(value)
    }
  }

  const handleBodyChange = useCallback((htmlContent: string) => {
    onContentChange('body', htmlContent)
    if (!content.format) {
      onContentChange('format', 'html')
    }
  }, [content.format, onContentChange])

  const ActivePanel = CORE_STYLES[coreStyle]?.AdminPanel
  const editorContent = {
    ...content,
    htmlContent: content.body || content.text || '',
  }

  return (
    <div className="space-y-4">
      {activeTab === "content" && (
        <>
          {/* Post Title */}
          <h2>
            <Input
              id="post-title"
              aria-label="Post title"
              value={localTitle}
              onChange={(e) => handleTitleChange(e.target.value)}
              placeholder="Enter post title..."
              className="h-auto border-0 bg-transparent px-0 py-0 text-3xl font-semibold tracking-normal shadow-none outline-none focus-visible:ring-0 md:text-4xl"
            />
          </h2>

          {/* Rich Text Editor */}
          <div>
            <NewsletterInlineRichTextEditor
              blockId={blockId}
              content={editorContent}
              onContentChange={handleBodyChange}
              siteId={siteId}
              isActive
              editorPadding={0}
              variant="post"
            />
          </div>
        </>
      )}

      {activeTab === "styling" && ActivePanel && (
        <ActivePanel
          config={currentStyleConfig}
          onConfigChange={handleStyleConfigChange}
          siteId={siteId}
          blockId={blockId}
        />
      )}

      {activeTab === "settings" && (
        <>
          <div className="space-y-2">
            <Label className="text-sm font-medium">Block Style</Label>
            <div className="grid grid-cols-2 gap-2 max-w-sm">
              {Object.entries(CORE_STYLES).map(([key, style]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => onContentChange('coreStyle', key)}
                  className={cn(
                    "relative flex items-start gap-3 rounded-lg border p-3 text-left transition-colors",
                    coreStyle === key
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-muted-foreground/50 hover:bg-muted/50"
                  )}
                >
                  <div className={cn(
                    "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                    coreStyle === key
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-muted-foreground/30"
                  )}>
                    {coreStyle === key && <Check className="h-3 w-3" />}
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

          <BlockEditorSection heading="Display Options">
            <div className="flex items-start gap-3">
              <Switch
                id="show-featured-image"
                checked={showFeaturedImage}
                onCheckedChange={(checked) => onContentChange('showFeaturedImage', checked)}
                className="mt-0.5"
              />
              <div className="space-y-0.5">
                <Label htmlFor="show-featured-image">Show Featured Image</Label>
                <p className="text-sm text-muted-foreground">Display the post featured image</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Switch
                id="show-excerpt"
                checked={showExcerpt}
                onCheckedChange={(checked) => onContentChange('showExcerpt', checked)}
                className="mt-0.5"
              />
              <div className="space-y-0.5">
                <Label htmlFor="show-excerpt">Show Excerpt</Label>
                <p className="text-sm text-muted-foreground">Display the post excerpt beneath the title</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Switch
                id="show-author"
                checked={showAuthor}
                onCheckedChange={(checked) => onContentChange('showAuthor', checked)}
                className="mt-0.5"
              />
              <div className="space-y-0.5">
                <Label htmlFor="show-author">Show Author</Label>
                <p className="text-sm text-muted-foreground">Display the post author information</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Switch
                id="show-date"
                checked={showDate}
                onCheckedChange={(checked) => onContentChange('showDate', checked)}
                className="mt-0.5"
              />
              <div className="space-y-0.5">
                <Label htmlFor="show-date">Show Date</Label>
                <p className="text-sm text-muted-foreground">Display the post publication date</p>
              </div>
            </div>
          </BlockEditorSection>
        </>
      )}
    </div>
  )
}
