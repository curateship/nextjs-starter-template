import type { EventContentStyleRendererProps } from "./index"
import { buttonVariants } from "@/components/ui/button"
import { sanitizeRichHtml } from "@/lib/utils/html-sanitizer"
import { sanitizeExternalHttpUrl } from "@/lib/utils/url-validator"

function formatEventDateTime(eventDate?: string, eventTime?: string) {
  const dateMatch = eventDate?.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!dateMatch) return ""

  const [, yearValue, monthValue, dayValue] = dateMatch
  const year = Number(yearValue)
  const month = Number(monthValue)
  const day = Number(dayValue)
  const date = new Date(year, month - 1, day)
  const dateLabel = new Intl.DateTimeFormat("en", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(date)

  const timeMatch = eventTime?.match(/^([01]\d|2[0-3]):([0-5]\d)$/)
  if (!timeMatch) return dateLabel

  const [, hourValue, minuteValue] = timeMatch
  const timeDate = new Date(year, month - 1, day, Number(hourValue), Number(minuteValue))
  const timeLabel = new Intl.DateTimeFormat("en", {
    hour: "numeric",
    minute: "2-digit",
  }).format(timeDate)

  return `${dateLabel} at ${timeLabel}`
}

export function DefaultEventContentRenderer({ config, sharedContent }: EventContentStyleRendererProps) {
  const alignment = config.alignment || 'center'
  const contentMaxWidth = config.contentMaxWidth as number | undefined
  const titleSize = config.titleSize || 'large'

  const {
    title,
    featuredImage,
    showFeaturedImage = true,
    eventDate,
    eventTime,
    venueName,
    venueAddress,
    externalCtaUrl,
    body,
  } = sharedContent

  const isCenter = alignment === 'center'

  const titleSizeMap: Record<string, string> = {
    'medium': 'text-3xl md:text-4xl',
    'large': 'text-4xl md:text-5xl',
    'extra-large': 'text-5xl md:text-6xl',
  }
  const titleClasses = titleSizeMap[titleSize] || 'text-4xl md:text-5xl'

  const htmlContent = sanitizeRichHtml(body || '')
  const dateTimeLabel = formatEventDateTime(eventDate, eventTime)
  const cleanVenueName = typeof venueName === 'string' ? venueName.trim() : ''
  const cleanVenueAddress = typeof venueAddress === 'string' ? venueAddress.trim() : ''
  const directionsQuery = cleanVenueAddress || cleanVenueName
  const directionsUrl = directionsQuery
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(directionsQuery)}`
    : ''
  const ctaUrl = sanitizeExternalHttpUrl(externalCtaUrl)

  return (
    <div
      className={`flex flex-col ${isCenter ? 'items-center text-center' : 'items-start text-left'} gap-4 w-full`}
      style={contentMaxWidth ? { maxWidth: `${contentMaxWidth}px` } : undefined}
    >
      <h1 className={`text-pretty ${titleClasses} font-semibold`}>
        {title}
      </h1>
      {dateTimeLabel && (
        <p className="text-sm font-medium text-muted-foreground md:text-base">
          {dateTimeLabel}
        </p>
      )}
      {(cleanVenueName || cleanVenueAddress) && (
        <div className="text-sm text-muted-foreground md:text-base">
          {cleanVenueName && <p className="font-medium text-foreground">{cleanVenueName}</p>}
          {cleanVenueAddress && <p>{cleanVenueAddress}</p>}
          {directionsUrl && (
            <a
              href={directionsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              Directions
            </a>
          )}
        </div>
      )}
      {ctaUrl && (
        <a
          href={ctaUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={buttonVariants({ size: 'lg' })}
        >
          RSVP
        </a>
      )}
      {featuredImage && showFeaturedImage && (
        <img
          src={featuredImage}
          alt={title || 'Event image'}
          className="mt-4 aspect-video w-full rounded-lg border object-cover"
        />
      )}
      {htmlContent && (
        <div
          className="prose dark:prose-invert max-w-none w-full mt-6"
        >
          <div
            className={`text-lg text-gray-600 dark:text-gray-400`}
            dangerouslySetInnerHTML={{ __html: htmlContent }}
          />
        </div>
      )}
    </div>
  )
}
