"use client"

import { Card, CardContent, CardGroup, CardHeader } from "@/components/ui/card"
import { BlockTabs } from "@/components/ui/tabs"
import { DashboardModalCardTitle } from "@/components/admin/layout/dashboard/modals"

export function DirectoryRelatedListingBlock() {
  return (
    <BlockTabs
      headerClassName="pt-0"
      tabs={[
        {
          value: "content",
          label: "Content",
          content: (
            <CardGroup className="grid">
              <Card>
                <CardHeader>
                  <DashboardModalCardTitle>Related Listing</DashboardModalCardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  This block is configured from the directory template.
                </CardContent>
              </Card>
            </CardGroup>
          ),
        },
      ]}
    />
  )
}
