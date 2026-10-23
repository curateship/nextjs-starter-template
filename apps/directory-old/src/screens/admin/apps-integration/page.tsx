import { AdminLayout } from "@/components/admin/layout/admin-layout"
import { DashboardSubheader } from "@/components/admin/layout/dashboard/DashboardSubheader"
import { StickyHeader } from "@/components/admin/layout/stickybar/StickyHeader"
import { Card } from "@/components/ui/card"
import { CardTableHeader } from "@/components/shared/card-sections"

export default function AppsIntegrationPage() {
  return (
    <>
      <StickyHeader />
      <AdminLayout>
        <div className="w-full">
          <DashboardSubheader
            items={[{ label: "Platform Settings", href: "/admin/platforms/settings" }, { label: "Apps Integration" }]}
          />

          <Card>
            <CardTableHeader className="grid-cols-7">
              <div className="col-span-2 text-[0.8125rem]">App</div>
              <div className="text-[0.8125rem]">Launch URL</div>
              <div className="text-[0.8125rem]">Auth</div>
              <div className="text-[0.8125rem]">Billing</div>
              <div className="text-[0.8125rem]">Status</div>
              <div className="text-[0.8125rem]">Actions</div>
            </CardTableHeader>

            <div className="divide-y divide-muted/80">
              <div className="p-8 text-center">
                <p className="text-muted-foreground">No linked apps found</p>
              </div>
            </div>
          </Card>
        </div>
      </AdminLayout>
    </>
  )
}
