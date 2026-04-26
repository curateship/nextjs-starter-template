'use client'

import { useEffect, useState, useCallback } from 'react'
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { BlockEditorSection, BlockTabs } from "@/components/ui/tabs"
import { NewsletterInlineRichTextEditor } from "@/components/admin/newsletter-builder/layout/NewsletterInlineRichTextEditor"
import { Check } from "lucide-react"
import { cn } from "@/lib/utils/tailwind"
import { POST_CONTENT_STYLES } from "./post-content-styles"

interface PostContentBlockProps {
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
  onBack?: () => void
}

export function PostContentBlock({ content, onContentChange, siteId, blockId, postData, onPostTitleChange, onBack }: PostContentBlockProps) {
  const [localTitle, setLocalTitle] = useState(postData?.title || postData?.name || 'Untitled Post')

  const postContentStyle = content.postContentStyle || 'default'
  const styleConfig = content.styleConfig || {}
  const currentStyleConfig = styleConfig[postContentStyle] || {}

  const showAuthor = content.showAuthor ?? true
  const showDate = content.showDate ?? true

  // Update local title when post data changes
  useEffect(() => {
    setLocalTitle(postData?.title || postData?.name || 'Untitled Post')
  }, [postData?.title, postData?.name])

  // Lazy migration: ensure postContentStyle is set
  useEffect(() => {
    if (!content.postContentStyle) {
      onContentChange('postContentStyle', 'default')
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleStyleConfigChange = useCallback((field: string, value: any) => {
    onContentChange('styleConfig', {
      ...styleConfig,
      [postContentStyle]: { ...currentStyleConfig, [field]: value },
    })
  }, [styleConfig, postContentStyle, currentStyleConfig, onContentChange])

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

  const ActivePanel = POST_CONTENT_STYLES[postContentStyle]?.AdminPanel
  const editorContent = {
    ...content,
    htmlContent: content.body || content.text || '',
  }

  return (
    <BlockTabs
      onBack={onBack}
      headerClassName="pt-0"
      tabs={[
        {
          value: "content",
          label: "Content",
          content: (
            <>
              {/* Post Title */}
              <div className="space-y-2">
                <Label htmlFor="post-title">Post Title</Label>
                <Input
                  id="post-title"
                  value={localTitle}
                  onChange={(e) => handleTitleChange(e.target.value)}
                  placeholder="Enter post title..."
                  className="text-lg font-medium"
                />
              </div>

              {/* Rich Text Editor */}
              <div className="space-y-2">
                <Label>Content</Label>
                <NewsletterInlineRichTextEditor
                  blockId={blockId}
                  content={editorContent}
                  onContentChange={handleBodyChange}
                  siteId={siteId}
                  isActive
                  editorPadding={0}
                />
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
            <>
              <div className="space-y-2">
                <Label className="text-sm font-medium">Block Style</Label>
                <div className="grid grid-cols-2 gap-2 max-w-sm">
                  {Object.entries(POST_CONTENT_STYLES).map(([key, style]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => onContentChange('postContentStyle', key)}
                      className={cn(
                        "relative flex items-start gap-3 rounded-lg border p-3 text-left transition-colors",
                        postContentStyle === key
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-muted-foreground/50 hover:bg-muted/50"
                      )}
                    >
                      <div className={cn(
                        "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                        postContentStyle === key
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-muted-foreground/30"
                      )}>
                        {postContentStyle === key && <Check className="h-3 w-3" />}
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
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label htmlFor="show-author">Show Author</Label>
                      <p className="text-sm text-muted-foreground">Display the post author information</p>
                    </div>
                    <Switch
                      id="show-author"
                      checked={showAuthor}
                      onCheckedChange={(checked) => onContentChange('showAuthor', checked)}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label htmlFor="show-date">Show Date</Label>
                      <p className="text-sm text-muted-foreground">Display the post publication date</p>
                    </div>
                    <Switch
                      id="show-date"
                      checked={showDate}
                      onCheckedChange={(checked) => onContentChange('showDate', checked)}
                    />
                  </div>
              </BlockEditorSection>
            </>
          ),
        },
      ]}
    />
  )
}
