'use client'

import Link from 'next/link'
import { Search, Settings2, Wrench } from 'lucide-react'
import { cn } from '@/lib/utils/tailwind'

interface SiteSettingsHeaderNavProps {
  siteId: string
  activeSection?: 'general' | 'seo' | 'site-tools'
}

const navItemClassName =
  'inline-flex h-full items-center justify-center rounded-md px-3 text-sm font-medium transition-all'

export function SiteSettingsHeaderNav({
  siteId,
  activeSection = 'general',
}: SiteSettingsHeaderNavProps) {
  const isGeneralActive = activeSection === 'general'
  const isSeoActive = activeSection === 'seo'
  const isSiteToolsActive = activeSection === 'site-tools'

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

      <Link
        href={`/admin/sites/${siteId}/settings/seo`}
        className={cn(
          navItemClassName,
          isSeoActive ? 'bg-muted text-foreground' : 'hover:bg-muted/50'
        )}
      >
        <Search className="mr-1.5 h-3.5 w-3.5" />
        SEO
      </Link>

      <Link
        href={`/admin/sites/${siteId}/settings/site-tools`}
        className={cn(
          navItemClassName,
          isSiteToolsActive ? 'bg-muted text-foreground' : 'hover:bg-muted/50'
        )}
      >
        <Wrench className="mr-1.5 h-3.5 w-3.5" />
        Site Tools
      </Link>
    </div>
  )
}
