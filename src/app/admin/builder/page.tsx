"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { AdminLayout, AdminPageHeader, AdminCard } from "@/components/admin/layout/admin-layout"
import { Button } from "@/components/ui/button"
import { Globe, ArrowRight } from "lucide-react"
import { useSiteContext } from "@/contexts/site-context"

export default function SiteBuilderPage() {
  const router = useRouter()
  const { currentSite, sites, loading } = useSiteContext()

  useEffect(() => {
    if (currentSite) {
      router.push(`/admin/builder/${currentSite.id}`)
    }
  }, [currentSite, router])

  if (loading) {
    return <LoadingState />
  }

  if (sites.length === 0) {
    return <NoSitesState />
  }

  return <SiteSelectionState sites={sites} router={router} />
}

function LoadingState() {
  return (
    <AdminLayout>
      <div className="w-full max-w-4xl mx-auto">
        <div className="p-8 text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading sites...</p>
        </div>
      </div>
    </AdminLayout>
  )
}

function NoSitesState() {
  return (
    <AdminLayout>
      <div className="w-full max-w-4xl mx-auto">
        <AdminPageHeader
          title="Site Builder"
          subtitle="Build and customize your sites with visual blocks"
        />
        
        <AdminCard>
          <div className="p-12 text-center">
            <Globe className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Sites Yet</h3>
            <p className="text-muted-foreground mb-6">
              Create your first site to start building with visual blocks
            </p>
            <Button asChild>
              <a href="/admin/sites/new">
                Create Your First Site
                <ArrowRight className="ml-2 h-4 w-4" />
              </a>
            </Button>
          </div>
        </AdminCard>
      </div>
    </AdminLayout>
  )
}

function SiteSelectionState({ sites, router }: { sites: any[], router: any }) {
  return (
    <AdminLayout>
      <div className="w-full max-w-4xl mx-auto">
        <AdminPageHeader
          title="Site Builder"
          subtitle="Build and customize your sites with visual blocks"
        />
        
        <AdminCard>
          <div className="p-12 text-center">
            <Globe className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">Select a Site to Build</h3>
            <p className="text-muted-foreground mb-6">
              Use the site switcher in the sidebar to select a site, or choose one from your sites below
            </p>
            
            <div className="grid gap-4 max-w-md mx-auto">
              {sites.map((site) => (
                <Button
                  key={site.id}
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() => router.push(`/admin/builder/${site.id}`)}
                >
                  <Globe className="h-4 w-4 mr-2" />
                  <div className="text-left">
                    <div className="font-medium">{site.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {site.subdomain}.domain.com
                    </div>
                  </div>
                </Button>
              ))}
            </div>
          </div>
        </AdminCard>
      </div>
    </AdminLayout>
  )
}