import { type ReactNode } from "react"

interface DynamicSiteLayoutProps {
  children: ReactNode
  params: Promise<{ subdomain: string }>
}

export default async function DynamicSiteLayout({ 
  children, 
  params 
}: DynamicSiteLayoutProps) {
  // Simple layout wrapper - the actual layout components are in the page
  return (
    <>
      {children}
    </>
  )
}