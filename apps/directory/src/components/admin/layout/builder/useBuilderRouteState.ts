"use client"

import { useEffect, useState } from "react"
import { useRouter } from "@/lib/navigation-client"

import { useSiteSwitcher } from "@/components/admin/layout/providers/site-switcher-provider"

interface BuilderRouteSiteSyncParams {
  builderPath: string
  queryParam: string
  queryValue: string
  siteId: string
}

interface SelectedBuilderSlugParams<TItem extends { slug: string }> {
  builderPath: string
  items: TItem[]
  queryParam: string
  selectedSlug?: string
  setSelectedSlug?: (slug: string) => void
  siteId: string
  slugFromUrl: string
}

export function useBuilderRouteSiteSync({
  builderPath,
  queryParam,
  queryValue,
  siteId,
}: BuilderRouteSiteSyncParams) {
  const router = useRouter()
  const { currentSite, sites, setCurrentSite } = useSiteSwitcher()

  useEffect(() => {
    if (currentSite?.id === siteId) return

    const routeSite = sites.find((site) => site.id === siteId)
    if (routeSite) {
      setCurrentSite(routeSite)
      return
    }

    if (currentSite) {
      const itemQuery = queryValue ? `?${queryParam}=${encodeURIComponent(queryValue)}` : ''
      router.push(`${builderPath}/${currentSite.id}${itemQuery}`)
    }
  }, [builderPath, currentSite, queryParam, queryValue, router, setCurrentSite, siteId, sites])

  return { currentSite }
}

export function useSelectedBuilderSlug<TItem extends { slug: string }>({
  builderPath,
  items,
  queryParam,
  selectedSlug,
  setSelectedSlug,
  siteId,
  slugFromUrl,
}: SelectedBuilderSlugParams<TItem>) {
  const router = useRouter()

  useEffect(() => {
    if (items.length === 0) return

    const matchingItem = items.find((item) => item.slug === slugFromUrl)
    if (matchingItem) {
      if (selectedSlug !== undefined && selectedSlug !== matchingItem.slug) {
        setSelectedSlug?.(matchingItem.slug)
      }
      return
    }

    const firstItem = items[0]
    if (selectedSlug !== undefined && selectedSlug !== firstItem.slug) {
      setSelectedSlug?.(firstItem.slug)
    }
    if (slugFromUrl !== firstItem.slug) {
      router.replace(`${builderPath}/${siteId}?${queryParam}=${encodeURIComponent(firstItem.slug)}`)
    }
  }, [builderPath, items, queryParam, router, selectedSlug, setSelectedSlug, siteId, slugFromUrl])
}

export function useSyncedBuilderBlocks<TBlocks extends Record<string, any>>(
  blocks: TBlocks,
  options: { shallowCopy?: boolean } = {}
) {
  const [localBlocks, setLocalBlocks] = useState(blocks)

  useEffect(() => {
    setLocalBlocks(options.shallowCopy ? { ...blocks } : blocks)
  }, [blocks, options.shallowCopy])

  return [localBlocks, setLocalBlocks] as const
}
