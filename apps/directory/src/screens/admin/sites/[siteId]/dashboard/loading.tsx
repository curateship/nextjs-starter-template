import { AdminLayout } from "@/components/admin/layout/admin-layout"
import { StickyHeader } from "@/components/admin/layout/stickybar/StickyHeader"
import { Card, CardContent, CardGroup, CardHeader } from "@/components/ui/card"

export default function Loading() {
  return (
    <>
      <StickyHeader />
      <AdminLayout>
        <CardGroup className="grid">
          <div className="flex max-w-full flex-col gap-3 overflow-x-auto sm:flex-row sm:items-center sm:justify-between lg:gap-6">
            <div className="h-9 w-[268px] max-w-full animate-pulse rounded-md bg-muted" />
            <div className="flex shrink-0 items-center gap-2 sm:justify-end">
              <div className="h-9 w-24 animate-pulse rounded-md bg-muted" />
              <div className="h-9 w-24 animate-pulse rounded-md bg-muted" />
              <div className="h-9 w-28 animate-pulse rounded-md bg-muted" />
            </div>
          </div>

          <CardGroup className="grid sm:grid-cols-2 lg:grid-cols-4">
            {[...Array(4)].map((_, i) => (
              <Card key={i} className="shadow-none">
                <CardHeader className="flex-row items-center justify-between space-y-0">
                  <div className="flex items-center gap-2">
                    <div className="h-4 w-4 animate-pulse rounded-full bg-muted" />
                    <div className="h-4 w-20 animate-pulse rounded bg-muted" />
                  </div>
                  <div className="h-4 w-14 animate-pulse rounded bg-muted" />
                </CardHeader>
              </Card>
            ))}
          </CardGroup>

          <Card className="shadow-none">
            <CardHeader className="gap-4 space-y-0 sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-2">
                <div className="h-6 w-24 animate-pulse rounded bg-muted" />
                <div className="h-4 w-48 animate-pulse rounded bg-muted" />
              </div>
              <div className="h-9 w-[278px] max-w-full animate-pulse rounded-md bg-muted" />
            </CardHeader>
            <CardContent>
              <div className="h-[360px] w-full" />
            </CardContent>
          </Card>

          <CardGroup className="grid lg:grid-cols-2">
            {[...Array(2)].map((_, i) => (
              <Card key={i} className="shadow-none">
                <CardHeader>
                  <div className="h-6 w-28 animate-pulse rounded bg-muted" />
                </CardHeader>
                <CardContent className="space-y-3">
                  {[...Array(4)].map((_, j) => (
                    <div key={j} className="flex items-center justify-between gap-4">
                      <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
                      <div className="h-4 w-20 animate-pulse rounded bg-muted" />
                    </div>
                  ))}
                </CardContent>
              </Card>
            ))}
          </CardGroup>
        </CardGroup>
      </AdminLayout>
    </>
  )
}
