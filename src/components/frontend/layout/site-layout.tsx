"use client"

import { NavBlock } from "@/components/frontend/pages/PageNavigationBlock"
import { FooterBlock } from "@/components/frontend/pages/PageFooterBlock"
import { type ReactNode } from "react"

interface SiteLayoutProps {
  children: ReactNode
  site?: {
    id: string
    subdomain: string
    name?: string
    settings?: {
      favicon?: string
      [key: string]: any
    }
  }
  navigation?: {
    logo?: string
    logoUrl?: string
    links?: Array<{ text: string; url: string }>
    buttons?: Array<{ text: string; url: string; style: 'primary' | 'outline' | 'ghost' }>
    style?: { backgroundColor: string; textColor: string }
  }
  footer?: {
    logo?: string
    logoUrl?: string
    copyright?: string
    links?: Array<{ text: string; url: string }>
    socialLinks?: Array<{ platform: string; url: string }>
    style?: { backgroundColor: string; textColor: string }
  }
}

export function SiteLayout({ children, site, navigation, footer }: SiteLayoutProps) {
  return (
    <>
      {/* Navigation - only render if navigation data exists */}
      {navigation && (
        <div className="sticky top-0 z-50">
          <div>
            <NavBlock {...navigation} site={site} />
          </div>
        </div>
      )}
      
      {/* Main content */}
      {children}
      
      {/* Footer - only render if footer data exists */}
      {footer && <FooterBlock {...footer} site={site} />}
    </>
  )
}