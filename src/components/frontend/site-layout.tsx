"use client"

import { NavBlock } from "@/components/frontend/layout/shared/NavBlock"
import { FooterBlock } from "@/components/frontend/layout/shared/FooterBlock"
import { type ReactNode } from "react"

interface SiteLayoutProps {
  children: ReactNode
  navigation?: {
    logo?: string
    links?: Array<{ text: string; url: string }>
    style?: { backgroundColor: string; textColor: string }
  }
  footer?: {
    copyright?: string
    links?: Array<{ text: string; url: string }>
    socialLinks?: Array<{ platform: string; url: string }>
    style?: { backgroundColor: string; textColor: string }
  }
}

export function SiteLayout({ children, navigation, footer }: SiteLayoutProps) {
  return (
    <>
      {/* Navigation */}
      <div className="sticky top-0 z-50">
        <div>
          <NavBlock 
            logo={navigation?.logo}
            links={navigation?.links}
            style={navigation?.style}
          />
        </div>
      </div>
      
      {/* Main content */}
      {children}
      
      {/* Footer */}
      <FooterBlock 
        copyright={footer?.copyright}
        links={footer?.links}
        socialLinks={footer?.socialLinks}
        style={footer?.style}
      />
    </>
  )
}