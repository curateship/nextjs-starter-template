"use client"

import { AdminLayout, AdminPageHeader, AdminCard } from "@/components/admin/layout/admin-layout"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"

export default function NewslettersPage() {
  return (
    <AdminLayout>
      <div className="w-full">
        <AdminPageHeader
          title="Newsletters"
          subtitle="Manage your AI-generated newsletter content"
          primaryAction={{
            label: "Create Newsletter",
            href: "/admin/newsletters/new"
          }}
        />
        
        <AdminCard>
          <div className="p-6 border-b">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-semibold">Newsletters</h3>
              <Tabs defaultValue="all">
                <TabsList className="gap-1">
                  <TabsTrigger value="all">All</TabsTrigger>
                  <TabsTrigger value="published">Published</TabsTrigger>
                  <TabsTrigger value="draft">Draft</TabsTrigger>
                  <TabsTrigger value="review">Review</TabsTrigger>
                  <TabsTrigger value="archived">Archived</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          </div>
          
          <div className="divide-y">
            {/* Newsletter 1 */}
            <div className="p-6 flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className="w-12 h-12 bg-muted rounded-lg flex items-center justify-center">
                  <span className="text-muted-foreground text-sm font-medium">📧</span>
                </div>
                <div>
                  <h4 className="font-medium">Weekly Tech Digest</h4>
                  <p className="text-sm text-muted-foreground">Latest trends in artificial intelligence and machine learning</p>
                </div>
              </div>
              <div className="flex items-center space-x-4">
                <span className="text-sm text-muted-foreground">Created: 2 days ago</span>
                <span className="px-2 py-1 text-xs bg-green-100 text-green-800 rounded-full">Published</span>
              </div>
            </div>

            {/* Newsletter 2 */}
            <div className="p-6 flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className="w-12 h-12 bg-muted rounded-lg flex items-center justify-center">
                  <span className="text-muted-foreground text-sm font-medium">🤖</span>
                </div>
                <div>
                  <h4 className="font-medium">AI Innovation Monthly</h4>
                  <p className="text-sm text-muted-foreground">Comprehensive overview of AI breakthroughs and industry insights</p>
                </div>
              </div>
              <div className="flex items-center space-x-4">
                <span className="text-sm text-muted-foreground">Created: 1 week ago</span>
                <span className="px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded-full">Review</span>
              </div>
            </div>

            {/* Newsletter 3 */}
            <div className="p-6 flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className="w-12 h-12 bg-muted rounded-lg flex items-center justify-center">
                  <span className="text-muted-foreground text-sm font-medium">💡</span>
                </div>
                <div>
                  <h4 className="font-medium">Startup Spotlight</h4>
                  <p className="text-sm text-muted-foreground">Featuring promising startups and emerging technologies</p>
                </div>
              </div>
              <div className="flex items-center space-x-4">
                <span className="text-sm text-muted-foreground">Created: 2 weeks ago</span>
                <span className="px-2 py-1 text-xs bg-yellow-100 text-yellow-800 rounded-full">Draft</span>
              </div>
            </div>

            {/* Newsletter 4 */}
            <div className="p-6 flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className="w-12 h-12 bg-muted rounded-lg flex items-center justify-center">
                  <span className="text-muted-foreground text-sm font-medium">🔬</span>
                </div>
                <div>
                  <h4 className="font-medium">Research Roundup</h4>
                  <p className="text-sm text-muted-foreground">Latest academic papers and research findings in tech</p>
                </div>
              </div>
              <div className="flex items-center space-x-4">
                <span className="text-sm text-muted-foreground">Created: 3 weeks ago</span>
                <span className="px-2 py-1 text-xs bg-green-100 text-green-800 rounded-full">Published</span>
              </div>
            </div>

            {/* Newsletter 5 */}
            <div className="p-6 flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className="w-12 h-12 bg-muted rounded-lg flex items-center justify-center">
                  <span className="text-muted-foreground text-sm font-medium">📈</span>
                </div>
                <div>
                  <h4 className="font-medium">Market Analysis Weekly</h4>
                  <p className="text-sm text-muted-foreground">Financial markets and investment insights powered by AI analysis</p>
                </div>
              </div>
              <div className="flex items-center space-x-4">
                <span className="text-sm text-muted-foreground">Created: 1 month ago</span>
                <span className="px-2 py-1 text-xs bg-gray-100 text-gray-800 rounded-full">Archived</span>
              </div>
            </div>
          </div>
        </AdminCard>
      </div>
    </AdminLayout>
  )
}