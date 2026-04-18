"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import {
  buildDirectoryActionHref,
  buildDirectoryContactHref,
  getDirectoryContactButtonLabel,
  isExternalHref,
} from "@/lib/actions/directories/directory-content"
import type { DirectoryContentStyleRendererProps } from "./index"

function resolveMediaUrl(url?: string | null) {
  const trimmedUrl = url?.trim() || ''
  if (!trimmedUrl) return ''

  if (trimmedUrl.startsWith('r2://')) {
    return `/api/media/proxy?url=${encodeURIComponent(trimmedUrl)}`
  }

  return trimmedUrl
}

export function ListingDefaultDirectoryContentRenderer({
  sharedContent,
}: DirectoryContentStyleRendererProps) {
  const [canHover, setCanHover] = useState(false)
  const [isHovered, setIsHovered] = useState(false)

  useEffect(() => {
    const mediaQuery = window.matchMedia('(hover: hover) and (pointer: fine)')
    const updateCanHover = () => {
      setCanHover(mediaQuery.matches)
      if (!mediaQuery.matches) {
        setIsHovered(false)
      }
    }

    updateCanHover()

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', updateCanHover)
      return () => mediaQuery.removeEventListener('change', updateCanHover)
    }

    mediaQuery.addListener(updateCanHover)
    return () => mediaQuery.removeListener(updateCanHover)
  }, [])

  const title = sharedContent.title || 'Directory Listing'
  const aboutHtml = sharedContent.body || sharedContent.description || ''
  const breadcrumbTrail = sharedContent.breadcrumbTrail || []
  const contactButtons = (sharedContent.contactButtons || [])
    .map((button) => ({
      ...button,
      href: buildDirectoryContactHref(button),
      label: getDirectoryContactButtonLabel(button),
    }))
    .filter((button) => button.href)

  const featuredImageUrl = sharedContent.showFeaturedImage === false ? '' : resolveMediaUrl(sharedContent.featuredImage)
  const hoverVideoUrl = canHover ? resolveMediaUrl(sharedContent.hoverVideoUrl) : ''
  const claimHref = buildDirectoryActionHref(sharedContent.claimButton?.url)
  const claimLabel = sharedContent.claimButton?.label?.trim() || 'Claim Listing'
  const showClaimButton = sharedContent.claimButton?.enabled && claimHref

  return (
    <section className="grid gap-10 py-10 lg:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)] lg:items-start">
      <div className="space-y-6">
        {sharedContent.showBreadcrumb !== false ? (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
            <span>Directories</span>
            {breadcrumbTrail.map((item) => (
              <div key={item.id} className="flex items-center gap-2">
                <span>/</span>
                <Link href={`/categories/${item.slug}`} className="transition-colors hover:text-foreground">
                  {item.title}
                </Link>
              </div>
            ))}
            <div className="flex items-center gap-2">
              <span>/</span>
              <span className="text-foreground">{title}</span>
            </div>
          </div>
        ) : null}

        <div className="space-y-4">
          <h1 className="max-w-3xl text-pretty text-4xl font-semibold tracking-tight md:text-5xl">
            {title}
          </h1>

          {aboutHtml ? (
            <div className="prose prose-neutral max-w-none text-base text-muted-foreground">
              <div dangerouslySetInnerHTML={{ __html: aboutHtml }} />
            </div>
          ) : null}
        </div>

        {contactButtons.length > 0 ? (
          <div className="flex flex-wrap gap-3 pt-2">
            {contactButtons.map((button) => (
              <Button
                key={button.id || `${button.type}-${button.href}`}
                asChild
                variant="outline"
                className="rounded-full px-5"
              >
                <a
                  href={button.href}
                  target={button.type === 'website' && isExternalHref(button.href) ? "_blank" : undefined}
                  rel={button.type === 'website' && isExternalHref(button.href) ? "noreferrer" : undefined}
                >
                  {button.label}
                </a>
              </Button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="relative">
        <div
          className="relative min-h-[420px] overflow-hidden rounded-[28px] border bg-muted/40"
          onMouseEnter={() => {
            if (hoverVideoUrl) {
              setIsHovered(true)
            }
          }}
          onMouseLeave={() => setIsHovered(false)}
        >
          {featuredImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={featuredImageUrl}
              alt={title}
              className="absolute inset-0 h-full w-full object-cover"
            />
          ) : (
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,hsl(var(--muted-foreground)/0.16),transparent_55%)]" />
          )}

          {hoverVideoUrl && isHovered ? (
            <video
              key={hoverVideoUrl}
              src={hoverVideoUrl}
              autoPlay
              muted
              loop
              playsInline
              className="absolute inset-0 h-full w-full object-cover"
            />
          ) : null}

          <div className="absolute inset-x-0 bottom-0 h-40 bg-linear-to-t from-background via-background/75 to-transparent" />

          {showClaimButton ? (
            <div className="absolute bottom-5 left-5 z-10">
              <Button asChild className="rounded-full px-5 shadow-sm">
                <a
                  href={claimHref}
                  target={isExternalHref(claimHref) ? "_blank" : undefined}
                  rel={isExternalHref(claimHref) ? "noreferrer" : undefined}
                >
                  {claimLabel}
                </a>
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  )
}
