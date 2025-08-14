"use client"

import { NavBlock } from "@/components/frontend/layout/shared/NavBlock"
import { FooterBlock } from "@/components/frontend/layout/shared/FooterBlock"
import { type ReactNode } from "react"

interface SiteLayoutProps {
  children: ReactNode
  navigation?: {
    logo?: string
    links?: Array<{ text: string; url: string }>
    buttons?: Array<{ text: string; url: string; style: 'primary' | 'outline' | 'ghost' }>
    style?: { backgroundColor: string; textColor: string }
  }
  footer?: {
    logo?: string
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
          <NavBlock {...navigation} />
        </div>
      </div>
      
      {/* Main content */}
      {children}
      
      {/* Footer */}
      <FooterBlock {...footer} />
    </>
  )
}