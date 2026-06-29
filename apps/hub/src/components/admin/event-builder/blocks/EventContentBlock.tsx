'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Input } from "@/components/ui/input"
import { BlockTabs } from "@/components/ui/tabs"
import { Card, CardContent, CardDescription, CardGroup, CardHeader } from "@/components/ui/card"
import { VisibilitySettings } from "@/components/admin/layout/builder/VisibilitySettings"
import { DashboardModalCardTitle } from "@/components/admin/layout/dashboard/modals"
import { Check } from "lucide-react"
import { cn } from "@/lib/utils/tailwind"
import { InlineRichTextEditor } from "@/components/admin/layout/builder/InlineRichTextEditor"
import { EVENT_CONTENT_STYLES } from "./event-content-styles"

interface EventContentBlockProps {
  content: Record<string, any>
  onContentChange: (field: string, value: any) => void
  siteId: string
  blockId: string
  // template: edit block config (style/styling/visibility) owned by the template.
  // instance: edit per-event values (title + rich text body).
  mode?: "template" | "instance"
  eventData?: {
    title?: string
    name?: string
    [key: string]: any
  }
  onEventTitleChange?: (title: string) => void
  onBack?: () => void
}

export function EventContentBlock({ content, onContentChange, siteId, blockId, mode = "instance", eventData, onEventTitleChange, onBack }: EventContentBlockProps) {
  const [localTitle, setLocalTitle] = useState(eventData?.title || eventData?.name || 'Untitled Event')

  const eventContentStyle = content.eventContentStyle || 'default'
  const styleConfig = useMemo(() => content.styleConfig || {}, [content.styleConfig])
  const currentStyleConfig = useMemo(() => styleConfig[eventContentStyle] || {}, [eventContentStyle, styleConfig])

  useEffect(() => {
    setLocalTitle(eventData?.title || eventData?.name || 'Untitled Event')
  }, [eventData?.title, eventData?.name])

  useEffect(() => {
    if (mode === "template" && !content.eventContentStyle) {
      onContentChange('eventContentStyle', 'default')
    }
  }, [content.eventContentStyle, mode, onContentChange])

  const handleStyleConfigChange = useCallback((field: string, value: any) => {
    onContentChange('styleConfig', {
      ...styleConfig,
      [eventContentStyle]: { ...currentStyleConfig, [field]: value },
    })
  }, [styleConfig, eventContentStyle, currentStyleConfig, onContentChange])

  const handleTitleChange = (value: string) => {
    setLocalTitle(value)
    if (onEventTitleChange) {
      onEventTitleChange(value)
    }
  }

  const handleBodyChange = useCallback((htmlContent: string) => {
    onContentChange('body', htmlContent)
    if (!content.format) {
      onContentChange('format', 'html')
    }
  }, [content.format, onContentChange])

  const ActivePanel = EVENT_CONTENT_STYLES[eventContentStyle]?.AdminPanel
  const editorContent = {
    ...content,
    htmlContent: content.body || content.text || '',
  }

  // Template mode owns the layout (style picker + Styling + Settings tabs);
  // instance mode edits per-event values (title + rich text body).
  const contentTab = mode === "template" ? (
    <CardGroup className="grid">
      <Card>
        <CardHeader>
          <DashboardModalCardTitle>Block Style</DashboardModalCardTitle>
          <CardDescription>Choose the content layout for events using this template.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-2 max-w-sm">
            {Object.entries(EVENT_CONTENT_STYLES).map(([key, style]) => (
              <button
                key={key}
                type="button"
                onClick={() => onContentChange('eventContentStyle', key)}
                className={cn(
                  "relative flex items-start gap-3 rounded-lg border p-3 text-left transition-colors",
                  eventContentStyle === key
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-muted-foreground/50 hover:bg-muted/50"
                )}
              >
                <div className={cn(
                  "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                  eventContentStyle === key
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-muted-foreground/30"
                )}>
                  {eventContentStyle === key && <Check className="h-3 w-3" />}
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
        </CardContent>
      </Card>
    </CardGroup>
  ) : (
    <CardGroup className="grid">
      <Card>
        <CardContent>
          <Input
            id="event-title"
            aria-label="Event title"
            value={localTitle}
            onChange={(e) => handleTitleChange(e.target.value)}
            placeholder="Enter event title..."
            className="h-auto border-0 bg-transparent px-0 py-0 text-3xl font-semibold tracking-normal shadow-none outline-none focus-visible:ring-0 md:text-4xl"
          />
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <InlineRichTextEditor
            blockId={blockId}
            content={editorContent}
            onContentChange={handleBodyChange}
            siteId={siteId}
            isActive
            editorPadding={0}
            variant="event"
            placeholder="Write your event content here..."
          />
        </CardContent>
      </Card>
    </CardGroup>
  )

  const tabs = [
    { value: "content", label: "Content", content: contentTab },
    ...(mode === "template"
      ? [
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
              <CardGroup className="grid">
                <VisibilitySettings
                  title="Elements Visibility"
                  visibility={content.visibility}
                  onChange={(visibility) => onContentChange('visibility', visibility)}
                  includeHideBlock={false}
                  useCard
                  fields={[
                    { key: 'showFeaturedImage', label: 'Show Featured Image' },
                  ]}
                />
              </CardGroup>
            ),
          },
        ]
      : []),
  ]

  return (
    <BlockTabs
      onBack={onBack}
      headerClassName="pt-0"
      tabs={tabs}
    />
  )
}
