'use client'

import { useCallback, useEffect, useMemo, useState, type ChangeEvent } from 'react'
import { format } from "date-fns"
import ChevronDownIcon from "lucide-react/dist/esm/icons/chevron-down.js"
import Check from "lucide-react/dist/esm/icons/check.js"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { BlockTabs } from "@/components/admin/layout/builder/block-tabs"
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

  // Switching sign-ups off leaves the capacity/price values alone; the save path
  // drops them once the mode is 'none', so flipping back keeps what was typed.
  const registrationMode = content.registrationMode === 'free' || content.registrationMode === 'paid'
    ? content.registrationMode
    : 'none'

  const handleRegistrationModeChange = useCallback((value: string) => {
    onContentChange('registrationMode', value)
  }, [onContentChange])

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

      <FieldGroup className="grid gap-3 md:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="event-venue-name">Venue</FieldLabel>
          <Input
            id="event-venue-name"
            onChange={(event) => onContentChange('venueName', event.target.value)}
            placeholder="Venue name"
            value={typeof content.venueName === "string" ? content.venueName : ""}
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="event-venue-address">Address</FieldLabel>
          <Input
            id="event-venue-address"
            onChange={(event) => onContentChange('venueAddress', event.target.value)}
            placeholder="Street address, city"
            value={typeof content.venueAddress === "string" ? content.venueAddress : ""}
          />
        </Field>
      </FieldGroup>

      <Card>
        <CardHeader>
          <DashboardModalCardTitle>Registration</DashboardModalCardTitle>
          <CardDescription>
            Let people sign up on this page. Turning this on replaces the RSVP URL button above with a
            signup form, and everyone who signs up gets a confirmation email plus a reminder the day before.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {/* Field owns the width here: Field's vertical variant forces its children
              to fill it, so sizing the trigger alone has no effect (same reason
              EventScheduleCard sizes its Field, not its button). */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
            <Field className="sm:w-56 sm:shrink-0">
              <FieldLabel htmlFor="event-registration-mode">Sign-ups</FieldLabel>
              <Select value={registrationMode} onValueChange={handleRegistrationModeChange}>
                <SelectTrigger id="event-registration-mode" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="z-60">
                  <SelectItem value="none">Off</SelectItem>
                  <SelectItem value="free">Free RSVP</SelectItem>
                  <SelectItem value="paid">Paid ticket</SelectItem>
                </SelectContent>
              </Select>
            </Field>

            {registrationMode !== 'none' && (
              <Field className="sm:flex-1">
                <FieldLabel htmlFor="event-capacity">Seats</FieldLabel>
                <Input
                  id="event-capacity"
                  type="number"
                  min={0}
                  step={1}
                  onChange={(event) => onContentChange('capacity', event.target.value)}
                  placeholder="Leave empty for unlimited"
                  value={typeof content.capacity === "number" || typeof content.capacity === "string" ? String(content.capacity) : ""}
                />
                <FieldDescription>
                  How many people can sign up. Leave it empty (or 0) for no limit. Once it fills up, the form
                  says the event is full.
                </FieldDescription>
              </Field>
            )}
          </div>

          {registrationMode === 'paid' && (
            <FieldGroup className="grid gap-3 md:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="event-ticket-price-id">Stripe price ID</FieldLabel>
                <Input
                  id="event-ticket-price-id"
                  onChange={(event) => onContentChange('ticketPriceId', event.target.value)}
                  placeholder="price_1234..."
                  value={typeof content.ticketPriceId === "string" ? content.ticketPriceId : ""}
                />
                <FieldDescription>
                  Create the ticket price in Stripe and paste its ID here. Stripe holds the real amount, so
                  nobody can change what they are charged. Without a valid ID the ticket button stays hidden.
                </FieldDescription>
              </Field>

              <Field>
                <FieldLabel htmlFor="event-ticket-price-label">Price shown on the button</FieldLabel>
                <Input
                  id="event-ticket-price-label"
                  maxLength={40}
                  onChange={(event) => onContentChange('ticketPriceLabel', event.target.value)}
                  placeholder="$25"
                  value={typeof content.ticketPriceLabel === "string" ? content.ticketPriceLabel : ""}
                />
                <FieldDescription>Display only — write it however you want people to read it.</FieldDescription>
              </Field>
            </FieldGroup>
          )}
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
