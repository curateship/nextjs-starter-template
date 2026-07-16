import MapPinned from "lucide-react/dist/esm/icons/map-pinned.js"
import {
  getDirectoryGoogleMapEmbedUrl,
  normalizeDirectoryGoogleMapHeight
} from "@/lib/actions/directories/directory-google-map"
import { Card, CardContent } from "@/components/ui/card"
import type { HTMLAttributes } from "react"

interface DirectoryGoogleMapBlockProps {
  content?: {
    locationQuery?: string
    caption?: string
    height?: number | string
    visibility?: Record<string, boolean>
  }
  isPreview?: boolean
  apiKey?: string | null
  cardProps?: HTMLAttributes<HTMLDivElement>
}

export function DirectoryGoogleMapBlock({
  content,
  isPreview = false,
  apiKey,
  cardProps
}: DirectoryGoogleMapBlockProps) {
  const visibility = content?.visibility && typeof content.visibility === "object" ? content.visibility : {}

  if (visibility.hideBlock === true) {
    return null
  }

  const locationQuery = typeof content?.locationQuery === "string" ? content.locationQuery.trim() : ""
  const caption = typeof content?.caption === "string" ? content.caption.trim() : ""
  const height = normalizeDirectoryGoogleMapHeight(content?.height)
  const embedUrl = getDirectoryGoogleMapEmbedUrl(locationQuery, apiKey)
  const showMap = visibility.map !== false
  const showCaption = visibility.caption !== false && caption.length > 0

  if (!showMap && !showCaption) {
    return null
  }

  if (showMap && !embedUrl && !isPreview) {
    return null
  }

  const { className: cardClassName, ...rootProps } = cardProps || {}

  return (
    <Card {...rootProps} className={cardClassName}>
      <CardContent>
        {showMap ? (
          embedUrl ? (
            <iframe
              title={locationQuery ? `Google map for ${locationQuery}` : "Google map"}
              src={embedUrl}
              loading="lazy"
              allowFullScreen
              referrerPolicy="no-referrer-when-downgrade"
              className="w-full rounded-xl border-0"
              style={{ height }}
            />
          ) : (
            <div
              className="flex items-center justify-center rounded-xl border border-dashed bg-muted/30 text-center text-sm text-muted-foreground"
              style={{ height }}
            >
              <div className="space-y-2 px-5">
                <MapPinned className="mx-auto h-5 w-5" />
                <p>{locationQuery ? "Google Maps API key is not configured." : "Add a location to show the map."}</p>
              </div>
            </div>
          )
        ) : null}

        {showCaption ? <p className="px-1 pt-3 text-sm leading-6 text-muted-foreground">{caption}</p> : null}
      </CardContent>
    </Card>
  )
}
