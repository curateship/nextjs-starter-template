"use client"

import { use } from "react"
import { AdminLayout } from "@/components/admin/layout/admin-layout"
import { StickyHeader } from "@/components/admin/layout/stickybar/StickyHeader"
import { MailAccountsDashboard } from "@/components/admin/mail/MailAccountsDashboard"

interface SiteEmailPageProps {
  params: Promise<{
    siteId: string
  }>
}

export default function SiteEmailPage({ params }: SiteEmailPageProps) {
  const { siteId } = use(params)

  return (
    <>
      <StickyHeader />
      <AdminLayout noPadding>
        <MailAccountsDashboard siteId={siteId} />
      </AdminLayout>
    </>
  )
}
