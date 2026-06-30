'use client'

import { useCallback, useEffect, useMemo, useState, type ChangeEvent } from 'react'
import { format } from "date-fns"
import { ChevronDownIcon, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { BlockTabs } from "@/components/ui/tabs"
import { Card, CardContent, CardDescription, CardGroup, CardHeader } from "@/components/ui/card"
import { VisibilitySettings } from "@/components/admin/layout/builder/VisibilitySettings"
import { DashboardModalCardTitle } from "@/components/admin/layout/dashboard/modals"
import { cn } from "@/lib/utils/tailwind"
import { InlineRichTextEditor } from "@/components/admin/layout/builder/InlineRichTextEditor"
import { EVENT_CONTENT_STYLES } from "./event-content-styles"

const DEFAULT_EVENT_TIME = "12:00"

function formatEventDateValue(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")

  return `${year}-${month}-${day}`
}

function parseEventDateValue(value: unknown) {
  if (typeof value !== "string" || !value) return undefined

  const [year, month, day] = value.split("-").map(Number)
  if (!year || !month || !day) return undefined

  return new Date(year, month - 1, day)
}

function getEventTimeValue(value: unknown) {
  if (typeof value !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return DEFAULT_EVENT_TIME

  return value
}

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
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false)

  const eventContentStyle = content.eventContentStyle || 'default'
  const selectedDate = useMemo(() => parseEventDateValue(content.eventDate), [content.eventDate])
  const selectedTime = getEventTimeValue(content.eventTime)
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

  const handleDateSelect = useCallback((date: Date | undefined) => {
    if (!date) {
      onContentChange('eventDate', '')
      onContentChange('eventTime', '')
      return
    }

    onContentChange('eventDate', formatEventDateValue(date))
    if (!content.eventTime) {
      onContentChange('eventTime', DEFAULT_EVENT_TIME)
    }
  }, [content.eventTime, onContentChange])

  const handleTimeChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    onContentChange('eventTime', getEventTimeValue(event.target.value))
  }, [onContentChange])

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

      <FieldGroup className="flex-row flex-nowrap items-start gap-3">
        <Field className="w-52 shrink-0">
          <FieldLabel htmlFor="event-date">Date</FieldLabel>
          <Popover open={isDatePickerOpen} onOpenChange={setIsDatePickerOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                id="event-date"
                className="w-52 justify-between font-normal"
              >
                <span className="truncate">
                  {selectedDate ? format(selectedDate, "PPP") : "Select date"}
                </span>
                <ChevronDownIcon className="size-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto overflow-hidden p-3" align="start">
              <Calendar
                mode="single"
                className="p-0"
                selected={selectedDate}
                captionLayout="dropdown"
                defaultMonth={selectedDate}
                onSelect={(date) => {
                  handleDateSelect(date)
                  setIsDatePickerOpen(false)
                }}
              />
            </PopoverContent>
          </Popover>
        </Field>
        <Field className="w-32 shrink-0">
          <FieldLabel htmlFor="event-time">Time</FieldLabel>
          <Input
            className="appearance-none bg-background [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-calendar-picker-indicator]:appearance-none"
            id="event-time"
            onChange={handleTimeChange}
            type="time"
            value={selectedTime}
          />
        </Field>

        <Field className="min-w-0 flex-1">
          <FieldLabel htmlFor="event-external-cta-url">RSVP URL</FieldLabel>
          <Input
            id="event-external-cta-url"
            inputMode="url"
            onChange={(event) => onContentChange('externalCtaUrl', event.target.value)}
            placeholder="https://tickets.example.com"
            type="url"
            value={typeof content.externalCtaUrl === "string" ? content.externalCtaUrl : ""}
          />
        </Field>
      </FieldGroup>
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
