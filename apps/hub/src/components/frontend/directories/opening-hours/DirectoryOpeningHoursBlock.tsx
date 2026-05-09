"use client"

import { useEffect, useMemo, useState } from "react"
import type { HTMLAttributes, ReactNode } from "react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import type {
  DirectoryOpeningHoursAttribution,
  DirectoryOpeningHoursData
} from "@/lib/actions/directories/directory-opening-hours"
import { normalizeDirectoryOpeningHoursPlaceId } from "@/lib/actions/directories/directory-opening-hours"
import { cn } from "@/lib/utils/tailwind"

interface DirectoryOpeningHoursBlockProps {
  content?: {
    title?: string
    placeId?: string
    visibility?: Record<string, boolean>
  }
  isPreview?: boolean
  siteId?: string
  cardProps?: HTMLAttributes<HTMLDivElement>
}

function OpeningHoursCard({
  title,
  showTitle,
  children,
  footer,
  cardProps
}: {
  title: string
  showTitle: boolean
  children?: ReactNode
  footer?: ReactNode
  cardProps?: HTMLAttributes<HTMLDivElement>
}) {
  const { className: cardClassName, ...rootProps } = cardProps || {}

  return (
    <Card {...rootProps} className={cardClassName}>
      <CardContent>
        {showTitle ? <h2 className="text-2xl font-semibold tracking-normal text-foreground">{title}</h2> : null}
        {children ? <div className={cn(showTitle && "mt-8")}>{children}</div> : null}
        {footer ? <div className="mt-8 space-y-3 border-t pt-5">{footer}</div> : null}
      </CardContent>
    </Card>
  )
}

function AttributionText({ attributions }: { attributions: DirectoryOpeningHoursAttribution[] }) {
  const providers = attributions.filter((item) => !/^google( maps)?$/i.test(item.provider))

  return (
    <p className="text-xs leading-5 text-muted-foreground">
      Data from <span translate="no">Google Maps</span>
      {providers.length > 0 ? (
        <>
          {" "}
          and{" "}
          {providers.map((item, index) => (
            <span key={`${item.provider}-${index}`}>
              {item.providerUri ? (
                <a
                  href={item.providerUri}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-2"
                >
                  {item.provider}
                </a>
              ) : (
                item.provider
              )}
              {index < providers.length - 1 ? ", " : ""}
            </span>
          ))}
        </>
      ) : null}
      .
    </p>
  )
}

export function DirectoryOpeningHoursBlock({
  content,
  isPreview = false,
  siteId,
  cardProps
}: DirectoryOpeningHoursBlockProps) {
  const visibility = content?.visibility && typeof content.visibility === "object" ? content.visibility : {}
  const hideBlock = visibility.hideBlock === true
  const placeId = normalizeDirectoryOpeningHoursPlaceId(content?.placeId)
  const title = typeof content?.title === "string" && content.title.trim() ? content.title.trim() : "Business Hours"
  const [data, setData] = useState<DirectoryOpeningHoursData | null>(null)

  const requestPath = useMemo(() => {
    if (!placeId || hideBlock) return ""

    const params = new URLSearchParams({ placeId })
    if (isPreview && siteId) {
      params.set("siteId", siteId)
    }

    return `/api/directories/opening-hours?${params.toString()}`
  }, [hideBlock, isPreview, placeId, siteId])

  useEffect(() => {
    let cancelled = false

    setData(null)

    if (!requestPath) {
      return
    }

    fetch(requestPath, { cache: "no-store" })
      .then(async (response) => {
        const result = await response.json().catch(() => null)
        if (!response.ok || result?.error) {
          throw new Error(result?.error || "Opening hours unavailable")
        }
        return result?.data as DirectoryOpeningHoursData | null
      })
      .then((result) => {
        if (!cancelled) {
          setData(result)
        }
      })
      .catch(() => {})

    return () => {
      cancelled = true
    }
  }, [requestPath])

  if (hideBlock) return null

  const showTitle = visibility.title !== false
  const showHours = visibility.hours !== false
  const showOpenChip = visibility.openChip !== false
  const showTimezone = visibility.timezone !== false && data?.timeZone

  if (!showTitle && !showHours && !showTimezone) {
    return null
  }

  if (!placeId) {
    return <OpeningHoursCard title={title} showTitle={showTitle} cardProps={cardProps} />
  }

  if (!data) {
    return <OpeningHoursCard title={title} showTitle={showTitle} cardProps={cardProps} />
  }

  return (
    <OpeningHoursCard
      title={title}
      showTitle={showTitle}
      cardProps={cardProps}
      footer={
        <>
          {showTimezone ? <p className="text-base leading-7 text-muted-foreground">Timezone: {data.timeZone}</p> : null}
          <AttributionText attributions={data.attributions} />
        </>
      }
    >
      {showHours ? (
        <div className="space-y-5">
          {data.rows.map((row) => (
            <div
              key={row.day}
              className={cn(
                "flex items-center justify-between gap-4 text-lg leading-7 text-muted-foreground",
                row.isToday && "font-semibold text-foreground"
              )}
            >
              <div className="flex min-w-0 items-center gap-2">
                <span>{row.day}</span>
                {row.isToday && data.openNow && showOpenChip ? (
                  <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">
                    Open
                  </Badge>
                ) : null}
              </div>
              <span className="shrink-0 text-right font-semibold text-foreground">{row.hours}</span>
            </div>
          ))}
        </div>
      ) : null}
    </OpeningHoursCard>
  )
}
