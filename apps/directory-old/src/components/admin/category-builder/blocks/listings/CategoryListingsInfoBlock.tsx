"use client"

import { Card, CardContent, CardGroup, CardHeader } from "@/components/ui/card"
import { BlockTabs } from "@/components/admin/layout/builder/block-tabs"
import { DashboardModalCardTitle } from "@/components/admin/layout/dashboard/modals"

interface CategoryBlockInfoProps {
  title?: string
  message?: string
}

// Shown when a template-only block is clicked in listing mode: no per-category
// values exist — all configuration lives in the category template.
export function CategoryListingsInfoBlock({
  title = "Listings",
  message = "This block is configured from the category template. It automatically lists content related to the category being viewed.",
}: CategoryBlockInfoProps = {}) {
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
                  <DashboardModalCardTitle>{title}</DashboardModalCardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  {message}
                </CardContent>
              </Card>
            </CardGroup>
          ),
        },
      ]}
    />
  )
}
