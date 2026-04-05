'use client'

import Link from 'next/link'
import { Blocks, Check, ChevronDown, Paintbrush, Settings2 } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  SITE_SETTINGS_CONTENT_TYPES,
  type SiteSettingsContentTypeConfig,
} from '@/components/admin/layout/settings/site-settings-content-types'
import { cn } from '@/lib/utils/tailwind'

interface SiteSettingsHeaderNavProps {
  siteId: string
  activeSection?: 'general' | 'admin-styling' | 'content-types'
  activeContentTypeSlug?: SiteSettingsContentTypeConfig['slug']
}

const navItemClassName =
  'inline-flex h-full items-center justify-center rounded-md px-3 text-sm font-medium transition-all'

export function SiteSettingsHeaderNav({
  siteId,
  activeSection = 'general',
  activeContentTypeSlug,
}: SiteSettingsHeaderNavProps) {
  const isGeneralActive = activeSection === 'general'
  const isAdminStylingActive = activeSection === 'admin-styling'
  const isContentTypeActive = activeSection === 'content-types'
  const activeContentType = activeContentTypeSlug
    ? SITE_SETTINGS_CONTENT_TYPES.find((contentType) => contentType.slug === activeContentTypeSlug)
    : null
  const ContentTypesIcon = activeContentType?.icon || Blocks

  return (
    <div className="inline-flex h-8 items-center gap-1">
      <Link
        href={`/admin/sites/${siteId}/settings`}
        className={cn(
          navItemClassName,
          isGeneralActive ? 'bg-muted text-foreground' : 'hover:bg-muted/50'
        )}
      >
        <Settings2 className="mr-1.5 h-3.5 w-3.5" />
        General Settings
      </Link>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className={cn(
              navItemClassName,
              isContentTypeActive ? 'bg-muted text-foreground' : 'hover:bg-muted/50'
            )}
          >
            <ContentTypesIcon className="mr-1.5 h-3.5 w-3.5" />
            Content Types
            <ChevronDown className="ml-1.5 h-3.5 w-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-56">
          {SITE_SETTINGS_CONTENT_TYPES.map((contentType) => {
            const isActive = activeContentTypeSlug === contentType.slug
            const Icon = contentType.icon

            return (
              <DropdownMenuItem key={contentType.slug} asChild>
                <Link
                  href={`/admin/sites/${siteId}/settings/${contentType.slug}`}
                  className="flex items-center justify-between gap-3"
                >
                  <span className="flex items-center gap-2">
                    <Icon className="h-4 w-4" />
                    <span>{contentType.label}</span>
                  </span>
                  <Check className={cn('h-4 w-4', isActive ? 'opacity-100' : 'opacity-0')} />
                </Link>
              </DropdownMenuItem>
            )
          })}
        </DropdownMenuContent>
      </DropdownMenu>

      <Link
        href={`/admin/sites/${siteId}/settings/admin-styling`}
        className={cn(
          navItemClassName,
          isAdminStylingActive ? 'bg-muted text-foreground' : 'hover:bg-muted/50'
        )}
      >
        <Paintbrush className="mr-1.5 h-3.5 w-3.5" />
        Admin Styling
      </Link>
    </div>
  )
}
