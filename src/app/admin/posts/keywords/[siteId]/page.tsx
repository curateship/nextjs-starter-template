"use client"

import { useState, useEffect } from "react"
import { use } from "react"
import { useRouter } from "next/navigation"
import { AdminLayout, AdminCard } from "@/components/admin/layout/admin-layout"
import { AdminPageHeader } from "@/components/admin/layout/dashboard/AdminPageHeader"
import { StickyHeader } from "@/components/admin/post-builder/StickyHeader"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Search, Loader2 } from "lucide-react"
import { useSiteContext } from "@/contexts/site-context"
import { KeywordResearchPanel } from "@/components/admin/posts/keywords/KeywordResearchPanel"
import { KeywordLibraryPanel } from "@/components/admin/posts/keywords/KeywordLibraryPanel"
import { getSavedKeywordsAction } from "@/lib/actions/posts/keyword-actions"

export default function KeywordsPage({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = use(params)
  const router = useRouter()
  const { currentSite } = useSiteContext()
  const [activeTab, setActiveTab] = useState<'research' | 'library'>('research')
  const [libraryRefresh, setLibraryRefresh] = useState(0)
  const [researchCount, setResearchCount] = useState(0)
  const [libraryCount, setLibraryCount] = useState(0)

  // Search state lifted up so input lives in the header
  const [seedKeyword, setSeedKeyword] = useState("")
  const [searchTrigger, setSearchTrigger] = useState(0)
  const [isResearching, setIsResearching] = useState(false)

  // Load library count on mount
  useEffect(() => {
    async function loadLibraryCount() {
      const { data } = await getSavedKeywordsAction(siteId)
      if (data) setLibraryCount(data.length)
    }
    loadLibraryCount()
  }, [siteId])

  // Redirect when site changes in sidebar
  useEffect(() => {
    if (currentSite && currentSite.id !== siteId) {
      router.push(`/admin/posts/keywords/${currentSite.id}`)
    }
  }, [currentSite, siteId, router])

  const handleResearch = () => {
    if (!seedKeyword.trim() || isResearching) return
    setSearchTrigger(prev => prev + 1)
  }

  const handleKeywordsLoaded = (count: number) => {
    setResearchCount(count)
    setLibraryRefresh(prev => prev + 1)
  }

  const handleLibraryCountChange = (count: number) => {
    setLibraryCount(count)
  }

  return (
    <>
      <StickyHeader
        breadcrumbItems={[
          { href: "/admin", label: "Dashboard" },
          { href: "/admin/posts", label: "Posts" },
          { label: "Keywords", isPage: true }
        ]}
      />
      <AdminLayout>
        <div className="w-full">
          <AdminPageHeader
            title="Keyword Research"
            subtitle="Discover and save keywords for your content strategy"
            extraContent={
              <div className="flex gap-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="Enter a seed keyword..."
                    value={seedKeyword}
                    onChange={(e) => setSeedKeyword(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleResearch()}
                    className="w-64 pl-10 pr-4 py-2 border rounded-md bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
                <Button onClick={handleResearch} disabled={isResearching || !seedKeyword.trim()}>
                  {isResearching ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Researching...
                    </>
                  ) : (
                    'Research'
                  )}
                </Button>
              </div>
            }
          />

          <AdminCard>
            <div className="p-6 border-b">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-lg font-semibold">Keywords</h3>
                  <div className="text-sm text-muted-foreground mt-1">
                    {activeTab === 'research'
                      ? `${researchCount} keyword${researchCount !== 1 ? 's' : ''} found`
                      : `${libraryCount} keyword${libraryCount !== 1 ? 's' : ''} saved`
                    }
                  </div>
                </div>
                <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'research' | 'library')}>
                  <TabsList className="gap-1">
                    <TabsTrigger value="research">Research ({researchCount})</TabsTrigger>
                    <TabsTrigger value="library">Library ({libraryCount})</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
            </div>

            {activeTab === 'research' ? (
              <KeywordResearchPanel
                siteId={siteId}
                seedKeyword={seedKeyword}
                searchTrigger={searchTrigger}
                onKeywordsLoaded={handleKeywordsLoaded}
                onLoadingChange={setIsResearching}
              />
            ) : (
              <KeywordLibraryPanel
                siteId={siteId}
                refreshTrigger={libraryRefresh}
                onCountChange={handleLibraryCountChange}
              />
            )}
          </AdminCard>
        </div>
      </AdminLayout>
    </>
  )
}
