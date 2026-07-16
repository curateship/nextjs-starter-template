"use client"

import { useEffect, useMemo, useState } from "react"
import type { HTMLAttributes, ReactNode } from "react"
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
    sourceMode?: string
    placeId?: string
    hoursText?: string
    visibility?: Record<string, boolean>
  }
  sourceType?: string | null
  sourceId?: string | null
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
        {showTitle ? (
          <h2 className="text-xl font-semibold tracking-normal text-foreground">{title}</h2>
        ) : null}
        {children ? <div className={cn(showTitle && "mt-4")}>{children}</div> : null}
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

type OpeningHoursDisplayRow = {
  day: string
  hours: string
  isToday?: boolean
}

function OpeningHoursRows({ rows }: { rows: OpeningHoursDisplayRow[] }) {
  const todayRow = rows.find((row) => row.isToday)
  const orderedRows = todayRow ? [todayRow, ...rows.filter((row) => !row.isToday)] : rows

  return (
    <div className="space-y-2.5">
      {orderedRows.map((row, index) => {
        const highlighted = index === 0 && row.isToday

        return (
          <div
            key={`${row.day}-${index}`}
            className={cn(
              "flex items-center justify-between gap-4 text-sm leading-6 text-muted-foreground",
              highlighted && "text-base font-semibold text-foreground"
            )}
          >
            <span>{row.day}</span>
            <span className={cn("shrink-0 text-right", highlighted && "text-foreground")}>{row.hours}</span>
          </div>
        )
      })}
    </div>
  )
}

function parseHoursTextRows(value: string): OpeningHoursDisplayRow[] {
  const today = new Intl.DateTimeFormat("en-US", { weekday: "long" }).format(new Date()).toLowerCase()

  return value
    .split("\n")
    .flatMap((line) => {
      const text = line.trim()
      const separatorIndex = text.indexOf(":")
      if (!text || separatorIndex === -1) return []

      const day = text.slice(0, separatorIndex).trim()
      const hours = text.slice(separatorIndex + 1).trim()
      if (!day || !hours) return []

      return [{
        day,
        hours,
        isToday: day.toLowerCase() === today,
      }]
    })
}

export function DirectoryOpeningHoursBlock({
  content,
  sourceType,
  sourceId,
  isPreview = false,
  siteId,
  cardProps
}: DirectoryOpeningHoursBlockProps) {
  const visibility = content?.visibility && typeof content.visibility === "object" ? content.visibility : {}
  const hideBlock = visibility.hideBlock === true
  const sourceMode = content?.sourceMode === "text" ? "text" : "google"
  const placeId = sourceMode === "google"
    ? normalizeDirectoryOpeningHoursPlaceId(content?.placeId) || (sourceType === "google_maps" ? normalizeDirectoryOpeningHoursPlaceId(sourceId) : "")
    : ""
  const hoursText = typeof content?.hoursText === "string" ? content.hoursText.trim() : ""
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
  const showTimezone = visibility.timezone !== false && data?.timeZone

  if (!showTitle && !showHours && !showTimezone) {
    return null
  }

  if (sourceMode === "text") {
    const textRows = parseHoursTextRows(hoursText)
    if (!showTitle && (!showHours || !hoursText)) return null

    return (
      <OpeningHoursCard title={title} showTitle={showTitle} cardProps={cardProps}>
        {showHours && textRows.length ? <OpeningHoursRows rows={textRows} /> : null}
      </OpeningHoursCard>
    )
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
        <OpeningHoursRows rows={data.rows} />
      ) : null}
    </OpeningHoursCard>
  )
}
