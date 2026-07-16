"use client"

import { use } from "react"
import { SiteChromeEditorPage } from "@/components/admin/layout/builder/SiteChromeEditorPage"

interface PageProps {
  params: Promise<{
    siteId: string
  }>
}

export default function SiteFooterStructurePage({ params }: PageProps) {
  const { siteId } = use(params)
  return <SiteChromeEditorPage siteId={siteId} mode="footer" />
}
