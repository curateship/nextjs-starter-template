import { type ReactNode } from "react"
import { getSiteBySubdomain } from "@/lib/actions/frontend-actions"
import { FontProvider } from "@/components/frontend/font-provider"

interface DynamicSiteLayoutProps {
  children: ReactNode
  params: Promise<{ subdomain: string }>
}

export default async function DynamicSiteLayout({ 
  children, 
  params 
}: DynamicSiteLayoutProps) {
  const { subdomain } = await params
  
  // Get site data to retrieve font settings
  const { site } = await getSiteBySubdomain(subdomain)
  
  const fontFamily = site?.settings?.font_family || 'playfair-display'
  const fontWeights = site?.settings?.font_weights
  const secondaryFontFamily = site?.settings?.secondary_font_family || 'inter'
  const secondaryFontWeights = site?.settings?.secondary_font_weights
  
  return (
    <>
      <FontProvider 
        fontFamily={fontFamily} 
        fontWeights={fontWeights}
        secondaryFontFamily={secondaryFontFamily}
        secondaryFontWeights={secondaryFontWeights}
      />
      {children}
    </>
  )
}