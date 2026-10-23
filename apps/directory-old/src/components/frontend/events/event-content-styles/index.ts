import { ComponentType, ReactNode } from "react"
import { DefaultEventContentRenderer } from "./DefaultEventContentRenderer"

export interface EventContentStyleRendererProps {
  config: Record<string, any>
  sharedContent: {
    title?: string
    featuredImage?: string | null
    showFeaturedImage?: boolean
    eventDate?: string
    eventTime?: string
    venueName?: string
    venueAddress?: string
    externalCtaUrl?: string
    body?: string
    /** Absolute URL of this event page, used for add-to-calendar links. */
    eventUrl?: string
    /** Absolute URL of the site-wide events feed, used for one-click subscribe. */
    feedUrl?: string
    /** Site + slug the registration panel needs to talk to the server. */
    siteId?: string
    eventSlug?: string
    /** 'free' or 'paid' turns on the RSVP / ticket panel. */
    registrationMode?: string
    /** Display-only ticket price shown on the buy button. */
    ticketPriceLabel?: string
  }
  children?: ReactNode
}

export const EVENT_CONTENT_STYLE_RENDERERS: Record<string, ComponentType<EventContentStyleRendererProps>> = {
  default: DefaultEventContentRenderer,
}
