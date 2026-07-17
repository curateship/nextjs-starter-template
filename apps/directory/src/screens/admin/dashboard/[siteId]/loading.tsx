import { AdminLayout } from "@/components/admin/layout/admin-layout"
import { StickyHeader } from "@/components/admin/layout/stickybar/StickyHeader"
import { Card, CardGroup } from "@/components/ui/card"

// Skeleton mirrors the scoped dashboard: combined chart card, Automations + Notifications
// panels, then the "Your sites" table.
export default function Loading() {
  return (
    <>
      <StickyHeader />
      <AdminLayout>
        <CardGroup className="grid w-full min-w-0 gap-3">
          <Card className="min-w-0 overflow-hidden rounded-xl">
            <div className="grid grid-cols-2 border-b lg:grid-cols-4">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="flex flex-col gap-2 px-4 py-4 [&:nth-child(odd)]:border-r lg:[&:nth-child(2)]:border-r">
                  <div className="h-4 w-20 animate-pulse rounded bg-muted" />
                  <div className="h-7 w-24 animate-pulse rounded bg-muted" />
                </div>
              ))}
            </div>
            <div className="flex items-start justify-between gap-4 px-4 pt-4 sm:px-5">
              <div className="space-y-2">
                <div className="h-5 w-40 animate-pulse rounded bg-muted" />
                <div className="h-4 w-56 animate-pulse rounded bg-muted" />
              </div>
              <div className="h-8 w-[278px] max-w-full animate-pulse rounded-md bg-muted" />
            </div>
            <div className="px-2 pb-4 sm:px-3">
              <div className="h-[360px] w-full" />
            </div>
          </Card>

          <CardGroup className="grid gap-3 lg:grid-cols-2">
            {[...Array(2)].map((_, i) => (
              <Card key={i} className="flex min-w-0 flex-col rounded-xl">
                <div className="flex items-center justify-between gap-3 p-4">
                  <div className="h-6 w-28 animate-pulse rounded bg-muted" />
                  <div className="h-8 w-32 animate-pulse rounded-md bg-muted" />
                </div>
                <div className="flex flex-col gap-2 border-t p-2">
                  {[...Array(3)].map((_, j) => (
                    <div key={j} className="flex items-center gap-3 p-2">
                      <div className="size-9 shrink-0 animate-pulse rounded-full bg-muted" />
                      <div className="flex-1 space-y-2">
                        <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
                        <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            ))}
          </CardGroup>

          <Card className="rounded-xl">
            <div className="flex items-center justify-between gap-3 p-4">
              <div className="h-6 w-24 animate-pulse rounded bg-muted" />
              <div className="h-8 w-40 animate-pulse rounded-md bg-muted" />
            </div>
            <div className="space-y-3 border-t p-4">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="h-10 w-10 shrink-0 animate-pulse rounded-lg bg-muted" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-40 animate-pulse rounded bg-muted" />
                    <div className="h-3 w-28 animate-pulse rounded bg-muted" />
                  </div>
                  <div className="h-8 w-[140px] animate-pulse rounded bg-muted" />
                </div>
              ))}
            </div>
          </Card>
        </CardGroup>
      </AdminLayout>
    </>
  )
}
