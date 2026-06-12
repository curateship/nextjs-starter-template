"use client"

import { Card, CardContent, CardGroup, CardHeader } from "@/components/ui/card"
import { BlockTabs } from "@/components/ui/tabs"
import { DashboardModalCardTitle } from "@/components/admin/layout/dashboard/modals"

// Shown when a Listings block is clicked in the category builder: the block has
// no per-category values — all configuration lives in the category template.
export function CategoryListingsInfoBlock() {
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
                  <DashboardModalCardTitle>Listings</DashboardModalCardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  This block is configured from the category template. It automatically lists content related to the category being viewed.
                </CardContent>
              </Card>
            </CardGroup>
          ),
        },
      ]}
    />
  )
}
