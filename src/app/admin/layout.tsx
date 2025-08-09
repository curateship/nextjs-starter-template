import type { Metadata } from "next"
import { SiteProvider } from "@/contexts/site-context"

export const metadata: Metadata = {
  title: "Admin Dashboard",
  description: "Admin dashboard for managing the application",
}

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <SiteProvider>
      <div className="min-h-screen bg-background">
        {children}
      </div>
    </SiteProvider>
  )
}